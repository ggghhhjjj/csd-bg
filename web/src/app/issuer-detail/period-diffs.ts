import { Component, computed, inject, input } from '@angular/core';

import { firstLastInRange, formatDelta, type MetricId, type ParsedDataset } from '../core/data/vectors.types';
import { indexForDate } from '../core/data/date-range';
import { LocaleService } from '../core/i18n/locale.service';
import { METRIC_ORDER } from './chart-view-params';

export type PeriodDiffRow = {
  metric: MetricId;
  abs: string;
  percent: string;
};

export function periodDiffs(
  dataset: ParsedDataset,
  issuerIndex: number,
  from: string,
  to: string,
): PeriodDiffRow[] {
  const start = from || dataset.dates[0] || '';
  const end = to || dataset.dates[dataset.dates.length - 1] || '';
  const fromIndex = indexForDate(dataset.dates, start);
  const toIndex = indexForDate(dataset.dates, end);
  return METRIC_ORDER.map((metric) => {
    const { first, last } = firstLastInRange(dataset, metric, issuerIndex, fromIndex, toIndex);
    return {
      metric,
      abs: formatDelta(first, last, false),
      percent: formatDelta(first, last, true),
    };
  });
}

@Component({
  selector: 'app-period-diffs',
  templateUrl: './period-diffs.html',
  styleUrl: './period-diffs.css',
})
export class PeriodDiffs {
  readonly dataset = input.required<ParsedDataset>();
  readonly issuerIndex = input.required<number>();
  readonly startDate = input.required<string>();
  readonly endDate = input.required<string>();

  protected readonly i18n = inject(LocaleService);
  protected readonly labels = computed<Record<MetricId, string>>(() => ({
    total_shares: this.i18n.text('metric.totalShares'),
    free_float: this.i18n.text('metric.freeFloat'),
    shareholders: this.i18n.text('metric.shareholders'),
  }));
  protected readonly rows = computed(() => {
    const from = this.startDate();
    const to = this.endDate();
    if (!from || !to) {
      return [];
    }
    return periodDiffs(this.dataset(), this.issuerIndex(), from, to);
  });
}
