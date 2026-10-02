import { describe, expect, it } from 'vitest';

import {
  clampViewRange,
  fullSpanForDates,
  statisticsDataZoomSlider,
} from './statistics-chart-data-zoom';

const DATES = ['2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01'];

describe('statistics-chart-data-zoom', () => {
  it('builds a slider config with start and end values', () => {
    const slider = statisticsDataZoomSlider('2024-01-01', '2024-04-01');
    expect(slider.type).toBe('slider');
    expect(slider.startValue).toBe('2024-01-01');
    expect(slider.endValue).toBe('2024-04-01');
  });

  it('returns full span for non-empty dates', () => {
    expect(fullSpanForDates(DATES)).toEqual({ start: '2024-01-01', end: '2024-04-01' });
    expect(fullSpanForDates([])).toEqual({ start: '', end: '' });
  });

  it('clamps unknown dates to the series span', () => {
    expect(clampViewRange('2023-01-01', '2025-01-01', DATES)).toEqual({
      start: '2024-01-01',
      end: '2024-04-01',
    });
  });

  it('orders start and end when reversed', () => {
    expect(clampViewRange('2024-04-01', '2024-01-01', DATES)).toEqual({
      start: '2024-01-01',
      end: '2024-04-01',
    });
  });
});
