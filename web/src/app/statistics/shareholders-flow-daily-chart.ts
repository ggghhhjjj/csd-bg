import {
  AfterViewInit,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  viewChild,
} from '@angular/core';
import * as echarts from 'echarts';

import {
  bindChartSliderDataZoom,
  chartSliderDataZoomOptions,
  type ChartSliderDataZoomBinding,
} from '../core/chart/chart-slider-data-zoom';
import { visibleIndexRange } from '../core/data/date-range';
import { LocaleService } from '../core/i18n/locale.service';
import {
  hasShareholdersAggregateData,
  type ShareholdersDailyAggregate,
} from './shareholders-daily-aggregate';
import {
  bindChartDatePick,
  selectedDateMarkLine,
  type ChartDatePickBinding,
} from './shareholders-chart-date-pick';

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
  readonly viewStart = input.required<string>();
  readonly viewEnd = input.required<string>();
  readonly selectedDate = input<string | null>(null);
  readonly dateSelected = output<string>();
  readonly viewRangeChange = output<{ from: string; to: string }>();

  private readonly chartHost = viewChild.required<ElementRef<HTMLDivElement>>('chartHost');

  protected readonly i18n = inject(LocaleService);

  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private datePickBinding: ChartDatePickBinding | null = null;
  private dataZoomBinding: ChartSliderDataZoomBinding | null = null;

  constructor() {
    effect(() => {
      this.aggregate();
      this.viewStart();
      this.viewEnd();
      this.selectedDate();
      this.i18n.locale();
      this.render();
    });
  }

  ngAfterViewInit(): void {
    this.chart = echarts.init(this.chartHost().nativeElement);
    this.datePickBinding = bindChartDatePick(
      this.chart,
      this.chartHost().nativeElement,
      () => this.aggregate().dates,
      (iso) => this.dateSelected.emit(iso),
    );
    this.dataZoomBinding = bindChartSliderDataZoom(this.chart, {
      getDates: () => this.aggregate().dates,
      getFallbackRange: () => ({ from: this.viewStart(), to: this.viewEnd() }),
      onRangeChange: (from, to) => {
        if (from === this.viewStart() && to === this.viewEnd()) {
          return;
        }
        this.viewRangeChange.emit({ from, to });
      },
    });
    this.render();
    this.resizeObserver = new ResizeObserver(() => {
      this.chart?.resize();
    });
    this.resizeObserver.observe(this.chartHost().nativeElement);
  }

  ngOnDestroy(): void {
    this.dataZoomBinding?.dispose();
    this.dataZoomBinding = null;
    this.datePickBinding?.dispose();
    this.datePickBinding = null;
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

    const viewStart = this.viewStart();
    const viewEnd = this.viewEnd();
    const { startIndex, endIndex } = visibleIndexRange(dates, viewStart, viewEnd);
    let yMax = 0;
    for (let i = startIndex; i <= endIndex; i += 1) {
      const stack = (gains[i] ?? 0) + (losses[i] ?? 0);
      if (stack > yMax) {
        yMax = stack;
      }
    }

    const incomingLabel = this.i18n.text('stats.shareholdersGainsDaily');
    const outgoingLabel = this.i18n.text('stats.shareholdersLossesDaily');
    const bottom = dates.length > 8 ? 110 : 96;
    const markLine = selectedDateMarkLine(this.selectedDate(), dates);
    this.chart.setOption(
      {
        animation: false,
        legend: {
          show: true,
          bottom: 36,
          textStyle: { color: '#94a3b8', fontSize: 11 },
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          confine: true,
          formatter: (params: unknown) => this.flowTooltipFormatter(params, incomingLabel, outgoingLabel),
        },
        grid: { left: 56, right: 16, top: 16, bottom },
        dataZoom: [chartSliderDataZoomOptions(viewStart, viewEnd)],
        xAxis: {
          type: 'category',
          data: dates,
          axisLabel: { rotate: dates.length > 8 ? 90 : 0, fontSize: 10, color: '#94a3b8' },
          axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
          type: 'value',
          ...(yMax > 0 ? { min: 0, max: Math.ceil(yMax * 1.05) } : {}),
          axisLabel: { color: '#94a3b8', fontSize: 10 },
          splitLine: { lineStyle: { color: '#334155' } },
        },
        series: [
          {
            name: incomingLabel,
            type: 'bar',
            stack: FLOW_STACK_ID,
            data: gains,
            triggerEvent: true,
            itemStyle: { color: COLOR_GAINS },
            ...(markLine ? { markLine } : {}),
          },
          {
            name: outgoingLabel,
            type: 'bar',
            stack: FLOW_STACK_ID,
            data: losses,
            triggerEvent: true,
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
