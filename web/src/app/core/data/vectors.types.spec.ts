import { describe, expect, it } from 'vitest';

import { rangeStartIso } from './date-range';
import {
  firstLastInRange,
  formatDelta,
  isVectorsConfig,
  type ParsedDataset,
} from './vectors.types';

function datasetFixture(): ParsedDataset {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    dates: ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'],
    issuers: [{ id: 1, isin: 'BG000', name: 'Test' }],
    totalShares: new Int32Array([0, 100, 0, 150]),
    freeFloat: new Int32Array([0, 0, 0, 0]),
    shareholders: new Int32Array([0, 10, 12, 0]),
    totalSharesValid: new Uint8Array([0, 1, 0, 1]),
    freeFloatValid: new Uint8Array([0, 0, 0, 0]),
    shareholdersValid: new Uint8Array([0, 1, 1, 0]),
  };
}

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

describe('firstLastInRange', () => {
  it('skips null endpoints and uses first/last valid values', () => {
    expect(firstLastInRange(datasetFixture(), 'total_shares', 0, 0, 3)).toEqual({
      first: 100,
      last: 150,
    });
  });
});

describe('formatDelta', () => {
  it('formats absolute and percent change', () => {
    expect(formatDelta(100, 150, false)).toBe('+50');
    expect(formatDelta(100, 150, true)).toBe('+50.00%');
    expect(formatDelta(null, 150, true)).toBe('—');
  });
});


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
