import { Component, computed, inject, input } from '@angular/core';

import { metricAt, type MetricId, type ParsedDataset } from '../core/data/vectors.types';
import { indexForDate } from '../core/data/date-range';
import { LocaleService } from '../core/i18n/locale.service';

@Component({
  selector: 'app-metrics-table',
  templateUrl: './metrics-table.html',
  styleUrl: './metrics-table.css',
})
export class MetricsTable {
  readonly dataset = input.required<ParsedDataset>();
  readonly issuerIndex = input.required<number>();
  readonly startDate = input<string>('');
  readonly endDate = input<string>('');

  protected readonly i18n = inject(LocaleService);

  protected readonly rows = computed(() => {
    const dataset = this.dataset();
    const issuerIndex = this.issuerIndex();
    const start = this.startDate() || dataset.dates[0];
    const end = this.endDate() || dataset.dates[dataset.dates.length - 1];
    const from = indexForDate(dataset.dates, start);
    const to = indexForDate(dataset.dates, end);
    const startIndex = Math.max(from, to - 29);
    const result: Array<{ date: string; values: Record<MetricId, string> }> = [];
    for (let dateIndex = startIndex; dateIndex <= to; dateIndex += 1) {
      result.push({
        date: dataset.dates[dateIndex],
        values: {
          total_shares: this.format(metricAt(dataset, 'total_shares', issuerIndex, dateIndex)),
          free_float: this.format(metricAt(dataset, 'free_float', issuerIndex, dateIndex)),
          shareholders: this.format(metricAt(dataset, 'shareholders', issuerIndex, dateIndex)),
        },
      });
    }
    return result.reverse();
  });

  private format(value: number | null): string {
    return value === null ? '—' : value.toLocaleString();
  }
}
