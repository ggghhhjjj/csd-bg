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
  aggregateShareholdersDailyFull,
  hasShareholdersAggregateData,
} from './shareholders-daily-aggregate';
import { dateAtCategoryChartPixel } from './statistics-chart-category-date';
import {
  clampViewRange,
  fullSpanForDates,
  readDataZoomRange,
  STATISTICS_CHART_GRID_BOTTOM,
  STATISTICS_CHART_LEGEND_BOTTOM,
  statisticsDataZoomSlider,
} from './statistics-chart-data-zoom';

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
    const { dates } = this.aggregate();
    const date = dateAtCategoryChartPixel(this.chart, offsetX, offsetY, dates);
    if (date) {
      this.dateSelect.emit(date);
    }
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
    this.chart.getZr().on('click', this.onZrClick);
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
          axisPointer: { type: 'shadow' },
          confine: true,
          formatter: (params: unknown) => this.flowTooltipFormatter(params, incomingLabel, outgoingLabel),
        },
        grid: { left: 56, right: 16, top: 16, bottom: STATISTICS_CHART_GRID_BOTTOM },
        dataZoom: [statisticsDataZoomSlider(this.viewStart, this.viewEnd)],
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
