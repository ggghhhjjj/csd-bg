import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { rangeStartIso, type RangePreset } from '../core/data/date-range';
import { VectorsStore } from '../core/data/vectors.store';
import { RangePresets } from './range-presets';
import { ShareholdersDiffRank } from './shareholders-diff-rank';
import { ShareholdersFlowDailyChart } from './shareholders-flow-daily-chart';
import { ShareholdersTotalDailyChart } from './shareholders-total-daily-chart';
import { shareholdersDailyDiffRange } from './rank-issuers';
import {
  parseStatisticsRange,
  serializeStatisticsRange,
  statisticsRangeQueryEquals,
} from './statistics-view-params';

@Component({
  selector: 'app-statistics',
  imports: [RangePresets, ShareholdersDiffRank, ShareholdersFlowDailyChart, ShareholdersTotalDailyChart],
  templateUrl: './statistics.html',
  styleUrl: './statistics.css',
})
export class Statistics {
  private readonly store = inject(VectorsStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly preset = signal<RangePreset>(parseStatisticsRange(this.route.snapshot.queryParamMap));
  protected readonly selectedRankDate = signal<string | null>(null);
  protected readonly dataset = computed(() => this.store.dataset());

  protected readonly viewRange = computed(() => {
    const dataset = this.dataset();
    if (!dataset || dataset.dates.length === 0) {
      return { from: '', to: '' };
    }
    const to = dataset.dates[dataset.dates.length - 1] ?? '';
    return { from: rangeStartIso(dataset.dates, this.preset()), to };
  });

  protected readonly diffRankRange = computed(() => {
    const selected = this.selectedRankDate();
    const dataset = this.dataset();
    if (selected && dataset) {
      return shareholdersDailyDiffRange(dataset.dates, selected);
    }
    return this.viewRange();
  });

  protected setPreset(preset: RangePreset): void {
    this.selectedRankDate.set(null);
    this.preset.set(preset);
    this.syncQueryParams();
  }

  protected onFlowDateSelect(date: string): void {
    this.selectedRankDate.set(date);
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
