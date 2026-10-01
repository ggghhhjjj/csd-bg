import {
  AfterViewInit,
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  viewChild,
  ElementRef,
} from '@angular/core';
import * as echarts from 'echarts';

import type { ParsedDataset } from '../core/data/vectors.types';
import { LocaleService } from '../core/i18n/locale.service';
import {
  aggregateShareholdersDaily,
  hasShareholdersAggregateData,
} from './shareholders-daily-aggregate';

const COLOR_LOSSES = '#f87171';
const COLOR_GAINS = '#34d399';
const COLOR_TOTAL = '#fbbf24';

@Component({
  selector: 'app-shareholders-market-charts',
  templateUrl: './shareholders-market-charts.html',
  styleUrl: './shareholders-market-charts.css',
})
export class ShareholdersMarketCharts implements AfterViewInit, OnDestroy {
  readonly dataset = input.required<ParsedDataset>();
  readonly startDate = input.required<string>();
  readonly endDate = input.required<string>();

  private readonly lossesHost = viewChild.required<ElementRef<HTMLDivElement>>('lossesHost');
  private readonly gainsHost = viewChild.required<ElementRef<HTMLDivElement>>('gainsHost');
  private readonly totalHost = viewChild.required<ElementRef<HTMLDivElement>>('totalHost');

  protected readonly i18n = inject(LocaleService);

  protected readonly aggregate = computed(() => {
    const from = this.startDate();
    const to = this.endDate();
    if (!from || !to) {
      return { dates: [], losses: [], gains: [], totalShareholders: [] };
    }
    return aggregateShareholdersDaily(this.dataset(), from, to);
  });

  protected readonly hasData = computed(() => hasShareholdersAggregateData(this.aggregate()));

  private lossesChart: echarts.ECharts | null = null;
  private gainsChart: echarts.ECharts | null = null;
  private totalChart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      this.aggregate();
      this.i18n.locale();
      this.renderAll();
    });
  }

  ngAfterViewInit(): void {
    this.lossesChart = echarts.init(this.lossesHost().nativeElement);
    this.gainsChart = echarts.init(this.gainsHost().nativeElement);
    this.totalChart = echarts.init(this.totalHost().nativeElement);
    this.renderAll();
    this.resizeObserver = new ResizeObserver(() => {
      this.lossesChart?.resize();
      this.gainsChart?.resize();
      this.totalChart?.resize();
    });
    for (const host of [this.lossesHost(), this.gainsHost(), this.totalHost()]) {
      this.resizeObserver.observe(host.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.lossesChart?.dispose();
    this.gainsChart?.dispose();
    this.totalChart?.dispose();
  }

  private renderAll(): void {
    if (!this.lossesChart || !this.gainsChart || !this.totalChart) {
      return;
    }
    const { dates, losses, gains, totalShareholders } = this.aggregate();
    if (!hasShareholdersAggregateData({ dates, losses, gains, totalShareholders })) {
      return;
    }

    this.renderBar(this.lossesChart, dates, losses, this.i18n.text('stats.shareholdersLossesDaily'), COLOR_LOSSES);
    this.renderBar(this.gainsChart, dates, gains, this.i18n.text('stats.shareholdersGainsDaily'), COLOR_GAINS);
    this.renderLine(
      this.totalChart,
      dates,
      totalShareholders,
      this.i18n.text('stats.shareholdersTotalDaily'),
      COLOR_TOTAL,
    );
  }

  private renderBar(
    chart: echarts.ECharts,
    dates: string[],
    values: number[],
    seriesName: string,
    color: string,
  ): void {
    chart.setOption(this.baseOption(dates, seriesName, color, 'bar', values), true);
  }

  private renderLine(
    chart: echarts.ECharts,
    dates: string[],
    values: number[],
    seriesName: string,
    color: string,
  ): void {
    chart.setOption(this.baseOption(dates, seriesName, color, 'line', values), true);
  }

  private baseOption(
    dates: string[],
    seriesName: string,
    color: string,
    type: 'bar' | 'line',
    values: number[],
  ): echarts.EChartsOption {
    return {
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
      },
      grid: { left: 56, right: 16, top: 16, bottom: dates.length > 8 ? 72 : 48 },
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
          name: seriesName,
          type,
          data: values,
          showSymbol: type === 'line',
          itemStyle: { color },
          lineStyle: type === 'line' ? { color } : undefined,
        },
      ],
    };
  }
}
