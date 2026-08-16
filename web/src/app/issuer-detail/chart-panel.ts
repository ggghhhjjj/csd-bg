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
  private viewStart = '';
  private viewEnd = '';
  private applyingPreset = false;

  protected readonly visible = signal<Record<MetricId, boolean>>({
    total_shares: true,
    free_float: true,
    shareholders: true,
  });
  protected readonly preset = signal<RangePreset | null>('m3');
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
      if (this.chart) {
        this.render();
      }
    });
  }

  ngAfterViewInit(): void {
    this.chart = echarts.init(this.host().nativeElement);
    this.bindInteractions();
    this.bindDataZoom();
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
      'touchstart',
      (event) => {
        if (event.touches.length === 1) {
          this.dragStartIndex = this.indexFromClientX(event.touches[0].clientX);
        }
      },
      { passive: true },
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
