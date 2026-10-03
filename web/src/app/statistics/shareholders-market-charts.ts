import { Component, computed, inject, input } from '@angular/core';

import type { ParsedDataset } from '../core/data/vectors.types';
import { LocaleService } from '../core/i18n/locale.service';
import {
  aggregateShareholdersDaily,
  hasShareholdersAggregateData,
} from './shareholders-daily-aggregate';
import { ShareholdersFlowDailyChart } from './shareholders-flow-daily-chart';
import { ShareholdersTotalDailyChart } from './shareholders-total-daily-chart';

@Component({
  selector: 'app-shareholders-market-charts',
  imports: [ShareholdersFlowDailyChart, ShareholdersTotalDailyChart],
  templateUrl: './shareholders-market-charts.html',
  styleUrl: './shareholders-market-charts.css',
})
export class ShareholdersMarketCharts {
  readonly dataset = input.required<ParsedDataset>();
  readonly startDate = input.required<string>();
  readonly endDate = input.required<string>();

  protected readonly i18n = inject(LocaleService);

  protected readonly aggregate = computed(() => {
    const from = this.startDate();
    const to = this.endDate();
    if (!from || !to) {
      return {
        dates: [],
        losses: [],
        gains: [],
        totalShareholders: [],
        totalShareholdersChanged: [],
        totalShareholdersChangedInPeriod: [],
      };
    }
    return aggregateShareholdersDaily(this.dataset(), from, to);
  });

  protected readonly hasData = computed(() => hasShareholdersAggregateData(this.aggregate()));
}
