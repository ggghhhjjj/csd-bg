import { Component, computed, effect, inject, input, output, signal } from '@angular/core';

import type { ParsedDataset } from '../core/data/vectors.types';
import { LocaleService } from '../core/i18n/locale.service';
import {
  aggregateShareholdersDaily,
  hasShareholdersAggregateData,
} from './shareholders-daily-aggregate';
import { ShareholdersFlowDailyChart } from './shareholders-flow-daily-chart';
import { ShareholdersTotalDailyChart } from './shareholders-total-daily-chart';
import { ShareholdersTotalPeriodDailyChart } from './shareholders-total-period-daily-chart';

@Component({
  selector: 'app-shareholders-market-charts',
  imports: [ShareholdersFlowDailyChart, ShareholdersTotalDailyChart, ShareholdersTotalPeriodDailyChart],
  templateUrl: './shareholders-market-charts.html',
  styleUrl: './shareholders-market-charts.css',
})
export class ShareholdersMarketCharts {
  readonly dataset = input.required<ParsedDataset>();
  readonly startDate = input.required<string>();
  readonly endDate = input.required<string>();
  readonly selectedDate = input<string | null>(null);
  readonly dateSelected = output<string>();

  protected readonly i18n = inject(LocaleService);

  protected readonly chartViewStart = signal('');
  protected readonly chartViewEnd = signal('');

  private applyingPresetRange = false;

  protected readonly aggregate = computed(() => {
    const dataset = this.dataset();
    const from = this.startDate();
    const to = this.endDate();
    if (dataset.dates.length === 0) {
      return {
        dates: [],
        losses: [],
        gains: [],
        totalShareholders: [],
        totalShareholdersChanged: [],
        totalShareholdersChangedInPeriod: [],
      };
    }
    const chartFrom = dataset.dates[0] ?? '';
    const chartTo = dataset.dates[dataset.dates.length - 1] ?? '';
    if (!chartFrom || !chartTo) {
      return aggregateShareholdersDaily(dataset, '', '');
    }
    return aggregateShareholdersDaily(dataset, chartFrom, chartTo, {
      periodFrom: from || chartFrom,
      periodTo: to || chartTo,
    });
  });

  protected readonly hasData = computed(() => hasShareholdersAggregateData(this.aggregate()));

  constructor() {
    effect(() => {
      const from = this.startDate();
      const to = this.endDate();
      this.applyingPresetRange = true;
      this.chartViewStart.set(from);
      this.chartViewEnd.set(to);
      queueMicrotask(() => {
        this.applyingPresetRange = false;
      });
    });
  }

  protected onChartViewRangeChange(range: { from: string; to: string }): void {
    if (this.applyingPresetRange) {
      return;
    }
    if (range.from === this.chartViewStart() && range.to === this.chartViewEnd()) {
      return;
    }
    this.chartViewStart.set(range.from);
    this.chartViewEnd.set(range.to);
  }
}
