import { describe, expect, it } from 'vitest';

import { isVectorsConfig } from './vectors.types';
import { rangeStartIso } from './date-range';

describe('isVectorsConfig', () => {
  it('accepts four http(s) URLs', () => {
    expect(
      isVectorsConfig({
        manifestUrl: 'https://example.com/manifest.json',
        catalogUrl: 'https://example.com/catalog.json',
        datesUrl: 'https://example.com/dates.arrow',
        seriesUrl: 'http://example.com/series.arrow',
      }),
    ).toBe(true);
  });

  it('rejects missing or non-http URLs', () => {
    expect(
      isVectorsConfig({
        manifestUrl: 'https://example.com/manifest.json',
        catalogUrl: 'https://example.com/catalog.json',
        datesUrl: 'https://example.com/dates.arrow',
        seriesUrl: '/local.arrow',
      }),
    ).toBe(false);
  });
});

describe('rangeStartIso', () => {
  const dates = ['2024-01-02', '2024-01-03', '2024-01-04', '2024-06-01', '2024-12-31'];

  it('uses last five data days', () => {
    expect(rangeStartIso(dates, 'd5')).toBe('2024-01-02');
  });

  it('uses max history', () => {
    expect(rangeStartIso(dates, 'max')).toBe('2024-01-02');
  });
});
