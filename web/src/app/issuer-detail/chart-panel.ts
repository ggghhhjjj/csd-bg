import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import * as echarts from 'echarts';

import { metricAt, firstLastInRange, formatDelta, type MetricId, type ParsedDataset } from '../core/data/vectors.types';
import { VectorsStore } from '../core/data/vectors.store';
import { indexForDate, rangeStartIso, type RangePreset } from '../core/data/date-range';
import { LocaleService } from '../core/i18n/locale.service';
import { AXIS_TOOLTIP_HIDE_MS, axisTooltipPosition, type AxisTooltipSize } from './axis-tooltip-position';
import { axisIndexFromChartEvent } from './axis-tip-index';
import { ComparePointerSession } from './compare-pointer-session';

const METRIC_COLORS: Record<MetricId, string> = {
  total_shares: '#38bdf8',
  free_float: '#34d399',
  shareholders: '#fbbf24',
};

interface ComparePopup {
  start: string;
  end: string;
  rows: Array<{
    metric: MetricId;
    first: number | null;
    last: number | null;
    abs: string;
    percent: string;
  }>;
}

@Component({
  selector: 'app-chart-panel',
  templateUrl: './chart-panel.html',
  styleUrl: './chart-panel.css',
})
export class ChartPanel implements AfterViewInit, OnDestroy {
  readonly dataset = input.required<ParsedDataset>();
  readonly issuerIndex = input.required<number>();

  private readonly store = inject(VectorsStore);
  private readonly i18n = inject(LocaleService);
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('chartHost');
  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private chartHostEl: HTMLDivElement | null = null;
  private readonly compareSession = new ComparePointerSession();
  private viewStart = '';
  private viewEnd = '';
  private applyingPreset = false;
  private tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;
  private axisTipStartIndex: number | null = null;
  private axisTipLastIndex: number | null = null;
  private awaitingIdleHide = false;

  protected readonly visible = signal<Record<MetricId, boolean>>({
    total_shares: true,
    free_float: true,
    shareholders: true,
  });
  protected readonly preset = signal<RangePreset | null>('m3');
  protected readonly compare = signal<ComparePopup | null>(null);
  protected readonly labels = computed<Record<MetricId, string>>(() => ({
    total_shares: this.i18n.text('metric.totalShares'),
    free_float: this.i18n.text('metric.freeFloat'),
    shareholders: this.i18n.text('metric.shareholders'),
  }));
  protected readonly presets = computed<Array<{ id: RangePreset; label: string }>>(() => [
    { id: 'd5', label: this.i18n.text('range.d5') },
    { id: 'd10', label: this.i18n.text('range.d10') },
    { id: 'm1', label: this.i18n.text('range.m1') },
    { id: 'm3', label: this.i18n.text('range.m3') },
    { id: 'm6', label: this.i18n.text('range.m6') },
    { id: 'ytd', label: this.i18n.text('range.ytd') },
    { id: 'y1', label: this.i18n.text('range.y1') },
    { id: 'y3', label: this.i18n.text('range.y3') },
    { id: 'y5', label: this.i18n.text('range.y5') },
    { id: 'max', label: this.i18n.text('range.max') },
  ]);

  protected readonly percentLabel = computed(() => this.i18n.text('compare.percent'));
  protected readonly absLabel = computed(() => this.i18n.text('compare.absolute'));
  protected readonly closeLabel = computed(() => this.i18n.text('compare.close'));
  protected readonly metricIds: MetricId[] = ['total_shares', 'free_float', 'shareholders'];
  protected readonly showPercent = computed(() => this.store.showPercentChange());

  constructor() {
    effect(() => {
      this.dataset();
      this.issuerIndex();
      const preset = this.preset();
      if (this.chart && preset) {
        this.applyingPreset = true;
        this.applyRangeFromPreset(preset);
        this.render();
        this.applyingPreset = false;
      }
    });
    effect(() => {
      this.dataset();
      this.issuerIndex();
      this.visible();
      this.i18n.locale();
      if (this.chart) {
        this.render();
      }
    });
  }

  ngAfterViewInit(): void {
    this.chart = echarts.init(this.host().nativeElement);
    this.bindInteractions();
    this.bindDataZoom();
    this.bindAxisTipTracking();
    const preset = this.preset();
    if (preset) {
      this.applyingPreset = true;
      this.applyRangeFromPreset(preset);
      this.render();
      this.applyingPreset = false;
    }
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(this.host().nativeElement);
  }

  ngOnDestroy(): void {
    this.clearTooltipHideTimer();
    this.unbindAxisTipTracking();
    this.unbindInteractions();
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }

