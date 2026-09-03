import { describe, expect, it } from 'vitest';

import {
  buildExportRows,
  escapeCsvField,
  formatExportValue,
  toCsv,
  toMarkdownTable,
  type ChartExportRow,
} from './chart-export';
import { ChartExportService, type ChartExportRequest } from './chart-export.service';
import type { ParsedDataset } from '../core/data/vectors.types';

function datasetFixture(): ParsedDataset {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    dates: ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'],
    issuers: [{ id: 1, isin: 'BG000', name: 'Test' }],
    totalShares: new Int32Array([0, 100, 0, 150]),
    freeFloat: new Int32Array([0, 50, 60, 0]),
    shareholders: new Int32Array([0, 10, 12, 0]),
    totalSharesValid: new Uint8Array([0, 1, 0, 1]),
    freeFloatValid: new Uint8Array([0, 1, 1, 0]),
    shareholdersValid: new Uint8Array([0, 1, 1, 0]),
  };
}

function exportRequest(overrides: Partial<ChartExportRequest> = {}): ChartExportRequest {
  return {
    dataset: datasetFixture(),
    issuerIndex: 0,
    viewStart: '2024-01-02',
    viewEnd: '2024-01-04',
    metrics: ['total_shares', 'shareholders'],
    dateLabel: 'Date',
    metricLabels: {
      total_shares: 'Total shares',
      free_float: 'Free float',
      shareholders: 'Shareholders',
    },
    ...overrides,
  };
}

describe('formatExportValue', () => {
  it('formats null as em dash', () => {
    expect(formatExportValue(null)).toBe('—');
  });

  it('formats numbers with locale grouping', () => {
    expect(formatExportValue(1500)).toBe((1500).toLocaleString());
  });
});

describe('buildExportRows', () => {
  it('returns rows for the visible date range and selected metrics only', () => {
    const dataset = datasetFixture();
    const rows = buildExportRows(dataset, 0, '2024-01-02', '2024-01-04', ['total_shares', 'shareholders']);
    expect(rows).toEqual([
      {
        date: '2024-01-02',
        values: [formatExportValue(100), formatExportValue(10)],
      },
      {
        date: '2024-01-03',
        values: ['—', formatExportValue(12)],
      },
      {
        date: '2024-01-04',
        values: [formatExportValue(150), '—'],
      },
    ]);
  });

  it('returns an empty list when no metrics are selected', () => {
    expect(buildExportRows(datasetFixture(), 0, '2024-01-01', '2024-01-04', [])).toEqual([]);
  });
});

describe('escapeCsvField', () => {
  it('quotes fields containing commas or quotes', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('toCsv', () => {
  it('writes a header row with comma delimiter', () => {
    const rows: ChartExportRow[] = [{ date: '2024-01-02', values: ['100', '10'] }];
    expect(toCsv('Date', ['Total shares', 'Shareholders'], rows)).toBe(
      'Date,Total shares,Shareholders\n2024-01-02,100,10',
    );
  });
});

describe('toMarkdownTable', () => {
  it('writes a pipe table with separator row', () => {
    const rows: ChartExportRow[] = [{ date: '2024-01-02', values: ['100', '10'] }];
    expect(toMarkdownTable('Date', ['Total shares', 'Shareholders'], rows)).toBe(
      [
        '| Date | Total shares | Shareholders |',
        '| --- | --- | --- |',
        '| 2024-01-02 | 100 | 10 |',
      ].join('\n'),
    );
  });
});

describe('ChartExportService', () => {
  it('formats CSV through the service using the current chart view request', () => {
    const service = new ChartExportService();
    const csv = service.formatCsv(exportRequest());
    expect(csv).toContain('Date,Total shares,Shareholders');
    expect(csv).toContain('2024-01-02');
    expect(csv).not.toContain('2024-01-01');
  });

  it('formats markdown through the service', () => {
    const service = new ChartExportService();
    const markdown = service.formatMarkdown(exportRequest({ metrics: ['free_float'] }));
    expect(markdown).toContain('| Date | Free float |');
    expect(markdown).toContain('| 2024-01-02 | 50 |');
  });

  it('copies formatted text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const service = new ChartExportService();
    await service.copyCsv(exportRequest());
    expect(writeText).toHaveBeenCalledOnce();
    expect(service.copied()).toBe(true);
    vi.unstubAllGlobals();
  });
});
