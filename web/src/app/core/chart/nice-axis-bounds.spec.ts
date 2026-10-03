import { describe, expect, it } from 'vitest';

import { finiteMinMaxInWindow, niceAxisBounds } from './nice-axis-bounds';

describe('niceAxisBounds', () => {
  it('rounds 6M-scale free float window to 50k steps', () => {
    const bounds = niceAxisBounds(1_264_557, 1_441_076);
    expect(bounds).toEqual({ min: 1_250_000, max: 1_450_000 });
  });

  it('handles flat series with synthetic span', () => {
    const bounds = niceAxisBounds(500, 500);
    expect(bounds).not.toBeNull();
    expect(bounds!.min).toBeLessThan(500);
    expect(bounds!.max).toBeGreaterThan(500);
  });

  it('uses nice steps for small shareholder counts', () => {
    const bounds = niceAxisBounds(412, 487);
    expect(bounds).not.toBeNull();
    expect(bounds!.min).toBeLessThanOrEqual(412);
    expect(bounds!.max).toBeGreaterThanOrEqual(487);
    expect(bounds!.max - bounds!.min).toBeGreaterThan(0);
  });

  it('returns null for non-finite input', () => {
    expect(niceAxisBounds(Number.NaN, 100)).toBeNull();
  });
});

describe('finiteMinMaxInWindow', () => {
  it('ignores nulls outside window slice', () => {
    const values = [1, null, 3, 10, 2];
    expect(finiteMinMaxInWindow(values, 2, 4)).toEqual({ min: 2, max: 10 });
  });

  it('returns null when window has no finite values', () => {
    expect(finiteMinMaxInWindow([null, null], 0, 1)).toBeNull();
  });
});
