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
import type * as echarts from 'echarts';
import * as echartsLib from 'echarts';

import { formatDelta, type ParsedDataset } from '../core/data/vectors.types';
import type { TranslationKey } from '../core/i18n/translations';
import { LocaleService } from '../core/i18n/locale.service';
import { HelpTrigger } from '../help/help-trigger';
import {
  chartReferenceLevelsForRows,
  chartRowsForShareholdersDiffRank,
  type RankOrder,
  type ShareholdersDiffChangeFilter,
} from './rank-issuers';
import { SHAREHOLDERS_DIFF_RANK_HELP } from './shareholders-diff-rank.help-id';

const COLOR_LOSSES = '#f87171';
const COLOR_GAINS = '#34d399';
const COLOR_LINE = '#94a3b8';
const COLOR_MEAN_LINE = '#60a5fa';
const COLOR_MEDIAN_LINE = '#fbbf24';
const CHART_HEIGHT_PX = 320;
const DATA_ZOOM_THRESHOLD = 12;

@Component({
  selector: 'app-shareholders-diff-rank-chart',
  imports: [HelpTrigger],
  templateUrl: './shareholders-diff-rank-chart.html',
  styleUrl: './shareholders-diff-rank-chart.css',
})
export class ShareholdersDiffRankChart implements AfterViewInit, OnDestroy {
  readonly dataset = input.required<ParsedDataset>();
  readonly startDate = input.required<string>();
  readonly endDate = input.required<string>();
  readonly order = input.required<RankOrder>();
  readonly showAll = input.required<boolean>();
  readonly changeFilter = input.required<ShareholdersDiffChangeFilter>();

  private readonly chartHost = viewChild<ElementRef<HTMLDivElement>>('chartHost');

  protected readonly i18n = inject(LocaleService);
  protected readonly helpTopic = SHAREHOLDERS_DIFF_RANK_HELP;

  protected readonly chartRows = computed(() => {
    const from = this.startDate();
    const to = this.endDate();
    if (!from || !to) {
      return [];
    }
    return chartRowsForShareholdersDiffRank(
      this.dataset(),
      from,
      to,
      this.order(),
      this.changeFilter(),
      this.showAll(),
    );
  });

  protected readonly hasRows = computed(() => this.chartRows().length > 0);

  protected readonly referenceLevels = computed(() => chartReferenceLevelsForRows(this.chartRows()));

  protected readonly meanLevelText = computed(() =>
    this.formatReferenceLevel(this.referenceLevels().mean, 'stats.shareholdersDiffChartMean'),
  );

  protected readonly medianLevelText = computed(() =>
    this.formatReferenceLevel(this.referenceLevels().median, 'stats.shareholdersDiffChartMedian'),
  );

  protected readonly minLevelText = computed(() =>
    this.formatReferenceLevel(this.referenceLevels().min, 'stats.shareholdersDiffChartMin'),
  );

  protected readonly maxLevelText = computed(() =>
    this.formatReferenceLevel(this.referenceLevels().max, 'stats.shareholdersDiffChartMax'),
  );

