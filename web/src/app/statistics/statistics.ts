import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { rangeStartIso, type RangePreset } from '../core/data/date-range';
import { VectorsStore } from '../core/data/vectors.store';
import { RangePresets } from './range-presets';
import { ShareholdersDiffRank } from './shareholders-diff-rank';
import { ShareholdersMarketCharts } from './shareholders-market-charts';
import { priorReportDayRange } from './prior-report-day-range';
import {
  parseStatisticsRange,
  serializeStatisticsRange,
  statisticsRangeQueryEquals,
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

  protected readonly preset = signal<RangePreset>(parseStatisticsRange(this.route.snapshot.queryParamMap));
  protected readonly chartDiffRange = signal<{ from: string; to: string } | null>(null);
  protected readonly dataset = computed(() => this.store.dataset());

  protected readonly viewRange = computed(() => {
    const dataset = this.dataset();
    if (!dataset || dataset.dates.length === 0) {
      return { from: '', to: '' };
    }
    const to = dataset.dates[dataset.dates.length - 1] ?? '';
    return { from: rangeStartIso(dataset.dates, this.preset()), to };
  });

  protected readonly diffRankRange = computed(() => this.chartDiffRange() ?? this.viewRange());

  protected readonly selectedChartDate = computed(() => this.chartDiffRange()?.to ?? null);

  protected setPreset(preset: RangePreset): void {
    this.preset.set(preset);
    this.chartDiffRange.set(null);
    this.syncQueryParams();
  }

  protected onChartDateSelected(iso: string): void {
    const dataset = this.dataset();
    if (!dataset) {
      return;
    }
    const current = this.chartDiffRange();
    if (current?.to === iso) {
      this.chartDiffRange.set(null);
      return;
    }
    const range = priorReportDayRange(dataset.dates, iso);
    if (range) {
      this.chartDiffRange.set(range);
    }
  }

  private syncQueryParams(): void {
    const query = serializeStatisticsRange(this.preset());
    if (statisticsRangeQueryEquals(this.route.snapshot.queryParamMap, query)) {
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: query,
      replaceUrl: true,
    });
  }
}
