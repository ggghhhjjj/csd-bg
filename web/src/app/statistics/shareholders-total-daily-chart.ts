import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  viewChild,
} from '@angular/core';
import * as echarts from 'echarts';

import type { ParsedDataset } from '../core/data/vectors.types';
import { LocaleService } from '../core/i18n/locale.service';
import {
  aggregateShareholdersDailyFull,
  hasShareholdersAggregateData,
} from './shareholders-daily-aggregate';
import {
  clampViewRange,
  fullSpanForDates,
  readDataZoomRange,
  STATISTICS_CHART_GRID_BOTTOM,
  STATISTICS_CHART_LEGEND_BOTTOM,
  statisticsDataZoomSlider,
} from './statistics-chart-data-zoom';

const COLOR_TOTAL = '#fbbf24';
const COLOR_TOTAL_CHANGED = '#60a5fa';
const COLOR_TOTAL_PERIOD_CHANGED = '#c084fc';

@Component({
  selector: 'app-shareholders-total-daily-chart',
  templateUrl: './shareholders-total-daily-chart.html',
  styleUrl: './shareholders-total-daily-chart.css',
})
export class ShareholdersTotalDailyChart implements AfterViewInit, OnDestroy {
  readonly dataset = input.required<ParsedDataset>();
  readonly startDate = input.required<string>();
  readonly endDate = input.required<string>();

  private readonly chartHost = viewChild.required<ElementRef<HTMLDivElement>>('chartHost');

  protected readonly i18n = inject(LocaleService);

  protected readonly aggregate = computed(() => aggregateShareholdersDailyFull(this.dataset()));

  protected readonly hasData = computed(() => hasShareholdersAggregateData(this.aggregate()));

  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private viewStart = '';
  private viewEnd = '';
  private rangeKey = '';
  private readonly onDataZoom = (): void => {
    if (!this.chart) {
      return;
    }
    const { dates } = this.aggregate();
    const range = readDataZoomRange(this.chart, dates, this.viewStart, this.viewEnd);
    this.viewStart = range.start;
    this.viewEnd = range.end;
  };

  constructor() {
    effect(() => {
      const from = this.startDate();
      const to = this.endDate();
      const key = `${from}|${to}`;
      if (key !== this.rangeKey) {
        this.rangeKey = key;
        const window = clampViewRange(from, to, this.aggregate().dates);
        this.viewStart = window.start;
        this.viewEnd = window.end;
      }
      this.aggregate();
      this.i18n.locale();
      this.render();
    });
  }

  ngAfterViewInit(): void {
    this.chart = echarts.init(this.chartHost().nativeElement);
    this.chart.on('datazoom', this.onDataZoom);
    const window = clampViewRange(this.startDate(), this.endDate(), this.aggregate().dates);
    this.viewStart = window.start;
    this.viewEnd = window.end;
    this.rangeKey = `${this.startDate()}|${this.endDate()}`;
    this.render();
    this.resizeObserver = new ResizeObserver(() => {
      this.chart?.resize();
    });
    this.resizeObserver.observe(this.chartHost().nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.off('datazoom', this.onDataZoom);
    this.chart?.dispose();
  }

  private render(): void {
    if (!this.chart) {
      return;
    }
    const { dates, totalShareholders, totalShareholdersChanged, totalShareholdersChangedInPeriod } =
      this.aggregate();
    if (!hasShareholdersAggregateData(this.aggregate())) {
      return;
    }

    const allLabel = this.i18n.text('stats.shareholdersTotalDailyAll');
    const changedLabel = this.i18n.text('stats.shareholdersTotalDailyChanged');
    const periodChangedLabel = this.i18n.text('stats.shareholdersTotalPeriodChanged');
    const span = fullSpanForDates(dates);
    const zoom = clampViewRange(this.viewStart, this.viewEnd, dates);
    this.viewStart = zoom.start || span.start;
    this.viewEnd = zoom.end || span.end;
    this.chart.setOption(
      {
        animation: false,
        legend: {
          show: true,
          bottom: STATISTICS_CHART_LEGEND_BOTTOM,
          textStyle: { color: '#94a3b8', fontSize: 11 },
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line' },
          confine: true,
          formatter: (params: unknown) => this.totalTooltipFormatter(params),
        },
        grid: { left: 56, right: 16, top: 16, bottom: STATISTICS_CHART_GRID_BOTTOM },
        dataZoom: [statisticsDataZoomSlider(this.viewStart, this.viewEnd)],
        xAxis: {
          type: 'category',
          data: dates,
          axisLabel: { rotate: dates.length > 8 ? 90 : 0, fontSize: 10, color: '#94a3b8' },
          axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: '#94a3b8', fontSize: 10 },
          splitLine: { lineStyle: { color: '#334155' } },
        },
        series: [
          {
            name: allLabel,
            type: 'line',
            data: totalShareholders,
            showSymbol: true,
            itemStyle: { color: COLOR_TOTAL },
            lineStyle: { color: COLOR_TOTAL },
          },
          {
            name: changedLabel,
            type: 'line',
            data: totalShareholdersChanged,
            showSymbol: true,
            itemStyle: { color: COLOR_TOTAL_CHANGED },
            lineStyle: { color: COLOR_TOTAL_CHANGED },
          },
          {
            name: periodChangedLabel,
            type: 'line',
            data: totalShareholdersChangedInPeriod,
            showSymbol: true,
            itemStyle: { color: COLOR_TOTAL_PERIOD_CHANGED },
            lineStyle: { color: COLOR_TOTAL_PERIOD_CHANGED },
          },
        ],
      },
      true,
    );
  }

  private totalTooltipFormatter(params: unknown): string {
    if (!Array.isArray(params) || params.length === 0) {
      return '';
    }
    const first = params[0] as { axisValue?: string };
    const lines: string[] = [first.axisValue ?? ''];
    for (const item of params) {
      const row = item as { value?: number; marker?: string };
      const value = typeof row.value === 'number' ? row.value : 0;
      lines.push(`${row.marker ?? ''} ${value.toLocaleString()}`);
    }
    return lines.join('<br/>');
  }
}
