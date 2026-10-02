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
const COLOR_TOTAL_CHANGED = '#60a5fa';
const COLOR_TOTAL_PERIOD_CHANGED = '#c084fc';
const FLOW_STACK_ID = 'flow';

@Component({
  selector: 'app-shareholders-market-charts',
  templateUrl: './shareholders-market-charts.html',
  styleUrl: './shareholders-market-charts.css',
})
export class ShareholdersMarketCharts implements AfterViewInit, OnDestroy {
  readonly dataset = input.required<ParsedDataset>();
  readonly startDate = input.required<string>();
  readonly endDate = input.required<string>();

  private readonly flowHost = viewChild.required<ElementRef<HTMLDivElement>>('flowHost');
  private readonly totalHost = viewChild.required<ElementRef<HTMLDivElement>>('totalHost');
  private readonly periodChangedHost = viewChild.required<ElementRef<HTMLDivElement>>('periodChangedHost');

  protected readonly i18n = inject(LocaleService);

  protected readonly aggregate = computed(() => {
    const from = this.startDate();
    const to = this.endDate();
    if (!from || !to) {
      return {
        dates: [],
        losses: [],
        gains: [],
        totalShareholders: [],
        totalShareholdersChanged: [],
        totalShareholdersChangedInPeriod: [],
      };
    }
    return aggregateShareholdersDaily(this.dataset(), from, to);
  });

  protected readonly hasData = computed(() => hasShareholdersAggregateData(this.aggregate()));

