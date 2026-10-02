import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import * as echarts from 'echarts';

import type { ParsedDataset } from '../core/data/vectors.types';
import { LocaleService } from '../core/i18n/locale.service';
import {
  aggregateShareholdersDaily,
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
import {
  type ChartSeriesPoint,
  type SeriesTransformMode,
  transformSeriesForChart,
  visibleIndexRange,
} from './statistics-series-transform';

const COLOR_TOTAL = '#fbbf24';
const COLOR_TOTAL_CHANGED = '#60a5fa';
const COLOR_TOTAL_PERIOD_CHANGED = '#c084fc';

const SCALE_MODE_CYCLE: SeriesTransformMode[] = ['baseline', 'difference', 'zscore', 'absolute'];
/** Offset for a second right y-axis (period-changed series). */
const PERIOD_Y_AXIS_OFFSET = 52;

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

  protected readonly scaleMode = signal<SeriesTransformMode>('baseline');

  protected readonly aggregate = computed(() => {
    const dataset = this.dataset();
    const from = this.startDate();
    const to = this.endDate();
    if (!from || !to) {
      const dates = dataset.dates;
      if (dates.length === 0) {
        return aggregateShareholdersDaily(dataset, '', '');
      }
      return aggregateShareholdersDaily(dataset, dates[0], dates[dates.length - 1] ?? '');
    }
    return aggregateShareholdersDaily(dataset, from, to);
  });

  protected readonly hasData = computed(() => hasShareholdersAggregateData(this.aggregate()));

  protected readonly scaleModeLabel = computed(() => {
    const mode = this.scaleMode();
    const key = `stats.shareholdersTotalDailyScale${mode.charAt(0).toUpperCase()}${mode.slice(1)}` as
      | 'stats.shareholdersTotalDailyScaleBaseline'
      | 'stats.shareholdersTotalDailyScaleDifference'
      | 'stats.shareholdersTotalDailyScaleZscore'
      | 'stats.shareholdersTotalDailyScaleAbsolute';
    return this.i18n.text(key);
  });

  protected readonly scaleSubtitle = computed(() => {
    if (this.scaleMode() === 'absolute') {
      return '';
    }
    return this.i18n.text('stats.shareholdersTotalDailyScaleHint');
  });

  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private viewStart = '';
  private viewEnd = '';
  private rangeKey = '';
  /** Maps ECharts series names (legend labels) to compact tooltip labels. */
  private readonly seriesTooltipName = new Map<string, string>();
  private readonly onDataZoom = (): void => {
    if (!this.chart) {
      return;
    }
    const { dates } = this.aggregate();
    const range = readDataZoomRange(this.chart, dates, this.viewStart, this.viewEnd);
    this.viewStart = range.start;
    this.viewEnd = range.end;
    this.render();
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
      this.scaleMode();
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

  protected cycleScaleMode(): void {
    const mode = this.scaleMode();
    const index = SCALE_MODE_CYCLE.indexOf(mode);
    const next = SCALE_MODE_CYCLE[(index + 1) % SCALE_MODE_CYCLE.length] ?? 'baseline';
    this.scaleMode.set(next);
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

    const mode = this.scaleMode();
    const allLabel = this.i18n.text('stats.shareholdersTotalDailyAll');
    const changedLabel = this.i18n.text('stats.shareholdersTotalDailyChanged');
    const periodChangedLabel = this.i18n.text('stats.shareholdersTotalPeriodChanged');
    const span = fullSpanForDates(dates);
    const zoom = clampViewRange(this.viewStart, this.viewEnd, dates);
    this.viewStart = zoom.start || span.start;
    this.viewEnd = zoom.end || span.end;

    const { startIndex, endIndex } = visibleIndexRange(dates, this.viewStart, this.viewEnd);
    const totalTransformed = transformSeriesForChart(totalShareholders, mode, startIndex, endIndex);
    const changedTransformed = transformSeriesForChart(
      totalShareholdersChanged,
      mode,
      startIndex,
      endIndex,
    );
    const periodTransformed = transformSeriesForChart(
      totalShareholdersChangedInPeriod,
      mode,
      startIndex,
      endIndex,
    );

    this.seriesTooltipName.clear();
    this.seriesTooltipName.set(allLabel, this.i18n.text('stats.shareholdersTotalDailyTooltipSeriesAll'));
    this.seriesTooltipName.set(
      changedLabel,
      this.i18n.text('stats.shareholdersTotalDailyTooltipSeriesChanged'),
    );
    this.seriesTooltipName.set(
      periodChangedLabel,
      this.i18n.text('stats.shareholdersTotalDailyTooltipSeriesPeriod'),
    );

    const useSplitAxes = mode !== 'absolute';
    const yAxis = useSplitAxes
      ? [
          this.buildYAxis(mode, totalTransformed.baseline, totalTransformed.mean, totalTransformed.std),
          this.buildYAxis(
            mode,
            changedTransformed.baseline,
            changedTransformed.mean,
            changedTransformed.std,
            { right: true },
          ),
          this.buildYAxis(
            mode,
            periodTransformed.baseline,
            periodTransformed.mean,
            periodTransformed.std,
            { right: true, offset: PERIOD_Y_AXIS_OFFSET },
          ),
        ]
      : [
          {
            type: 'value' as const,
            axisLabel: { color: '#94a3b8', fontSize: 10 },
            splitLine: { lineStyle: { color: '#334155' } },
          },
        ];

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
          formatter: (params: unknown) => this.totalTooltipFormatter(params, mode),
        },
        grid: {
          left: 56,
          right: useSplitAxes ? 56 + PERIOD_Y_AXIS_OFFSET : 16,
          top: 16,
          bottom: STATISTICS_CHART_GRID_BOTTOM,
        },
        dataZoom: [statisticsDataZoomSlider(this.viewStart, this.viewEnd)],
        xAxis: {
          type: 'category',
          data: dates,
          axisLabel: { rotate: dates.length > 8 ? 90 : 0, fontSize: 10, color: '#94a3b8' },
          axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis,
        series: [
          {
            name: allLabel,
            type: 'line',
            yAxisIndex: 0,
            data: totalTransformed.points,
            showSymbol: true,
            itemStyle: { color: COLOR_TOTAL },
            lineStyle: { color: COLOR_TOTAL },
          },
          {
            name: changedLabel,
            type: 'line',
            yAxisIndex: useSplitAxes ? 1 : 0,
            data: changedTransformed.points,
            showSymbol: true,
            itemStyle: { color: COLOR_TOTAL_CHANGED },
            lineStyle: { color: COLOR_TOTAL_CHANGED },
          },
          {
            name: periodChangedLabel,
            type: 'line',
            yAxisIndex: useSplitAxes ? 2 : 0,
            data: periodTransformed.points,
            showSymbol: true,
            itemStyle: { color: COLOR_TOTAL_PERIOD_CHANGED },
            lineStyle: { color: COLOR_TOTAL_PERIOD_CHANGED },
          },
        ],
      },
      true,
    );
  }

  private buildYAxis(
    mode: SeriesTransformMode,
    baseline: number | undefined,
    mean: number | undefined,
    std: number | undefined,
    options: { right?: boolean; offset?: number } = {},
  ): echarts.YAXisComponentOption {
    const name = this.yAxisName(mode, baseline, mean, std);
    const right = options.right ?? false;
    return {
      type: 'value',
      scale: mode !== 'absolute',
      position: right ? 'right' : 'left',
      offset: options.offset ?? 0,
      name,
      nameTextStyle: { color: '#94a3b8', fontSize: 10 },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
      splitLine: { show: !right, lineStyle: { color: '#334155' } },
    };
  }

  private yAxisName(
    mode: SeriesTransformMode,
    baseline: number | undefined,
    mean: number | undefined,
    std: number | undefined,
  ): string {
    if (mode === 'baseline' && baseline !== undefined) {
      return this.i18n.text('stats.shareholdersTotalDailyAxisBaseline', {
        baseline: baseline.toLocaleString(),
      });
    }
    if (mode === 'difference') {
      return this.i18n.text('stats.shareholdersTotalDailyAxisDifference');
    }
    if (mode === 'zscore') {
      return this.i18n.text('stats.shareholdersTotalDailyAxisZscore', {
        mean: (mean ?? 0).toLocaleString(),
        std: (std ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 }),
      });
    }
    return '';
  }

  private totalTooltipFormatter(params: unknown, mode: SeriesTransformMode): string {
    if (!Array.isArray(params) || params.length === 0) {
      return '';
    }
    const first = params[0] as { axisValue?: string };
    const lines: string[] = [first.axisValue ?? ''];
    for (const item of params) {
      const row = item as {
        seriesName?: string;
        marker?: string;
        data?: ChartSeriesPoint | number;
        value?: number | null;
      };
      const point = this.resolvePoint(row);
      if (!point) {
        continue;
      }
      const shortName = this.seriesTooltipName.get(row.seriesName ?? '');
      if (!shortName) {
        continue;
      }
      const count = point.raw.toLocaleString();
      if (mode === 'absolute') {
        lines.push(`${row.marker ?? ''} ${shortName}: ${count}`);
        continue;
      }
      const display =
        point.value === null || point.value === undefined ? '—' : point.value.toLocaleString();
      let displayLabel: string;
      if (mode === 'baseline') {
        displayLabel = this.i18n.text('stats.shareholdersTotalDailyTooltipDelta');
      } else if (mode === 'difference') {
        displayLabel = this.i18n.text('stats.shareholdersTotalDailyTooltipStep');
      } else {
        displayLabel = this.i18n.text('stats.shareholdersTotalDailyTooltipZ');
      }
      lines.push(`${row.marker ?? ''} ${shortName}: ${count} · ${displayLabel} ${display}`);
    }
    return lines.join('<br/>');
  }

  private resolvePoint(row: {
    data?: ChartSeriesPoint | number;
    value?: number | null;
  }): ChartSeriesPoint | null {
    if (row.data !== undefined && typeof row.data === 'object' && row.data !== null && 'raw' in row.data) {
      return row.data;
    }
    if (typeof row.data === 'number') {
      return { value: row.data, raw: row.data };
    }
    if (typeof row.value === 'number') {
      return { value: row.value, raw: row.value };
    }
    return null;
  }
}
