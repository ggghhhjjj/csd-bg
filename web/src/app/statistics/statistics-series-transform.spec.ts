import { describe, expect, it } from 'vitest';

import {
  baselineSubtract,
  firstDifference,
  transformSeriesForChart,
  visibleIndexRange,
  zScore,
} from './statistics-series-transform';

describe('baselineSubtract', () => {
  it('reveals ±1 fluctuations on 10^6 scale', () => {
    const values = [1_600_000, 1_600_001, 1_599_999];
    const { display, baseline } = baselineSubtract(values, 0, 2, 'min');
    expect(baseline).toBe(1_599_999);
    expect(display).toEqual([1, 2, 0]);
  });

  it('uses first value in window when strategy is first', () => {
    const values = [100, 105, 90];
    const { display, baseline } = baselineSubtract(values, 0, 2, 'first');
    expect(baseline).toBe(100);
    expect(display).toEqual([0, 5, -10]);
  });

  it('computes baseline from window slice only', () => {
    const values = [1_000, 2_000, 3_000, 4_000];
    const { display, baseline } = baselineSubtract(values, 2, 3, 'min');
    expect(baseline).toBe(3_000);
    expect(display).toEqual([-2_000, -1_000, 0, 1_000]);
  });
});

describe('firstDifference', () => {
  it('returns null for first index', () => {
    expect(firstDifference([1_600_000, 1_600_001])).toEqual([null, 1]);
  });
});

describe('zScore', () => {
  it('normalizes around mean with unit std', () => {
    const values = [10, 20, 30];
    const { display, mean, std } = zScore(values, 0, 2);
    expect(mean).toBe(20);
    expect(std).toBeCloseTo(Math.sqrt(200 / 3));
    expect(display[0]).toBeCloseTo((10 - 20) / Math.sqrt(200 / 3));
    expect(display[2]).toBeCloseTo((30 - 20) / Math.sqrt(200 / 3));
  });

  it('returns zeros when std is zero', () => {
    const values = [5, 5, 5];
    const { display, std } = zScore(values, 0, 2);
    expect(std).toBe(0);
    expect(display).toEqual([0, 0, 0]);
  });
});

describe('transformSeriesForChart', () => {
  it('passes through absolute mode', () => {
    const result = transformSeriesForChart([100, 200], 'absolute', 0, 1);
    expect(result.points).toEqual([
      { value: 100, raw: 100 },
      { value: 200, raw: 200 },
    ]);
  });

  it('builds chart points for baseline mode', () => {
    const result = transformSeriesForChart([1_600_000, 1_600_001], 'baseline', 0, 1);
    expect(result.baseline).toBe(1_600_000);
    expect(result.points[1].value).toBe(1);
    expect(result.points[1].raw).toBe(1_600_001);
  });
});

describe('visibleIndexRange', () => {
  it('resolves indices from iso dates', () => {
    expect(
      visibleIndexRange(['2024-01-01', '2024-01-02', '2024-01-03'], '2024-01-02', '2024-01-03'),
    ).toEqual({ startIndex: 1, endIndex: 2 });
  });
});
