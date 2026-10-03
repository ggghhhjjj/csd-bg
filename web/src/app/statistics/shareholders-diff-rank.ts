import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { ParsedDataset } from '../core/data/vectors.types';
import { LocaleService } from '../core/i18n/locale.service';
import { formatDelta } from '../core/data/vectors.types';
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
  readonly order = input.required<RankOrder>();
  readonly showAll = input.required<boolean>();

  readonly orderChange = output<RankOrder>();
  readonly showAllChange = output<boolean>();

  protected readonly i18n = inject(LocaleService);

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

  protected readonly rangeLabel = computed(() => {
    const from = this.startDate();
    const to = this.endDate();
    if (!from || !to) {
      return '';
    }
    return this.i18n.text('stats.shareholdersDiffRange', { from, to });
  });

  /** Sum of all issuer deltas in the range; matches the market total change between the two dates. */
  protected readonly netChangeLabel = computed(() => {
    const rows = this.ranked();
    if (rows.length === 0) {
      return '';
    }
    const net = rows.reduce((sum, row) => sum + row.diff, 0);
    return this.i18n.text('stats.shareholdersDiffNet', { net: formatDelta(0, net, false) });
  });

  protected readonly sortLabel = computed(() =>
    this.order() === 'desc' ? this.i18n.text('stats.sortDesc') : this.i18n.text('stats.sortAsc'),
  );

  protected readonly limitLabel = computed(() =>
    this.showAll() ? this.i18n.text('stats.showTop5') : this.i18n.text('stats.showAll'),
  );

  protected toggleOrder(): void {
    this.orderChange.emit(this.order() === 'desc' ? 'asc' : 'desc');
  }

  protected toggleLimit(): void {
    this.showAllChange.emit(!this.showAll());
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
