import { describe, expect, it } from 'vitest';

import { rangeStartIso } from './date-range';
import {
  firstLastInRange,
  formatBasisForRangeChange,
  formatDelta,
  isVectorsConfig,
  metricChangeAtRangeEndpoints,
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

describe('metricChangeAtRangeEndpoints', () => {
  it('uses values on the range start and end dates only', () => {
    const dataset = endpointDataset();
    expect(metricChangeAtRangeEndpoints(dataset, 'shareholders', 0, 0, 1)).toEqual({
      start: 100,
      end: 110,
      diff: 10,
    });
    expect(firstLastInRange(dataset, 'shareholders', 1, 0, 1)).toEqual({ first: 50, last: 50 });
    expect(metricChangeAtRangeEndpoints(dataset, 'shareholders', 1, 0, 1)).toEqual({
      start: null,
      end: 50,
      diff: 50,
    });
  });

  it('treats a missing end as a delisting', () => {
    const dataset = endpointDataset();
    expect(metricChangeAtRangeEndpoints(dataset, 'shareholders', 2, 0, 1)).toEqual({
      start: 20,
      end: null,
      diff: -20,
    });
  });
});

function endpointDataset(): ParsedDataset {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    dates: ['2024-06-23', '2024-06-24'],
    issuers: [
      { id: 1, isin: 'A', name: 'A' },
      { id: 2, isin: 'B', name: 'B' },
      { id: 3, isin: 'C', name: 'C' },
    ],
    totalShares: new Int32Array(6),
    freeFloat: new Int32Array(6),
    shareholders: new Int32Array([100, 110, 0, 50, 20, 0]),
    totalSharesValid: new Uint8Array(6),
    freeFloatValid: new Uint8Array(6),
    shareholdersValid: Uint8Array.from([1, 1, 0, 1, 1, 0]),
  };
}

describe('formatBasisForRangeChange', () => {
  it('maps listing and delisting endpoints for display', () => {
    expect(formatBasisForRangeChange(null, 194)).toEqual({ first: 0, last: 194 });
    expect(formatBasisForRangeChange(4, null)).toEqual({ first: 4, last: 0 });
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
