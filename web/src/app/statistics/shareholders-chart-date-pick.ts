import type * as echarts from 'echarts';

const MARK_LINE_COLOR = '#e2e8f0';

type ChartInstance = echarts.ECharts;

export type ChartDatePickBinding = {
  dispose: () => void;
};

/** Picks the x-axis category under the pointer (same snap as axis tooltips). */
export function bindChartDatePick(
  chart: ChartInstance,
  hostEl: HTMLElement,
  getDates: () => string[],
  onPick: (iso: string) => void,
): ChartDatePickBinding {
  const pickFromPointer = (nativeEvent: Event | undefined): void => {
    const dates = getDates();
    if (dates.length === 0 || !nativeEvent) {
      return;
    }
    const iso = isoFromPointer(chart, hostEl, nativeEvent, dates);
    if (iso) {
      onPick(iso);
    }
  };

  const onZrClick = (zrEvent: { event?: Event }): void => {
    pickFromPointer(zrEvent.event);
  };

  const zr = chart.getZr();
  zr.on('click', onZrClick);

  return {
    dispose: () => {
      zr.off('click', onZrClick);
    },
  };
}

export function selectedDateMarkLine(
  selectedIso: string | null | undefined,
  dates: string[],
): echarts.MarkLineComponentOption | undefined {
  if (!selectedIso || !dates.includes(selectedIso)) {
    return undefined;
  }
  return {
    symbol: ['none', 'none'],
    silent: true,
    lineStyle: { color: MARK_LINE_COLOR, width: 1, type: 'solid' },
    data: [{ xAxis: selectedIso }],
  };
}

function isoFromPointer(
  chart: ChartInstance,
  hostEl: HTMLElement,
  nativeEvent: Event,
  dates: string[],
): string | null {
  const point = clientPointFromNativeEvent(nativeEvent, hostEl);
  if (!point) {
    return null;
  }
  return isoFromChartLocalPoint(chart, point.localX, point.localY, dates);
}

function clientPointFromNativeEvent(
  nativeEvent: Event,
  hostEl: HTMLElement,
): { localX: number; localY: number } | null {
  const rect = hostEl.getBoundingClientRect();
  const withTouches = nativeEvent as Event & {
    changedTouches?: TouchList;
    touches?: TouchList;
    clientX?: number;
    clientY?: number;
  };
  const touch = withTouches.changedTouches?.[0] ?? withTouches.touches?.[0];
  if (touch) {
    return {
      localX: touch.clientX - rect.left,
      localY: touch.clientY - rect.top,
    };
  }
  if (typeof withTouches.clientX === 'number' && typeof withTouches.clientY === 'number') {
    return {
      localX: withTouches.clientX - rect.left,
      localY: withTouches.clientY - rect.top,
    };
  }
  return null;
}

function isoFromChartLocalPoint(
  chart: ChartInstance,
  localX: number,
  localY: number,
  dates: string[],
): string | null {
  const point = chart.convertFromPixel({ xAxisIndex: 0 }, [localX, localY]);
  const raw = Array.isArray(point) ? point[0] : point;
  if (typeof raw === 'string' && dates.includes(raw)) {
    return raw;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const idx = Math.round(raw);
    if (idx >= 0 && idx < dates.length) {
      return dates[idx];
    }
  }
  const xStart = chart.convertToPixel({ xAxisIndex: 0 }, dates[0]);
  const xEnd = chart.convertToPixel({ xAxisIndex: 0 }, dates[dates.length - 1]);
  if (typeof xStart !== 'number' || typeof xEnd !== 'number' || xEnd === xStart) {
    return null;
  }
  const t = (localX - xStart) / (xEnd - xStart);
  const idx = Math.round(t * (dates.length - 1));
  const clamped = Math.max(0, Math.min(dates.length - 1, idx));
  return dates[clamped] ?? null;
}