  private flowChart: echarts.ECharts | null = null;
  private totalChart: echarts.ECharts | null = null;
  private periodChangedChart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      this.aggregate();
      this.i18n.locale();
      this.renderAll();
    });
  }

  ngAfterViewInit(): void {
    this.flowChart = echarts.init(this.flowHost().nativeElement);
    this.totalChart = echarts.init(this.totalHost().nativeElement);
    this.periodChangedChart = echarts.init(this.periodChangedHost().nativeElement);
    this.renderAll();
    this.resizeObserver = new ResizeObserver(() => {
      this.flowChart?.resize();
      this.totalChart?.resize();
      this.periodChangedChart?.resize();
    });
    for (const host of [this.flowHost(), this.totalHost(), this.periodChangedHost()]) {
      this.resizeObserver.observe(host.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.flowChart?.dispose();
    this.totalChart?.dispose();
    this.periodChangedChart?.dispose();
  }

  private renderAll(): void {
    if (!this.flowChart || !this.totalChart || !this.periodChangedChart) {
      return;
    }
    const { dates, losses, gains, totalShareholders, totalShareholdersChanged, totalShareholdersChangedInPeriod } =
      this.aggregate();
    if (
      !hasShareholdersAggregateData({
        dates,
        losses,
        gains,
        totalShareholders,
        totalShareholdersChanged,
        totalShareholdersChangedInPeriod,
      })
    ) {
      return;
    }

    this.renderStackedFlowChart(
      this.flowChart,
      dates,
      gains,
      losses,
      this.i18n.text('stats.shareholdersGainsDaily'),
      this.i18n.text('stats.shareholdersLossesDaily'),
    );
    this.renderTotalComparisonChart(
      this.totalChart,
      dates,
      totalShareholders,
      totalShareholdersChanged,
      totalShareholdersChangedInPeriod,
      this.i18n.text('stats.shareholdersTotalDailyAll'),
      this.i18n.text('stats.shareholdersTotalDailyChanged'),
      this.i18n.text('stats.shareholdersTotalPeriodChanged'),
    );
    this.renderSingleLineChart(
      this.periodChangedChart,
      dates,
      totalShareholdersChangedInPeriod,
      this.i18n.text('stats.shareholdersTotalPeriodChanged'),
      COLOR_TOTAL_PERIOD_CHANGED,
    );
  }

  private renderStackedFlowChart(
    chart: echarts.ECharts,
    dates: string[],
    gains: number[],
    losses: number[],
    incomingLabel: string,
    outgoingLabel: string,
  ): void {
    const bottom = dates.length > 8 ? 88 : 64;
    chart.setOption(
      {
        animation: false,
        legend: {
          show: true,
          bottom: 0,
          textStyle: { color: '#94a3b8', fontSize: 11 },
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          confine: true,
          formatter: (params: unknown) => this.flowTooltipFormatter(params, incomingLabel, outgoingLabel),
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
          axisLabel: { color: '#94a3b8', fontSize: 10 },
          splitLine: { lineStyle: { color: '#334155' } },
        },
        series: [
          {
            name: incomingLabel,
            type: 'bar',
            stack: FLOW_STACK_ID,
            data: gains,
            itemStyle: { color: COLOR_GAINS },
          },
          {
            name: outgoingLabel,
            type: 'bar',
            stack: FLOW_STACK_ID,
            data: losses,
            itemStyle: { color: COLOR_LOSSES },
          },
        ],
      },
      true,
    );
  }

  private flowTooltipFormatter(
    params: unknown,
    incomingLabel: string,
    outgoingLabel: string,
  ): string {
    if (!Array.isArray(params) || params.length === 0) {
      return '';
    }
    const first = params[0] as { axisValue?: string };
    const date = first.axisValue ?? '';
    let incoming = 0;
    let outgoing = 0;
    const lines: string[] = [`${date}`];
    for (const item of params) {
      const row = item as { seriesName?: string; value?: number; marker?: string };
      const value = typeof row.value === 'number' ? row.value : 0;
      if (row.seriesName === incomingLabel) {
        incoming = value;
      } else if (row.seriesName === outgoingLabel) {
        outgoing = value;
      }
      lines.push(`${row.marker ?? ''} ${row.seriesName ?? ''}: ${value.toLocaleString()}`);
    }
    lines.push(`${this.i18n.text('stats.shareholdersFlowTotal')}: ${(incoming + outgoing).toLocaleString()}`);
    return lines.join('<br/>');
  }

  private renderSingleLineChart(
    chart: echarts.ECharts,
    dates: string[],
    values: number[],
    seriesName: string,
    color: string,
  ): void {
    const bottom = dates.length > 8 ? 72 : 48;
    chart.setOption(
      {
        animation: false,
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line' },
          confine: true,
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
          axisLabel: { color: '#94a3b8', fontSize: 10 },
          splitLine: { lineStyle: { color: '#334155' } },
        },
        series: [
          {
            name: seriesName,
            type: 'line',
            data: values,
            showSymbol: true,
            itemStyle: { color },
            lineStyle: { color },
          },
        ],
      },
      true,
    );
  }

  private renderTotalComparisonChart(
    chart: echarts.ECharts,
    dates: string[],
    totalAll: number[],
    totalChanged: number[],
    totalChangedInPeriod: number[],
    allLabel: string,
    changedLabel: string,
    periodChangedLabel: string,
  ): void {
    const bottom = dates.length > 8 ? 96 : 72;
    chart.setOption(
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
          axisLabel: { color: '#94a3b8', fontSize: 10 },
          splitLine: { lineStyle: { color: '#334155' } },
        },
        series: [
          {
            name: allLabel,
            type: 'line',
            data: totalAll,
            showSymbol: true,
            itemStyle: { color: COLOR_TOTAL },
            lineStyle: { color: COLOR_TOTAL },
          },
          {
            name: changedLabel,
            type: 'line',
            data: totalChanged,
            showSymbol: true,
            itemStyle: { color: COLOR_TOTAL_CHANGED },
            lineStyle: { color: COLOR_TOTAL_CHANGED },
          },
          {
            name: periodChangedLabel,
            type: 'line',
            data: totalChangedInPeriod,
            showSymbol: true,
            itemStyle: { color: COLOR_TOTAL_PERIOD_CHANGED },
            lineStyle: { color: COLOR_TOTAL_PERIOD_CHANGED },
          },
        ],
      },
      true,
    );
  }
}
