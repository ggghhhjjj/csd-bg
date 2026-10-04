import { describe, expect, it } from 'vitest';

import {
  buildExportRows,
  chartExportToTabular,
  formatExportValue,
  toCsv,
  toMarkdownTable,
} from './chart-export';
import type { ChartExportRequest } from './chart-export.types';
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

describe('chartExportToTabular', () => {
  it('maps chart export rows to tabular headers and rows', () => {
    expect(chartExportToTabular(exportRequest())).toEqual({
      headers: ['Date', 'Total shares', 'Shareholders'],
      rows: [
        ['2024-01-02', formatExportValue(100), formatExportValue(10)],
        ['2024-01-03', '—', formatExportValue(12)],
        ['2024-01-04', formatExportValue(150), '—'],
      ],
    });
  });
});

describe('toCsv', () => {
  it('writes a header row with comma delimiter', () => {
    expect(toCsv('Date', ['Total shares', 'Shareholders'], [{ date: '2024-01-02', values: ['100', '10'] }])).toBe(
      'Date,Total shares,Shareholders\n2024-01-02,100,10',
    );
  });
});

describe('toMarkdownTable', () => {
  it('writes a pipe table with separator row', () => {
    expect(
      toMarkdownTable('Date', ['Total shares', 'Shareholders'], [{ date: '2024-01-02', values: ['100', '10'] }]),
    ).toBe(
      [
        '| Date | Total shares | Shareholders |',
        '| --- | --- | --- |',
        '| 2024-01-02 | 100 | 10 |',
      ].join('\n'),
    );
  });
});
