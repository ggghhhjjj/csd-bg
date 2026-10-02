import { describe, expect, it } from 'vitest';

import type { ParsedDataset, VectorCatalogEntry } from '../core/data/vectors.types';
import {
  aggregateShareholdersDaily,
  hasShareholdersAggregateData,
  issuersWithShareholderChangeInRange,
} from './shareholders-daily-aggregate';

describe('aggregateShareholdersDaily', () => {
  it('aggregates losses, gains, and total for the user A/B/C example on date X', () => {
    const dataset = packDataset(
      [
        { id: 1, isin: 'A', name: 'Emitter A' },
        { id: 2, isin: 'B', name: 'Emitter B' },
        { id: 3, isin: 'C', name: 'Emitter C' },
      ],
      ['2024-06-01', '2024-06-02'],
      [
        [502, 500],
        [1295, 1300],
        [610, 600],
      ],
    );

    const result = aggregateShareholdersDaily(dataset, '2024-06-02', '2024-06-02');

    expect(result.dates).toEqual(['2024-06-02']);
    expect(result.losses).toEqual([12]);
    expect(result.gains).toEqual([5]);
    expect(result.totalShareholders).toEqual([2400]);
    expect(result.totalShareholdersChanged).toEqual([2400]);
    expect(result.totalShareholdersChangedInPeriod).toEqual([2400]);
  });

  it('excludes unchanged issuers from the changed total', () => {
    const dataset = packDataset(
      [
        { id: 1, isin: 'A', name: 'Emitter A' },
        { id: 2, isin: 'B', name: 'Emitter B' },
        { id: 3, isin: 'C', name: 'Emitter C' },
        { id: 4, isin: 'D', name: 'Emitter D' },
      ],
      ['2024-06-01', '2024-06-02'],
      [
        [502, 500],
        [1295, 1300],
        [610, 600],
        [1000, 1000],
      ],
    );

    const result = aggregateShareholdersDaily(dataset, '2024-06-02', '2024-06-02');
    expect(result.totalShareholders).toEqual([3400]);
    expect(result.totalShareholdersChanged).toEqual([2400]);
    expect(result.totalShareholdersChangedInPeriod).toEqual([2400]);
  });

  it('includes issuers with mid-period change even when start and end counts match', () => {
    const dataset = packDataset(
      [
        { id: 1, isin: 'A', name: 'Volatile A' },
        { id: 2, isin: 'B', name: 'Stable B' },
      ],
      ['2024-06-01', '2024-06-02', '2024-06-03'],
      [
        [100, 110, 100],
        [1000, 1000, 1000],
      ],
    );

    const result = aggregateShareholdersDaily(dataset, '2024-06-01', '2024-06-03');
    expect(result.totalShareholders).toEqual([1100, 1110, 1100]);
    expect(result.totalShareholdersChangedInPeriod).toEqual([100, 110, 100]);
    expect(result.totalShareholdersChanged).toEqual([0, 110, 100]);
  });

  it('uses zero gains/losses on the global first dataset date', () => {
    const dataset = packDataset(
      [{ id: 1, isin: 'A', name: 'Emitter A' }],
      ['2024-06-01', '2024-06-02'],
      [[100, 90]],
    );

    const first = aggregateShareholdersDaily(dataset, '2024-06-01', '2024-06-01');
    expect(first.losses).toEqual([0]);
    expect(first.gains).toEqual([0]);
    expect(first.totalShareholders).toEqual([100]);
    expect(first.totalShareholdersChanged).toEqual([0]);
    expect(first.totalShareholdersChangedInPeriod).toEqual([0]);
  });

  it('excludes issuers missing a prior value from delta sums', () => {
    const dataset = packDataset(
      [
        { id: 1, isin: 'A', name: 'A' },
        { id: 2, isin: 'B', name: 'B' },
      ],
      ['2024-06-01', '2024-06-02'],
      [
        [100, 90],
        [null, 50],
      ],
    );

    const result = aggregateShareholdersDaily(dataset, '2024-06-02', '2024-06-02');
    expect(result.losses).toEqual([10]);
    expect(result.gains).toEqual([0]);
    expect(result.totalShareholders).toEqual([140]);
    expect(result.totalShareholdersChanged).toEqual([90]);
    expect(result.totalShareholdersChangedInPeriod).toEqual([90]);
  });

  it('returns empty series when the dataset has no dates', () => {
    const dataset = packDataset([{ id: 1, isin: 'A', name: 'A' }], [], []);
    expect(aggregateShareholdersDaily(dataset, '2024-06-01', '2024-06-01')).toEqual({
      dates: [],
      losses: [],
      gains: [],
      totalShareholders: [],
      totalShareholdersChanged: [],
      totalShareholdersChangedInPeriod: [],
    });
  });
});

describe('issuersWithShareholderChangeInRange', () => {
  it('marks issuers with any day-over-day change in the range', () => {
    const dataset = packDataset(
      [
        { id: 1, isin: 'A', name: 'A' },
        { id: 2, isin: 'B', name: 'B' },
      ],
      ['2024-06-01', '2024-06-02', '2024-06-03'],
      [
        [100, 110, 100],
        [50, 50, 50],
      ],
    );

    const flags = issuersWithShareholderChangeInRange(dataset, 0, 2);
    expect(Array.from(flags)).toEqual([1, 0]);
  });
});

describe('hasShareholdersAggregateData', () => {
  it('is false when there are no dates or all totals are zero', () => {
    expect(
      hasShareholdersAggregateData({
        dates: [],
        losses: [],
        gains: [],
        totalShareholders: [],
        totalShareholdersChanged: [],
        totalShareholdersChangedInPeriod: [],
      }),
    ).toBe(false);
    expect(
      hasShareholdersAggregateData({
        dates: ['2024-06-01'],
        losses: [0],
        gains: [0],
        totalShareholders: [0],
        totalShareholdersChanged: [0],
        totalShareholdersChangedInPeriod: [0],
      }),
    ).toBe(false);
  });

  it('is true when at least one day has a positive total', () => {
    expect(
      hasShareholdersAggregateData({
        dates: ['2024-06-01'],
        losses: [0],
        gains: [0],
        totalShareholders: [2400],
        totalShareholdersChanged: [2400],
        totalShareholdersChangedInPeriod: [2400],
      }),
    ).toBe(true);
  });
});

function packDataset(
  issuers: VectorCatalogEntry[],
  dates: string[],
  series: Array<Array<number | null>>,
): ParsedDataset {
  const cellCount = issuers.length * dates.length;
  const shareholders = new Int32Array(cellCount);
  const shareholdersValid = new Uint8Array(cellCount);
  series.forEach((values, issuerIndex) => {
    values.forEach((value, dateIndex) => {
      if (value === null) {
        return;
      }
      const offset = issuerIndex * dates.length + dateIndex;
      shareholders[offset] = value;
      shareholdersValid[offset] = 1;
    });
  });
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    dates,
    issuers,
    totalShares: new Int32Array(cellCount),
    freeFloat: new Int32Array(cellCount),
    shareholders,
    totalSharesValid: new Uint8Array(cellCount),
    freeFloatValid: new Uint8Array(cellCount),
    shareholdersValid,
  };
}
