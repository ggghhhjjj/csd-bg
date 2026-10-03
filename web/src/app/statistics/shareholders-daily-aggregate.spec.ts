import { describe, expect, it } from 'vitest';

import { loadRepoVectorsDataset } from '../core/data/vectors-repo-fixture';
import { metricAt, type ParsedDataset, type VectorCatalogEntry } from '../core/data/vectors.types';
import {
  aggregateShareholdersDaily,
  hasShareholdersAggregateData,
  issuersWithShareholderChangeInRange,
} from './shareholders-daily-aggregate';

function dayMetrics(
  aggregate: ReturnType<typeof aggregateShareholdersDaily>,
  iso: string,
): {
  totalShareholders: number;
  totalShareholdersChanged: number;
} {
  const index = aggregate.dates.indexOf(iso);
  expect(index).toBeGreaterThanOrEqual(0);
  return {
    totalShareholders: aggregate.totalShareholders[index],
    totalShareholdersChanged: aggregate.totalShareholdersChanged[index],
  };
}

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

  it('uses period bounds for changed-in-period while chart range spans all dates', () => {
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

    const full = aggregateShareholdersDaily(dataset, '2024-06-01', '2024-06-03', {
      periodFrom: '2024-06-02',
      periodTo: '2024-06-02',
    });

    expect(full.dates).toEqual(['2024-06-01', '2024-06-02', '2024-06-03']);
    expect(full.totalShareholdersChangedInPeriod).toEqual([100, 110, 100]);

    const narrowPeriod = aggregateShareholdersDaily(dataset, '2024-06-01', '2024-06-03', {
      periodFrom: '2024-06-01',
      periodTo: '2024-06-01',
    });
    expect(narrowPeriod.totalShareholdersChangedInPeriod).toEqual([0, 0, 0]);
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

  it('sums today counts for issuers with a prior-report delta, not the delta itself', () => {
    const dataset = packDataset(
      [
        { id: 1, isin: 'A', name: 'Small move' },
        { id: 2, isin: 'B', name: 'Large unchanged base' },
      ],
      ['2024-06-01', '2024-06-02'],
      [
        [100, 105],
        [10_000, 10_000],
      ],
    );

    const result = aggregateShareholdersDaily(dataset, '2024-06-02', '2024-06-02');
    expect(result.totalShareholders).toEqual([10_105]);
    expect(result.totalShareholdersChanged).toEqual([105]);
    expect(result.gains).toEqual([5]);
    expect(result.totalShareholders[0] - 10_100).toBe(5);
    expect(result.totalShareholdersChanged[0]).not.toBe(5);
  });

  it('does not tie day-over-day changed totals to net market movement', () => {
    const dataset = packDataset(
      [
        { id: 1, isin: 'A', name: 'Was changing' },
        { id: 2, isin: 'B', name: 'Starts changing' },
        { id: 3, isin: 'C', name: 'Stable' },
      ],
      ['2024-06-01', '2024-06-02', '2024-06-03'],
      [
        [100, 110, 110],
        [200, 200, 250],
        [1000, 1000, 1000],
      ],
    );

    const result = aggregateShareholdersDaily(dataset, '2024-06-01', '2024-06-03');
    const june2 = dayMetrics(result, '2024-06-02');
    const june3 = dayMetrics(result, '2024-06-03');

    expect(june3.totalShareholders - june2.totalShareholders).toBe(50);
    expect(june3.totalShareholdersChanged - june2.totalShareholdersChanged).toBe(140);
    expect(june2.totalShareholdersChanged).toBe(110);
    expect(june3.totalShareholdersChanged).toBe(250);
  });
});

describe('aggregateShareholdersDaily (repo vectors 2026-06-23 / 2026-06-24)', () => {
  const dataset = loadRepoVectorsDataset();
  const chartFrom = dataset.dates[0] ?? '';
  const chartTo = dataset.dates[dataset.dates.length - 1] ?? '';
  const aggregate = aggregateShareholdersDaily(dataset, chartFrom, chartTo, {
    periodFrom: chartFrom,
    periodTo: chartTo,
  });

  it('matches observed market totals on 2026-06-23 and 2026-06-24', () => {
    expect(dayMetrics(aggregate, '2026-06-23')).toEqual({
      totalShareholders: 1_626_816,
      totalShareholdersChanged: 184_875,
    });
    expect(dayMetrics(aggregate, '2026-06-24')).toEqual({
      totalShareholders: 1_627_010,
      totalShareholdersChanged: 117_089,
    });
  });

  it('moves total shareholders by +194 while changed-issuer totals differ by -67_786', () => {
    const june23 = dayMetrics(aggregate, '2026-06-23');
    const june24 = dayMetrics(aggregate, '2026-06-24');

    expect(june24.totalShareholders - june23.totalShareholders).toBe(194);
    expect(june24.totalShareholdersChanged - june23.totalShareholdersChanged).toBe(-67_786);
  });

  it('attributes most of the +194 total move to issuers newly present on 2026-06-24', () => {
    const idx23 = dataset.dates.indexOf('2026-06-23');
    const idx24 = dataset.dates.indexOf('2026-06-24');
    expect(idx23).toBeGreaterThan(0);
    expect(idx24).toBe(idx23 + 1);

    let pairwiseDeltaSum = 0;
    let newlyListed = 0;
    let dropped = 0;
    for (let issuerIndex = 0; issuerIndex < dataset.issuers.length; issuerIndex += 1) {
      const prev = metricAt(dataset, 'shareholders', issuerIndex, idx23);
      const today = metricAt(dataset, 'shareholders', issuerIndex, idx24);
      if (prev === null && today !== null) {
        newlyListed += today;
      } else if (prev !== null && today === null) {
        dropped += prev;
      } else if (prev !== null && today !== null) {
        pairwiseDeltaSum += today - prev;
      }
    }

    expect(newlyListed - dropped + pairwiseDeltaSum).toBe(194);
    expect(pairwiseDeltaSum).toBe(4);
    expect(newlyListed).toBe(194);
    expect(dropped).toBe(4);
  });

  it('uses gains/losses from pairwise deltas only (+19 / −15 on 2026-06-24)', () => {
    const idx24 = aggregate.dates.indexOf('2026-06-24');
    expect(aggregate.gains[idx24]).toBe(19);
    expect(aggregate.losses[idx24]).toBe(15);
    expect(aggregate.gains[idx24] - aggregate.losses[idx24]).toBe(4);
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
