import type * as echarts from 'echarts';

export type ChartSliderDataZoomBinding = {
  dispose: () => void;
};

export function chartSliderDataZoomOptions(
  viewStart: string,
  viewEnd: string,
): echarts.DataZoomComponentOption {
  return {
    type: 'slider',
    startValue: viewStart,
    endValue: viewEnd,
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

export function dateFromZoomValue(
  value: string | number | undefined,
  dates: string[],
  fallback: string,
): string {
  if (typeof value === 'string' && value) {
    return dates.includes(value) ? value : fallback;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const idx = Math.round(value);
    return dates[Math.max(0, Math.min(dates.length - 1, idx))] ?? fallback;
  }
  return fallback;
}

export function readSliderViewRange(
  chart: echarts.ECharts,
  dates: string[],
  fallbackStart: string,
  fallbackEnd: string,
): { from: string; to: string } {
  const option = chart.getOption() as {
    dataZoom?: Array<{ startValue?: string | number; endValue?: string | number }>;
  };
  const zoom = option.dataZoom?.[0];
  if (!zoom) {
    return { from: fallbackStart, to: fallbackEnd };
  }
  return {
    from: dateFromZoomValue(zoom.startValue, dates, fallbackStart),
    to: dateFromZoomValue(zoom.endValue, dates, fallbackEnd),
  };
}

export function bindChartSliderDataZoom(
  chart: echarts.ECharts,
  options: {
    getDates: () => string[];
    getFallbackRange: () => { from: string; to: string };
    onRangeChange: (from: string, to: string) => void;
    isApplyingExternalRange?: () => boolean;
  },
): ChartSliderDataZoomBinding {
  const handler = (): void => {
    if (options.isApplyingExternalRange?.()) {
      return;
    }
    const dates = options.getDates();
    if (dates.length === 0) {
      return;
    }
    const fallback = options.getFallbackRange();
    const { from, to } = readSliderViewRange(chart, dates, fallback.from, fallback.to);
    options.onRangeChange(from, to);
  };

  chart.on('datazoom', handler);

  return {
    dispose: () => {
      chart.off('datazoom', handler);
    },
  };
}
