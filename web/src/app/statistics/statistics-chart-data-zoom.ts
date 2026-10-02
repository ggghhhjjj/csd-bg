import type * as echarts from 'echarts';

export const STATISTICS_CHART_GRID_BOTTOM = 110;
export const STATISTICS_CHART_LEGEND_BOTTOM = 40;

export function statisticsDataZoomSlider(startValue: string, endValue: string) {
  return {
    type: 'slider' as const,
    startValue,
    endValue,
    height: 28,
    bottom: 8,
    brushSelect: false,
    borderColor: '#334155',
    fillerColor: 'rgba(51, 65, 85, 0.55)',
    handleSize: 24,
    handleStyle: { color: '#94a3b8' },
    moveHandleSize: 10,
    textStyle: { color: '#94a3b8', fontSize: 10 },
  };
}

export function fullSpanForDates(dates: string[]): { start: string; end: string } {
  if (dates.length === 0) {
    return { start: '', end: '' };
  }
  return { start: dates[0], end: dates[dates.length - 1] };
}

export function clampViewRange(start: string, end: string, dates: string[]): { start: string; end: string } {
  const span = fullSpanForDates(dates);
  if (!span.start || !span.end) {
    return { start: '', end: '' };
  }
  let viewStart = dateFromZoomValue(start, dates, span.start);
  let viewEnd = dateFromZoomValue(end, dates, span.end);
  const startIndex = dates.indexOf(viewStart);
  const endIndex = dates.indexOf(viewEnd);
  if (startIndex < 0 || endIndex < 0) {
    return span;
  }
  if (startIndex > endIndex) {
    viewStart = dates[endIndex];
    viewEnd = dates[startIndex];
  }
  return { start: viewStart, end: viewEnd };
}

export function readDataZoomRange(
  chart: echarts.ECharts,
  dates: string[],
  fallbackStart: string,
  fallbackEnd: string,
): { start: string; end: string } {
  const option = chart.getOption() as {
    dataZoom?: Array<{ startValue?: string | number; endValue?: string | number }>;
  };
  const zoom = option.dataZoom?.[0];
  if (!zoom) {
    return clampViewRange(fallbackStart, fallbackEnd, dates);
  }
  return clampViewRange(
    dateFromZoomValue(zoom.startValue, dates, fallbackStart),
    dateFromZoomValue(zoom.endValue, dates, fallbackEnd),
    dates,
  );
}

function dateFromZoomValue(value: string | number | undefined, dates: string[], fallback: string): string {
  if (typeof value === 'string' && value) {
    return dates.includes(value) ? value : fallback;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const idx = Math.round(value);
    return dates[Math.max(0, Math.min(dates.length - 1, idx))] ?? fallback;
  }
  return fallback;
}
