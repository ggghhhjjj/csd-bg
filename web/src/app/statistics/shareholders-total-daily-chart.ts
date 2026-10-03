import {
  AfterViewInit,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  viewChild,
} from '@angular/core';
import * as echarts from 'echarts';

import { niceAxisBoundsForSeriesWindow } from '../core/chart/nice-axis-bounds';
import { LocaleService } from '../core/i18n/locale.service';
import {
  hasShareholdersAggregateData,
  type ShareholdersDailyAggregate,
} from './shareholders-daily-aggregate';

const COLOR_TOTAL = '#fbbf24';
const COLOR_TOTAL_CHANGED = '#60a5fa';
const COLOR_TOTAL_PERIOD_CHANGED = '#c084fc';

@Component({
  selector: 'app-shareholders-total-daily-chart',
  templateUrl: './shareholders-total-daily-chart.html',
  styleUrl: './shareholders-total-daily-chart.css',
})
export class ShareholdersTotalDailyChart implements AfterViewInit, OnDestroy {
  readonly aggregate = input.required<ShareholdersDailyAggregate>();

  private readonly chartHost = viewChild.required<ElementRef<HTMLDivElement>>('chartHost');

  protected readonly i18n = inject(LocaleService);

  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      this.aggregate();
      this.i18n.locale();
      this.render();
    });
  }

  ngAfterViewInit(): void {
    this.chart = echarts.init(this.chartHost().nativeElement);
    this.render();
    this.resizeObserver = new ResizeObserver(() => {
      this.chart?.resize();
    });
    this.resizeObserver.observe(this.chartHost().nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }

  private render(): void {
    if (!this.chart) {
      return;
    }
    const {
      dates,
      totalShareholders,
      totalShareholdersChanged,
      totalShareholdersChangedInPeriod,
    } = this.aggregate();
    if (!hasShareholdersAggregateData(this.aggregate())) {
      return;
    }

    const allLabel = this.i18n.text('stats.shareholdersTotalDailyAll');
    const changedLabel = this.i18n.text('stats.shareholdersTotalDailyChanged');
    const periodChangedLabel = this.i18n.text('stats.shareholdersTotalPeriodChanged');
    const bottom = dates.length > 8 ? 96 : 72;
    const windowEnd = dates.length - 1;
    const yBounds = niceAxisBoundsForSeriesWindow(
      [totalShareholders, totalShareholdersChanged, totalShareholdersChangedInPeriod],
      0,
      windowEnd,
    );
    this.chart.setOption(
      {
        animation: false,
        legend: {
          show: true,
          bottom: 0,
          textStyle: { color: '#94a3b8', fontSize: 11 },
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line' },
          confine: true,
          formatter: (params: unknown) => this.totalTooltipFormatter(params),
        },
        grid: { left: 56, right: 16, top: 16, bottom },
        xAxis: {
          type: 'category',
          data: dates,
          axisLabel: { rotate: dates.length > 8 ? 90 : 0, fontSize: 10, color: '#94a3b8' },
          axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
          type: 'value',
          ...(yBounds ? { min: yBounds.min, max: yBounds.max } : {}),
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
