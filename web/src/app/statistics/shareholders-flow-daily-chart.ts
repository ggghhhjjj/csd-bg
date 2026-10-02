import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  viewChild,
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
const FLOW_STACK_ID = 'flow';

@Component({
  selector: 'app-shareholders-flow-daily-chart',
  templateUrl: './shareholders-flow-daily-chart.html',
  styleUrl: './shareholders-flow-daily-chart.css',
})
export class ShareholdersFlowDailyChart implements AfterViewInit, OnDestroy {
  readonly dataset = input.required<ParsedDataset>();
  readonly startDate = input.required<string>();
  readonly endDate = input.required<string>();
  readonly selectedDate = input<string | null>(null);
  readonly dateSelect = output<string>();

  private readonly chartHost = viewChild.required<ElementRef<HTMLDivElement>>('chartHost');

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

  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onZrClick = (event: { offsetX?: number; offsetY?: number }): void => {
    if (!this.chart) {
      return;
    }
    const offsetX = event.offsetX ?? 0;
    const offsetY = event.offsetY ?? 0;
    const point: [number, number] = [offsetX, offsetY];
    const inPlot =
      this.chart.containPixel({ gridIndex: 0 }, point) ||
      this.chart.containPixel({ xAxisIndex: 0 }, point);
    if (!inPlot) {
      return;
    }
    const date = this.dateAtChartPixel(offsetX, offsetY);
    if (date) {
      this.dateSelect.emit(date);
    }
  };

  constructor() {
    effect(() => {
      this.aggregate();
      this.i18n.locale();
      this.render();
    });
  }

  ngAfterViewInit(): void {
    this.chart = echarts.init(this.chartHost().nativeElement);
    this.chart.getZr().on('click', this.onZrClick);
    this.render();
    this.resizeObserver = new ResizeObserver(() => {
      this.chart?.resize();
    });
    this.resizeObserver.observe(this.chartHost().nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.getZr().off('click', this.onZrClick);
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
          triggerEvent: true,
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

  private dateAtChartPixel(offsetX: number, offsetY: number): string | undefined {
    if (!this.chart) {
      return undefined;
    }
    const { dates } = this.aggregate();
    if (dates.length === 0) {
      return undefined;
    }
    const point: [number, number] = [offsetX, offsetY];
    const fromXAxis = this.chart.convertFromPixel({ xAxisIndex: 0 }, point);
    const fromSeries = this.chart.convertFromPixel({ seriesIndex: 0 }, point);
    return (
      categoryDateFromConvertResult(fromXAxis, dates) ??
      categoryDateFromConvertResult(fromSeries, dates)
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

function categoryDateFromConvertResult(raw: unknown, dates: string[]): string | undefined {
  const index = categoryIndexFromConvertResult(raw, dates);
  if (index !== undefined && index >= 0 && index < dates.length) {
    return dates[index];
  }
  if (typeof raw === 'string' && dates.includes(raw)) {
    return raw;
  }
  return undefined;
}

function categoryIndexFromConvertResult(raw: unknown, dates: string[]): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.round(raw);
  }
  if (typeof raw === 'string') {
    const index = dates.indexOf(raw);
    return index >= 0 ? index : undefined;
  }
  if (Array.isArray(raw) && raw.length > 0) {
    return categoryIndexFromConvertResult(raw[0], dates);
  }
  return undefined;
}