  protected toggleMetric(metric: MetricId): void {
    this.visible.update((current) => ({ ...current, [metric]: !current[metric] }));
  }

  protected setPreset(preset: RangePreset): void {
    this.preset.set(preset);
    this.compare.set(null);
  }

  protected togglePercent(): void {
    this.store.togglePercentChange();
  }

  protected closeCompare(): void {
    this.compare.set(null);
  }

  private applyRangeFromPreset(preset: RangePreset): void {
    const dates = this.dataset().dates;
    this.viewEnd = dates[dates.length - 1] ?? '';
    this.viewStart = rangeStartIso(dates, preset);
  }

  private visibleMetrics(): MetricId[] {
    return (Object.keys(this.visible()) as MetricId[]).filter((metric) => this.visible()[metric]);
  }

  private seriesValues(metric: MetricId): Array<number | null> {
    const dataset = this.dataset();
    const issuerIndex = this.issuerIndex();
    return dataset.dates.map((_, dateIndex) => metricAt(dataset, metric, issuerIndex, dateIndex));
  }

  private render(): void {
    if (!this.chart) {
      return;
    }
    const dates = this.dataset().dates;
    const metrics = this.visibleMetrics();
    const yAxis = metrics.map((metric, index) => {
      const position = index === 1 ? 'right' : 'left';
      return {
        type: 'value' as const,
        position,
        offset: index >= 2 ? 56 : 0,
        axisLine: { show: true, lineStyle: { color: METRIC_COLORS[metric] } },
        axisLabel: { color: METRIC_COLORS[metric] },
        splitLine: { show: index === 0 },
      };
    });
    this.chart.setOption(
      {
        animation: false,
        legend: { show: false },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line' },
          confine: true,
          enterable: false,
          hideDelay: 0,
          position: (
            point: number[],
            _params: unknown,
            _el: unknown,
            _rect: unknown,
            size: AxisTooltipSize,
          ) => axisTooltipPosition(point, size),
        },
        grid: { left: metrics.length >= 3 ? 88 : 56, right: metrics.length >= 2 ? 56 : 24, top: 24, bottom: 110 },
        dataZoom: [
          {
            type: 'slider',
            startValue: this.viewStart,
            endValue: this.viewEnd,
            height: 28,
            bottom: 8,
            brushSelect: false,
            borderColor: '#334155',
            fillerColor: 'rgba(51, 65, 85, 0.55)',
            handleSize: 24,
            handleStyle: { color: '#94a3b8' },
            moveHandleSize: 10,
            textStyle: { color: '#94a3b8', fontSize: 10 },
          },
        ],
        xAxis: {
          type: 'category',
          data: dates,
          axisLabel: { rotate: 90, fontSize: 10 },
        },
        yAxis,
        series: metrics.map((metric, index) => ({
          name: this.labels()[metric],
          type: 'line',
          showSymbol: false,
          yAxisIndex: index,
          itemStyle: { color: METRIC_COLORS[metric] },
          lineStyle: { color: METRIC_COLORS[metric] },
          data: this.seriesValues(metric),
        })),
      },
      true,
    );
  }

  private bindInteractions(): void {
    this.chartHostEl = this.host().nativeElement;
    this.chartHostEl.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
  }

  private unbindInteractions(): void {
    this.chartHostEl?.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    this.chartHostEl = null;
  }

  private bindAxisTipTracking(): void {
    this.chart?.on('showTip', this.onAxisTipEvent);
    this.chart?.on('updateAxisPointer', this.onAxisTipEvent);
  }

  private unbindAxisTipTracking(): void {
    this.chart?.off('showTip', this.onAxisTipEvent);
    this.chart?.off('updateAxisPointer', this.onAxisTipEvent);
  }

  private readonly onAxisTipEvent = (params: unknown): void => {
    const index = axisIndexFromChartEvent(params, this.dataset().dates);
    if (index === null) {
      return;
    }
    this.axisTipLastIndex = index;
    if (this.awaitingIdleHide) {
      this.scheduleTooltipHide();
    }
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    const startIndex = this.indexFromClientX(event.clientX);
    this.awaitingIdleHide = false;
    this.clearTooltipHideTimer();
    this.axisTipStartIndex = startIndex;
    this.axisTipLastIndex = startIndex;
    this.compareSession.start(event.pointerId, startIndex);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const endIndex = this.indexFromClientX(event.clientX);
    const range = this.compareSession.finish(event.pointerId, endIndex);
    if (range) {
      this.finishCompare(range.startIndex, range.endIndex);
    }
    if (!this.compare()) {
      this.scheduleTooltipHide();
    }
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    this.compareSession.cancel(event.pointerId);
    this.awaitingIdleHide = true;
    this.scheduleTooltipHide();
  };

  private hideTooltip(): void {
    this.awaitingIdleHide = false;
    this.clearTooltipHideTimer();
    this.chart?.dispatchAction({ type: 'hideTip' });
  }

  private scheduleTooltipHide(): void {
    this.clearTooltipHideTimer();
    const compareOnHide = this.awaitingIdleHide;
    this.tooltipHideTimer = setTimeout(() => {
      this.tooltipHideTimer = null;
      this.awaitingIdleHide = false;
      this.chart?.dispatchAction({ type: 'hideTip' });
      if (compareOnHide) {
        this.finishCompareFromAxisTip();
      }
    }, AXIS_TOOLTIP_HIDE_MS);
  }

  private finishCompareFromAxisTip(): void {
    if (this.axisTipStartIndex === null || this.axisTipLastIndex === null) {
      return;
    }
    this.finishCompare(this.axisTipStartIndex, this.axisTipLastIndex);
  }

  private clearTooltipHideTimer(): void {
    if (this.tooltipHideTimer !== null) {
      clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
  }

  private bindDataZoom(): void {
    this.chart?.on('datazoom', () => {
      this.syncViewFromSlider();
      if (!this.applyingPreset) {
        this.preset.set(null);
      }
    });
  }

  private syncViewFromSlider(): void {
    if (!this.chart) {
      return;
    }
    const option = this.chart.getOption() as {
      dataZoom?: Array<{ startValue?: string | number; endValue?: string | number }>;
    };
    const zoom = option.dataZoom?.[0];
    if (!zoom) {
      return;
    }
    const dates = this.dataset().dates;
    this.viewStart = this.dateFromZoomValue(zoom.startValue, dates, this.viewStart);
    this.viewEnd = this.dateFromZoomValue(zoom.endValue, dates, this.viewEnd);
  }

  private dateFromZoomValue(value: string | number | undefined, dates: string[], fallback: string): string {
    if (typeof value === 'string' && value) {
      return dates.includes(value) ? value : fallback;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const idx = Math.round(value);
      return dates[Math.max(0, Math.min(dates.length - 1, idx))] ?? fallback;
    }
    return fallback;
  }

  private finishCompare(startIndex: number, endIndex: number): void {
    const from = Math.min(startIndex, endIndex);
    const to = Math.max(startIndex, endIndex);
    if (to - from < 1) {
      return;
    }
    this.hideTooltip();
    const dates = this.dataset().dates;
    const issuerIndex = this.issuerIndex();
    this.compare.set({
      start: dates[from],
      end: dates[to],
      rows: this.visibleMetrics().map((metric) => {
        const { first, last } = firstLastInRange(this.dataset(), metric, issuerIndex, from, to);
        return {
          metric,
          first,
          last,
          abs: formatDelta(first, last, false),
          percent: formatDelta(first, last, true),
        };
      }),
    });
  }

  private indexFromClientX(clientX: number): number {
    const dates = this.dataset().dates;
    if (!this.chart || dates.length === 0) {
      return 0;
    }
    const startIndex = indexForDate(dates, this.viewStart);
    const endIndex = indexForDate(dates, this.viewEnd);
    const localX = clientX - this.host().nativeElement.getBoundingClientRect().left;
    const xStart = this.chart.convertToPixel({ xAxisIndex: 0 }, dates[startIndex]);
    const xEnd = this.chart.convertToPixel({ xAxisIndex: 0 }, dates[endIndex]);
    if (typeof xStart === 'number' && typeof xEnd === 'number' && xEnd !== xStart) {
      const t = (localX - xStart) / (xEnd - xStart);
      const idx = Math.round(startIndex + t * (endIndex - startIndex));
      return Math.max(0, Math.min(dates.length - 1, idx));
    }
    const point = this.chart.convertFromPixel({ xAxisIndex: 0 }, [localX, 0]);
    const raw = Array.isArray(point) ? point[0] : point;
    if (typeof raw === 'string') {
      const found = dates.indexOf(raw);
      return found >= 0 ? found : startIndex;
    }
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber)) {
      const idx = Math.round(startIndex + asNumber);
      if (idx >= startIndex && idx <= endIndex) {
        return idx;
      }
      return Math.max(0, Math.min(dates.length - 1, Math.round(asNumber)));
    }
    return startIndex;
  }
}
