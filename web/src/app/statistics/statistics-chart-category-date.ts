import type * as echarts from 'echarts';

export function categoryIndexFromConvertResult(raw: unknown, dates: string[]): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.round(raw);
  }
  if (typeof raw === 'string') {
    const index = dates.indexOf(raw);
    return index >= 0 ? index : undefined;
  }
  if (Array.isArray(raw) && raw.length > 0) {
    return categoryIndexFromConvertResult(raw[0], dates);
  }
  return undefined;
}

export function categoryDateFromConvertResult(raw: unknown, dates: string[]): string | undefined {
  const index = categoryIndexFromConvertResult(raw, dates);
  if (index !== undefined && index >= 0 && index < dates.length) {
    return dates[index];
  }
  if (typeof raw === 'string' && dates.includes(raw)) {
    return raw;
  }
  return undefined;
}

export function dateAtCategoryChartPixel(
  chart: echarts.ECharts,
  offsetX: number,
  offsetY: number,
  dates: string[],
): string | undefined {
  if (dates.length === 0) {
    return undefined;
  }
  const point: [number, number] = [offsetX, offsetY];
  const fromXAxis = chart.convertFromPixel({ xAxisIndex: 0 }, point);
  const fromSeries = chart.convertFromPixel({ seriesIndex: 0 }, point);
  return (
    categoryDateFromConvertResult(fromXAxis, dates) ??
    categoryDateFromConvertResult(fromSeries, dates)
  );
}
