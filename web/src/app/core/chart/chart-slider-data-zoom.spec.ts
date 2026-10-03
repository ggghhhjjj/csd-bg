import { describe, expect, it } from 'vitest';

import { dateFromZoomValue } from './chart-slider-data-zoom';

describe('dateFromZoomValue', () => {
  const dates = ['2024-06-01', '2024-06-02', '2024-06-03'];

  it('returns matching category strings', () => {
    expect(dateFromZoomValue('2024-06-02', dates, '2024-06-01')).toBe('2024-06-02');
  });

  it('falls back when the string is not a category', () => {
    expect(dateFromZoomValue('2024-07-01', dates, '2024-06-01')).toBe('2024-06-01');
  });

  it('maps numeric indices to dates', () => {
    expect(dateFromZoomValue(2, dates, '2024-06-01')).toBe('2024-06-03');
    expect(dateFromZoomValue(99, dates, '2024-06-01')).toBe('2024-06-03');
  });

  it('uses fallback for undefined values', () => {
    expect(dateFromZoomValue(undefined, dates, '2024-06-02')).toBe('2024-06-02');
  });
});
