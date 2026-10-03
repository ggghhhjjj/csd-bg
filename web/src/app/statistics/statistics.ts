import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { indexForDate, rangeStartIso, type RangePreset } from '../core/data/date-range';
import { VectorsStore } from '../core/data/vectors.store';
import { RangePresets } from './range-presets';
import { ShareholdersDiffRank } from './shareholders-diff-rank';
import { ShareholdersMarketCharts } from './shareholders-market-charts';
import { priorReportDayRange } from './prior-report-day-range';
import type { RankOrder } from './rank-issuers';
import {
  parseStatisticsViewParams,
  serializeStatisticsViewParams,
  statisticsViewQueryEquals,
  type StatisticsCustomRange,
} from './statistics-view-params';

@Component({
  selector: 'app-statistics',
  imports: [RangePresets, ShareholdersDiffRank, ShareholdersMarketCharts],
  templateUrl: './statistics.html',
  styleUrl: './statistics.css',
})
export class Statistics {
  private readonly store = inject(VectorsStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly initialView = parseStatisticsViewParams(this.route.snapshot.queryParamMap);
  private urlCustomApplied = false;
  private queryParamSyncTimer: ReturnType<typeof setTimeout> | null = null;

  /** Match chart slider settle debounce in {@link ShareholdersMarketCharts}. */
  private static readonly QUERY_PARAM_SYNC_MS = 350;

  protected readonly preset = signal<RangePreset>(this.initialView.preset);
  protected readonly chartDiffRange = signal<StatisticsCustomRange | null>(null);
  protected readonly scrollDiffRange = signal<StatisticsCustomRange | null>(null);
  protected readonly rankOrder = signal<RankOrder>(this.initialView.order);
  protected readonly showAllRank = signal(this.initialView.showAll);
  protected readonly dataset = computed(() => this.store.dataset());

  protected readonly viewRange = computed(() => {
    const dataset = this.dataset();
    if (!dataset || dataset.dates.length === 0) {
      return { from: '', to: '' };
    }
    const to = dataset.dates[dataset.dates.length - 1] ?? '';
    return { from: rangeStartIso(dataset.dates, this.preset()), to };
  });

  protected readonly chartSliderRange = computed(
    () => this.scrollDiffRange() ?? this.viewRange(),
  );

  protected readonly activePreset = computed((): RangePreset | null => {
    if (this.chartDiffRange() || this.scrollDiffRange()) {
      return null;
    }
    return this.preset();
  });

  protected readonly diffRankRange = computed(
    () => this.scrollDiffRange() ?? this.chartDiffRange() ?? this.viewRange(),
  );

  protected readonly selectedChartDate = computed(() => this.chartDiffRange()?.to ?? null);

  constructor() {
    effect(() => {
      const dataset = this.dataset();
      const custom = this.initialView.customRange;
      if (!dataset || !custom || this.urlCustomApplied) {
        return;
      }
      const dates = dataset.dates;
      if (dates.length === 0) {
        return;
      }
      const fromIndex = indexForDate(dates, custom.from);
      const toIndex = indexForDate(dates, custom.to);
      if (fromIndex > toIndex) {
        this.urlCustomApplied = true;
        return;
      }
      const from = dates[fromIndex];
      const to = dates[toIndex];
      if (!from || !to) {
        this.urlCustomApplied = true;
        return;
      }
      const normalized = { from, to };
      const pickRange = priorReportDayRange(dates, to);
      if (pickRange && pickRange.from === from && pickRange.to === to) {
        this.chartDiffRange.set(normalized);
      } else {
        this.scrollDiffRange.set(normalized);
      }
      this.urlCustomApplied = true;
    });
  }

  protected setPreset(preset: RangePreset): void {
    this.preset.set(preset);
    this.chartDiffRange.set(null);
    this.scrollDiffRange.set(null);
    this.syncQueryParams();
  }

  protected onChartViewRangeChange(range: StatisticsCustomRange): void {
    this.applyScrollDiffRange(range);
    this.scheduleQueryParamSync();
  }

  protected onChartViewRangeSettled(range: StatisticsCustomRange): void {
    this.applyScrollDiffRange(range);
    this.flushQueryParamSync();
  }

  protected onChartDateSelected(iso: string): void {
    const dataset = this.dataset();
    if (!dataset) {
      return;
    }
    const current = this.chartDiffRange();
    if (current?.to === iso) {
      this.chartDiffRange.set(null);
      this.syncQueryParams();
      return;
    }
    const range = priorReportDayRange(dataset.dates, iso);
    if (range) {
      this.scrollDiffRange.set(null);
      this.chartDiffRange.set(range);
      this.syncQueryParams();
    }
  }

  /** Scroll/zoom overrides date pick and drives diff rank + URL once settled. */
  private applyScrollDiffRange(range: StatisticsCustomRange): void {
    this.chartDiffRange.set(null);
    const view = this.viewRange();
    if (range.from === view.from && range.to === view.to) {
      this.scrollDiffRange.set(null);
    } else {
      this.scrollDiffRange.set(range);
    }
  }

  protected onRankOrderChange(order: RankOrder): void {
    this.rankOrder.set(order);
    this.syncQueryParams();
  }

  protected onShowAllRankChange(showAll: boolean): void {
    this.showAllRank.set(showAll);
    this.syncQueryParams();
  }

  private scheduleQueryParamSync(): void {
    if (this.queryParamSyncTimer !== null) {
      clearTimeout(this.queryParamSyncTimer);
      this.queryParamSyncTimer = null;
    }
    this.queryParamSyncTimer = setTimeout(() => {
      this.queryParamSyncTimer = null;
      this.syncQueryParams();
    }, Statistics.QUERY_PARAM_SYNC_MS);
  }

  private flushQueryParamSync(): void {
    if (this.queryParamSyncTimer !== null) {
      clearTimeout(this.queryParamSyncTimer);
      this.queryParamSyncTimer = null;
    }
    this.syncQueryParams();
  }

  private syncQueryParams(): void {
    const dataset = this.dataset();
    const query = serializeStatisticsViewParams({
      preset: this.preset(),
      chartDiffRange: this.chartDiffRange(),
      scrollDiffRange: this.scrollDiffRange(),
      order: this.rankOrder(),
      showAll: this.showAllRank(),
      dates: dataset?.dates ?? [],
    });
    if (statisticsViewQueryEquals(this.route.snapshot.queryParamMap, query)) {
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: query,
      replaceUrl: true,
    });
  }
}
