import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { ParsedDataset } from '../core/data/vectors.types';
import { LocaleService } from '../core/i18n/locale.service';
import {
  limitRankedIssuers,
  rankIssuersByShareholdersDiff,
  TOP_RANK_COUNT,
  type RankOrder,
} from './rank-issuers';

@Component({
  selector: 'app-shareholders-diff-rank',
  imports: [RouterLink],
  templateUrl: './shareholders-diff-rank.html',
  styleUrl: './shareholders-diff-rank.css',
})
export class ShareholdersDiffRank {
  readonly dataset = input.required<ParsedDataset>();
  readonly startDate = input.required<string>();
  readonly endDate = input.required<string>();

  protected readonly i18n = inject(LocaleService);
  protected readonly order = signal<RankOrder>('desc');
  protected readonly showAll = signal(false);

  protected readonly ranked = computed(() => {
    const from = this.startDate();
    const to = this.endDate();
    if (!from || !to) {
      return [];
    }
    return rankIssuersByShareholdersDiff(this.dataset(), from, to, this.order());
  });

  protected readonly visibleRows = computed(() => limitRankedIssuers(this.ranked(), this.showAll()));

  protected readonly canToggleLimit = computed(() => this.ranked().length > TOP_RANK_COUNT);

  protected readonly sortLabel = computed(() =>
    this.order() === 'desc' ? this.i18n.text('stats.sortDesc') : this.i18n.text('stats.sortAsc'),
  );

  protected readonly limitLabel = computed(() =>
    this.showAll() ? this.i18n.text('stats.showTop5') : this.i18n.text('stats.showAll'),
  );

  protected toggleOrder(): void {
    this.order.update((current) => (current === 'desc' ? 'asc' : 'desc'));
  }

  protected toggleLimit(): void {
    this.showAll.update((current) => !current);
  }

  protected deltaClass(diff: number): string {
    if (diff > 0) {
      return 'shareholders-diff-rank__delta shareholders-diff-rank__delta--up';
    }
    if (diff < 0) {
      return 'shareholders-diff-rank__delta shareholders-diff-rank__delta--down';
    }
    return 'shareholders-diff-rank__delta';
  }
}