  protected readonly chartHeightPx = computed(() => CHART_HEIGHT_PX);

  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      const rows = this.chartRows();
      this.chartHeightPx();
      this.i18n.locale();
      if (rows.length === 0) {
        this.disposeChart();
        return;
      }
      this.initChartIfNeeded();
      this.bindResizeObserver();
      this.render();
    });
  }

  ngAfterViewInit(): void {
    this.bindResizeObserver();
    if (this.hasRows()) {
      this.initChartIfNeeded();
      this.render();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.disposeChart();
  }

  private formatReferenceLevel(value: number | null, labelKey: TranslationKey): string {
    if (value === null) {
      return '';
    }
    return this.i18n.text('stats.shareholdersDiffChartLevel', {
      label: this.i18n.text(labelKey),
      value: formatDelta(0, value, false),
    });
  }

  private disposeChart(): void {
    this.chart?.dispose();
    this.chart = null;
  }

  private bindResizeObserver(): void {
    const host = this.chartHost()?.nativeElement;
    if (!host || this.resizeObserver) {
      return;
    }
    this.resizeObserver = new ResizeObserver(() => {
      this.chart?.resize();
    });
    this.resizeObserver.observe(host);
  }

  private initChartIfNeeded(): void {
    const host = this.chartHost()?.nativeElement;
    if (!host || this.chart) {
      return;
    }
    this.chart = echartsLib.init(host);
  }

  private render(): void {
    this.initChartIfNeeded();
    if (!this.chart || !this.hasRows()) {
      return;
    }

    const rows = this.chartRows();
    const names = rows.map((row) => row.name);
    const values = rows.map((row) => row.diff);
    const pointColors = values.map((value) => (value >= 0 ? COLOR_GAINS : COLOR_LOSSES));

    const { mean: meanValue, median: medianValue } = chartReferenceLevelsForRows(rows);
    const meanLabel = this.i18n.text('stats.shareholdersDiffChartMean');
    const medianLabel = this.i18n.text('stats.shareholdersDiffChartMedian');
    const markLine = buildMeanMedianMarkLine(meanValue, medianValue, meanLabel, medianLabel);

    let yMin: number | undefined;
    let yMax: number | undefined;
    for (const value of values) {
      yMin = yMin === undefined ? value : Math.min(yMin, value);
      yMax = yMax === undefined ? value : Math.max(yMax, value);
    }
    if (meanValue !== null) {
      yMin = yMin === undefined ? meanValue : Math.min(yMin, meanValue);
      yMax = yMax === undefined ? meanValue : Math.max(yMax, meanValue);
    }
    if (medianValue !== null) {
      yMin = yMin === undefined ? medianValue : Math.min(yMin, medianValue);
      yMax = yMax === undefined ? medianValue : Math.max(yMax, medianValue);
    }
    const yPadding =
      yMin !== undefined && yMax !== undefined
        ? Math.max(1, Math.ceil(Math.max(Math.abs(yMax), Math.abs(yMin)) * 0.08))
        : 1;

    const useDataZoom = names.length > DATA_ZOOM_THRESHOLD;
    const bottom = useDataZoom ? 120 : 96;
    const changeLabel = this.i18n.text('stats.exportColumnChangeAbs');
    const lastCategoryIndex = names.length - 1;

    this.chart.setOption(
      {
        animation: false,
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line' },
          confine: true,
          formatter: (params: unknown) => tooltipFormatter(params, changeLabel),
        },
        grid: { left: 56, right: 16, top: 16, bottom },
        dataZoom: useDataZoom
          ? [
              {
                type: 'slider',
                xAxisIndex: 0,
                show: true,
                startValue: 0,
                endValue: lastCategoryIndex,
                height: 22,
                bottom: 8,
                borderColor: '#334155',
                fillerColor: 'rgba(148, 163, 184, 0.2)',
                handleStyle: { color: '#94a3b8' },
                textStyle: { color: '#94a3b8', fontSize: 10 },
              },
              {
                type: 'inside',
                xAxisIndex: 0,
                startValue: 0,
                endValue: lastCategoryIndex,
              },
            ]
          : [],
        xAxis: {
          type: 'category',
          data: names,
          axisLabel: {
            rotate: 90,
            fontSize: 10,
            color: '#94a3b8',
            interval: 0,
          },
          axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
          type: 'value',
          ...(yMin !== undefined && yMax !== undefined
            ? { min: yMin - yPadding, max: yMax + yPadding }
            : {}),
          axisLabel: { color: '#94a3b8', fontSize: 10 },
          splitLine: { lineStyle: { color: '#334155' } },
        },
        series: [
          {
            name: changeLabel,
            type: 'line',
            smooth: true,
            symbol: 'circle',
            symbolSize: 8,
            lineStyle: { color: COLOR_LINE, width: 2 },
            data: values.map((value, index) => ({
              value,
              itemStyle: { color: pointColors[index], borderColor: pointColors[index] },
            })),
            ...(markLine ? { markLine } : {}),
          },
        ],
      },
      true,
    );
    this.chart.resize();
  }
}

function buildMeanMedianMarkLine(
  meanValue: number | null,
  medianValue: number | null,
  meanLabel: string,
  medianLabel: string,
): echarts.MarkLineComponentOption | undefined {
  const data: echarts.MarkLineComponentOption['data'] = [];
  if (meanValue !== null) {
    data.push({
      yAxis: meanValue,
      name: meanLabel,
      lineStyle: { type: 'dotted', color: COLOR_MEAN_LINE, width: 2 },
      label: { color: COLOR_MEAN_LINE, fontSize: 10 },
    });
  }
  if (medianValue !== null) {
    data.push({
      yAxis: medianValue,
      name: medianLabel,
      lineStyle: { type: 'dotted', color: COLOR_MEDIAN_LINE, width: 2 },
      label: { color: COLOR_MEDIAN_LINE, fontSize: 10 },
    });
  }
  if (data.length === 0) {
    return undefined;
  }
  return {
    symbol: ['none', 'none'],
    silent: true,
    data,
  };
}

function tooltipFormatter(params: unknown, changeLabel: string): string {
  if (!Array.isArray(params) || params.length === 0) {
    return '';
  }
  const first = params[0] as {
    axisValue?: string;
    value?: number | number[];
    data?: number | { value?: number };
    marker?: string;
  };
  const name = first.axisValue ?? '';
  const raw = first.data ?? first.value;
  let value = 0;
  if (typeof raw === 'number') {
    value = raw;
  } else if (Array.isArray(raw)) {
    value = raw[0] ?? 0;
  } else if (typeof raw === 'object' && raw && 'value' in raw) {
    value = raw.value ?? 0;
  }
  const sign = value > 0 ? '+' : '';
  return `${name}<br/>${first.marker ?? ''} ${changeLabel}: ${sign}${value.toLocaleString()}`;
}
