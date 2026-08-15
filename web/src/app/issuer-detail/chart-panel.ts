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
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('chartHost');
  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private dragStartIndex: number | null = null;
  private pinchDistance = 0;
  private viewStart = '';
  private viewEnd = '';

  protected readonly visible = signal<Record<MetricId, boolean>>({
    total_shares: true,
    free_float: true,
    shareholders: true,
  });
  protected readonly preset = signal<RangePreset>('m3');
  protected readonly compare = signal<ComparePopup | null>(null);
  protected readonly labels: Record<MetricId, string> = {
    total_shares: $localize`:@@metric.totalShares:Общ брой акции`,
    free_float: $localize`:@@metric.freeFloat:Свободен флот`,
    shareholders: $localize`:@@metric.shareholders:Акционери`,
  };
  protected readonly presets: Array<{ id: RangePreset; label: string }> = [
    { id: 'd5', label: $localize`:@@range.d5:5 дни` },
    { id: 'd10', label: $localize`:@@range.d10:10 дни` },
    { id: 'm1', label: $localize`:@@range.m1:1 месец` },
    { id: 'm3', label: $localize`:@@range.m3:3 месеца` },
    { id: 'm6', label: $localize`:@@range.m6:6 месеца` },
    { id: 'ytd', label: $localize`:@@range.ytd:YTD` },
    { id: 'y1', label: $localize`:@@range.y1:12 месеца` },
    { id: 'y3', label: $localize`:@@range.y3:3 години` },
    { id: 'y5', label: $localize`:@@range.y5:5 години` },
    { id: 'max', label: $localize`:@@range.max:Всички` },
  ];

  protected readonly percentLabel = $localize`:@@compare.percent:Процент`;
  protected readonly absLabel = $localize`:@@compare.absolute:Абсолютна промяна`;
  protected readonly closeLabel = $localize`:@@compare.close:Затвори`;
  protected readonly metricIds: MetricId[] = ['total_shares', 'free_float', 'shareholders'];
  protected readonly showPercent = computed(() => this.store.showPercentChange());

  constructor() {
    effect(() => {
      this.dataset();
      this.issuerIndex();
      this.preset();
      if (this.chart) {
        this.applyRangeFromPreset();
        this.render();
      }
    });
    effect(() => {
      this.visible();
      if (this.chart) {
        this.render();
      }
    });
  }

  ngAfterViewInit(): void {
    this.chart = echarts.init(this.host().nativeElement);
    this.bindInteractions();
    this.applyRangeFromPreset();
    this.render();
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(this.host().nativeElement);
  }

  ngOnDestroy(): void {
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

  private applyRangeFromPreset(): void {
    const dates = this.dataset().dates;
    this.viewEnd = dates[dates.length - 1] ?? '';
    this.viewStart = rangeStartIso(dates, this.preset());
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
        },
        grid: { left: metrics.length >= 3 ? 88 : 56, right: metrics.length >= 2 ? 56 : 24, top: 24, bottom: 72 },
        dataZoom: [
          {
            type: 'inside',
            startValue: this.viewStart,
            endValue: this.viewEnd,
            zoomOnMouseWheel: false,
            moveOnMouseMove: false,
            moveOnMouseWheel: false,
          },
        ],
        xAxis: {
          type: 'category',
          data: dates,
          axisLabel: { rotate: 90, fontSize: 10 },
        },
        yAxis,
        series: metrics.map((metric, index) => ({
          name: this.labels[metric],
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
    const element = this.host().nativeElement;
    element.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const focal = this.dateFromClientX(event.clientX);
        const factor = event.deltaY > 0 ? 1.12 : 0.88;
        this.zoomToward(focal, factor);
      },
      { passive: false },
    );
    element.addEventListener(
      'touchstart',
      (event) => {
        if (event.touches.length === 2) {
          this.pinchDistance = this.touchDistance(event.touches);
          this.dragStartIndex = null;
          return;
        }
        if (event.touches.length === 1) {
          this.dragStartIndex = this.indexFromClientX(event.touches[0].clientX);
        }
      },
      { passive: true },
    );
    element.addEventListener(
      'touchmove',
      (event) => {
        if (event.touches.length === 2 && this.pinchDistance) {
          event.preventDefault();
          const next = this.touchDistance(event.touches);
          const focal = this.dateFromClientX((event.touches[0].clientX + event.touches[1].clientX) / 2);
          this.zoomToward(focal, this.pinchDistance / next);
          this.pinchDistance = next;
        }
      },
      { passive: false },
    );
    element.addEventListener('mousedown', (event) => {
      this.dragStartIndex = this.indexFromClientX(event.clientX);
    });
    element.addEventListener('mouseup', (event) => {
      if (this.dragStartIndex === null) {
        return;
      }
      const endIndex = this.indexFromClientX(event.clientX);
      this.finishCompare(this.dragStartIndex, endIndex);
      this.dragStartIndex = null;
    });
    element.addEventListener('touchend', () => {
      this.pinchDistance = 0;
    });
  }

  private finishCompare(startIndex: number, endIndex: number): void {
    const from = Math.min(startIndex, endIndex);
    const to = Math.max(startIndex, endIndex);
    if (to - from < 1) {
      return;
    }
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

  private zoomToward(focalIso: string, factor: number): void {
    const dates = this.dataset().dates;
    if (!dates.length) {
      return;
    }
    const startIndex = indexForDate(dates, this.viewStart);
    const endIndex = indexForDate(dates, this.viewEnd);
    const focalIndex = indexForDate(dates, focalIso);
    const left = Math.max(0.5, focalIndex - startIndex);
    const right = Math.max(0.5, endIndex - focalIndex);
    const newLeft = left * factor;
    const newRight = right * factor;
    const nextStart = Math.max(0, Math.round(focalIndex - newLeft));
    const nextEnd = Math.min(dates.length - 1, Math.round(focalIndex + newRight));
    if (nextEnd - nextStart < 2) {
      return;
    }
    this.viewStart = dates[nextStart];
    this.viewEnd = dates[nextEnd];
    this.render();
  }

  private dateFromClientX(clientX: number): string {
    const dates = this.dataset().dates;
    return dates[this.indexFromClientX(clientX)] ?? dates[dates.length - 1];
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

  private touchDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }
}
