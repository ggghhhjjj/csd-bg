import { describe, expect, it } from 'vitest';

import { escapeCsvField, tabularToCsv, tabularToMarkdown } from './tabular-export';
import { TabularExportService } from './tabular-export.service';
import type { TabularExportData } from './tabular-export.types';

function sampleData(): TabularExportData {
  return {
    headers: ['Date', 'Total shares', 'Shareholders'],
    rows: [['2024-01-02', '100', '10']],
  };
}

describe('escapeCsvField', () => {
  it('quotes fields containing commas or quotes', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('tabularToCsv', () => {
  it('writes a header row with comma delimiter', () => {
    expect(tabularToCsv(sampleData())).toBe('Date,Total shares,Shareholders\n2024-01-02,100,10');
  });

  it('escapes comma-containing header labels', () => {
    const data: TabularExportData = {
      headers: ['Date', 'Shares, total'],
      rows: [['2024-01-02', '100']],
    };
    expect(tabularToCsv(data)).toBe('Date,"Shares, total"\n2024-01-02,100');
  });
});

describe('tabularToMarkdown', () => {
  it('writes a pipe table with separator row', () => {
    expect(tabularToMarkdown(sampleData())).toBe(
      [
        '| Date | Total shares | Shareholders |',
        '| --- | --- | --- |',
        '| 2024-01-02 | 100 | 10 |',
      ].join('\n'),
    );
  });
});

describe('TabularExportService', () => {
  it('formats CSV and markdown from tabular data', () => {
    const service = new TabularExportService();
    expect(service.formatCsv(sampleData())).toContain('Date,Total shares,Shareholders');
    expect(service.formatMarkdown({ headers: ['Date', 'Free float'], rows: [['2024-01-02', '50']] })).toContain(
      '| Date | Free float |',
    );
  });

  it('copies formatted text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const service = new TabularExportService();
    await service.copyCsv(sampleData());
    expect(writeText).toHaveBeenCalledOnce();
    expect(service.copied()).toBe(true);
    vi.unstubAllGlobals();
  });
});
