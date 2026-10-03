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

import { LocaleService } from '../core/i18n/locale.service';
import {
  hasShareholdersAggregateData,
  type ShareholdersDailyAggregate,
} from './shareholders-daily-aggregate';

const COLOR_LOSSES = '#f87171';
const COLOR_GAINS = '#34d399';
const FLOW_STACK_ID = 'flow';

@Component({
  selector: 'app-shareholders-flow-daily-chart',
  templateUrl: './shareholders-flow-daily-chart.html',
  styleUrl: './shareholders-flow-daily-chart.css',
})
export class ShareholdersFlowDailyChart implements AfterViewInit, OnDestroy {
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
    const { dates, losses, gains } = this.aggregate();
    if (!hasShareholdersAggregateData(this.aggregate())) {
      return;
    }

    const incomingLabel = this.i18n.text('stats.shareholdersGainsDaily');
    const outgoingLabel = this.i18n.text('stats.shareholdersLossesDaily');
    const bottom = dates.length > 8 ? 88 : 64;
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
}
