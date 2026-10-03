import { describe, expect, it } from 'vitest';

import type { ParsedDataset, VectorCatalogEntry } from '../core/data/vectors.types';
import { limitRankedIssuers, rankIssuersByShareholdersDiff } from './rank-issuers';

const DATES = ['2024-01-01', '2024-04-01', '2024-07-01'];

describe('rankIssuersByShareholdersDiff', () => {
  it('orders by descending shareholders diff by default', () => {
    const ranked = rankIssuersByShareholdersDiff(rankingFixture(), DATES[0], DATES[2], 'desc');
    expect(ranked.map((row) => row.name)).toEqual([
      'Delta',
      'Zeta',
      'Alpha',
      'Beta',
      'Twin',
      'Twin',
      'Gamma',
    ]);
    expect(ranked.map((row) => row.diff)).toEqual([20, 10, 5, 5, 3, 3, -8]);
  });

  it('orders by ascending shareholders diff', () => {
    const ranked = rankIssuersByShareholdersDiff(rankingFixture(), DATES[0], DATES[2], 'asc');
    expect(ranked.map((row) => row.diff)).toEqual([-8, 3, 3, 5, 5, 10, 20]);
    expect(ranked.map((row) => row.name)).toEqual([
      'Gamma',
      'Twin',
      'Twin',
      'Alpha',
      'Beta',
      'Zeta',
      'Delta',
    ]);
  });

  it('breaks equal diffs by name then ISIN', () => {
    const ranked = rankIssuersByShareholdersDiff(rankingFixture(), DATES[0], DATES[2], 'desc');
    const plusFive = ranked.filter((row) => row.diff === 5);
    expect(plusFive.map((row) => row.name)).toEqual(['Alpha', 'Beta']);
    const twins = ranked.filter((row) => row.name === 'Twin');
    expect(twins.map((row) => row.isin)).toEqual(['BG1100000001', 'BG1100000002']);
  });

  it('omits issuers without valid shareholder readings in the window', () => {
    const ranked = rankIssuersByShareholdersDiff(rankingFixture(), DATES[0], DATES[2], 'desc');
    expect(ranked.some((row) => row.name === 'Empty')).toBe(false);
    expect(ranked).toHaveLength(7);
  });

  it('formats absolute and percent deltas', () => {
    const ranked = rankIssuersByShareholdersDiff(rankingFixture(), DATES[0], DATES[2], 'desc');
    expect(ranked[0]).toMatchObject({ name: 'Delta', abs: '+20', percent: '+2000.00%' });
    expect(ranked[ranked.length - 1]).toMatchObject({ name: 'Gamma', abs: '-8', percent: '-16.00%' });
  });
});

describe('limitRankedIssuers', () => {
  it('keeps the top 5 unless show-all is on', () => {
    const ranked = rankIssuersByShareholdersDiff(rankingFixture(), DATES[0], DATES[2], 'desc');
    expect(limitRankedIssuers(ranked, false).map((row) => row.name)).toEqual([
      'Delta',
      'Zeta',
      'Alpha',
      'Beta',
      'Twin',
    ]);
    expect(limitRankedIssuers(ranked, true)).toHaveLength(7);
  });

  it('returns all rows when there are five or fewer', () => {
    const ranked = rankIssuersByShareholdersDiff(rankingFixture(), DATES[0], DATES[2], 'desc').slice(0, 3);
    expect(limitRankedIssuers(ranked, false)).toHaveLength(3);
  });
});

function rankingFixture(): ParsedDataset {
  const issuers: VectorCatalogEntry[] = [
    { id: 1, isin: 'BG1100000010', name: 'Zeta' },
    { id: 2, isin: 'BG1100000020', name: 'Alpha' },
    { id: 3, isin: 'BG1100000030', name: 'Beta' },
    { id: 4, isin: 'BG1100000040', name: 'Gamma' },
    { id: 5, isin: 'BG1100000050', name: 'Delta' },
    { id: 6, isin: 'BG1100000060', name: 'Empty' },
    { id: 7, isin: 'BG1100000002', name: 'Twin' },
    { id: 8, isin: 'BG1100000001', name: 'Twin' },
  ];
  const series: Array<Array<number | null>> = [
    [100, 105, 110],
    [10, 12, 15],
    [20, 22, 25],
    [50, 46, 42],
    [1, 10, 21],
    [null, null, null],
    [10, 11, 13],
    [10, 12, 13],
  ];
  const cellCount = issuers.length * DATES.length;
  const shareholders = new Int32Array(cellCount);
  const shareholdersValid = new Uint8Array(cellCount);
  series.forEach((values, issuerIndex) => {
    values.forEach((value, dateIndex) => {
      const offset = issuerIndex * DATES.length + dateIndex;
      if (value === null) {
        return;
      }
      shareholders[offset] = value;
      shareholdersValid[offset] = 1;
    });
  });
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    dates: DATES,
    issuers,
    totalShares: new Int32Array(cellCount),
    freeFloat: new Int32Array(cellCount),
    shareholders,
    totalSharesValid: new Uint8Array(cellCount),
    freeFloatValid: new Uint8Array(cellCount),
    shareholdersValid,
  };
}
