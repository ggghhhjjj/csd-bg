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

import {
  bindChartSliderDataZoom,
  chartSliderDataZoomOptions,
  type ChartSliderDataZoomBinding,
} from '../core/chart/chart-slider-data-zoom';
import {
  finiteMinMaxInWindow,
  niceAxisBounds,
} from '../core/chart/nice-axis-bounds';
import { visibleIndexRange } from '../core/data/date-range';
import { formatDelta } from '../core/data/vectors.types';
import { LocaleService } from '../core/i18n/locale.service';
import { HelpTrigger } from '../help/help-trigger';
import {
  hasShareholdersAggregateData,
  marketTotalShareholdersWindowSpan,
  type ShareholdersDailyAggregate,
} from './shareholders-daily-aggregate';
import {
  bindChartDatePick,
  selectedDateMarkLine,
  type ChartDatePickBinding,
} from './shareholders-chart-date-pick';
import { SHAREHOLDERS_TOTAL_DAILY_CHART_HELP } from './shareholders-total-daily-chart.help-id';

const COLOR_TOTAL = '#fbbf24';
const COLOR_TOTAL_CHANGED = '#60a5fa';

@Component({
  selector: 'app-shareholders-total-daily-chart',
  imports: [HelpTrigger],
  templateUrl: './shareholders-total-daily-chart.html',
  styleUrl: './shareholders-total-daily-chart.css',
})
export class ShareholdersTotalDailyChart implements AfterViewInit, OnDestroy {
  readonly aggregate = input.required<ShareholdersDailyAggregate>();
  readonly viewStart = input.required<string>();
  readonly viewEnd = input.required<string>();
  readonly selectedDate = input<string | null>(null);
  readonly dateSelected = output<string>();
  readonly viewRangeChange = output<{ from: string; to: string }>();

  private readonly chartHost = viewChild.required<ElementRef<HTMLDivElement>>('chartHost');

  protected readonly i18n = inject(LocaleService);
  protected readonly helpTopic = SHAREHOLDERS_TOTAL_DAILY_CHART_HELP;

  protected readonly windowSpan = computed(() => {
    if (!hasShareholdersAggregateData(this.aggregate())) {
      return null;
    }
    return marketTotalShareholdersWindowSpan(
      this.aggregate(),
      this.viewStart(),
      this.viewEnd(),
    );
  });

  protected readonly windowDiffLabel = computed(() => {
    const span = this.windowSpan();
    if (!span) {
      return '';
    }
    return this.i18n.text('stats.shareholdersTotalDailyWindowDiff', {
      from: span.from,
      to: span.to,
      diff: formatDelta(span.startValue, span.endValue, false),
    });
  });

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
    const { dates, totalShareholders, totalShareholdersChanged } = this.aggregate();
    if (!hasShareholdersAggregateData(this.aggregate())) {
      return;
    }

    const viewStart = this.viewStart();
    const viewEnd = this.viewEnd();
    const { startIndex, endIndex } = visibleIndexRange(dates, viewStart, viewEnd);
    const allLabel = this.i18n.text('stats.shareholdersTotalDailyAll');
    const changedLabel = this.i18n.text('stats.shareholdersTotalDailyChanged');
    const bottom = dates.length > 8 ? 110 : 96;
    const totalExtent = finiteMinMaxInWindow(totalShareholders, startIndex, endIndex);
    const changedExtent = finiteMinMaxInWindow(totalShareholdersChanged, startIndex, endIndex);
    const totalBounds = totalExtent ? niceAxisBounds(totalExtent.min, totalExtent.max) : null;
    const changedBounds = changedExtent ? niceAxisBounds(changedExtent.min, changedExtent.max) : null;
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
          axisPointer: { type: 'line' },
          confine: true,
          formatter: (params: unknown) => this.totalTooltipFormatter(params),
        },
        grid: { left: 56, right: 56, top: 16, bottom },
        dataZoom: [chartSliderDataZoomOptions(viewStart, viewEnd)],
        xAxis: {
          type: 'category',
          data: dates,
          axisLabel: { rotate: dates.length > 8 ? 90 : 0, fontSize: 10, color: '#94a3b8' },
          axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: [
          {
            type: 'value',
            position: 'left',
            ...(totalBounds ? { min: totalBounds.min, max: totalBounds.max } : {}),
            axisLine: { show: true, lineStyle: { color: COLOR_TOTAL } },
            axisLabel: { color: COLOR_TOTAL, fontSize: 10 },
            splitLine: { lineStyle: { color: '#334155' } },
          },
          {
            type: 'value',
            position: 'right',
            ...(changedBounds ? { min: changedBounds.min, max: changedBounds.max } : {}),
            axisLine: { show: true, lineStyle: { color: COLOR_TOTAL_CHANGED } },
            axisLabel: { color: COLOR_TOTAL_CHANGED, fontSize: 10 },
            splitLine: { show: false },
          },
        ],
        series: [
          {
            name: allLabel,
            type: 'line',
            yAxisIndex: 0,
            data: totalShareholders,
            showSymbol: true,
            triggerEvent: true,
            itemStyle: { color: COLOR_TOTAL },
            lineStyle: { color: COLOR_TOTAL },
            ...(markLine ? { markLine } : {}),
          },
          {
            name: changedLabel,
            type: 'line',
            yAxisIndex: 1,
            data: totalShareholdersChanged,
            showSymbol: true,
            triggerEvent: true,
            itemStyle: { color: COLOR_TOTAL_CHANGED },
            lineStyle: { color: COLOR_TOTAL_CHANGED },
          },
        ],
      },
      true,
    );
  }

  protected windowDiffClass(): string {
    const diff = this.windowSpan()?.diff ?? null;
    if (diff === null || diff === 0) {
      return 'shareholders-total-daily-chart__window-diff';
    }
    if (diff > 0) {
      return 'shareholders-total-daily-chart__window-diff shareholders-total-daily-chart__window-diff--up';
    }
    return 'shareholders-total-daily-chart__window-diff shareholders-total-daily-chart__window-diff--down';
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
