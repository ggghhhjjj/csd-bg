import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { ParsedDataset } from '../core/data/vectors.types';
import { LocaleService } from '../core/i18n/locale.service';
import { formatDelta } from '../core/data/vectors.types';
import { DataExportMenu } from '../export/data-export-menu';
import { HelpTrigger } from '../help/help-trigger';
import { shareholdersDiffRankToTabular } from './shareholders-diff-rank-export';
import {
  filterRankedIssuersByChange,
  limitRankedIssuers,
  rankIssuersByShareholdersDiff,
  TOP_RANK_COUNT,
  type RankOrder,
  type ShareholdersDiffChangeFilter,
} from './rank-issuers';
import { SHAREHOLDERS_DIFF_RANK_HELP } from './shareholders-diff-rank.help-id';

@Component({
  selector: 'app-shareholders-diff-rank',
  imports: [RouterLink, HelpTrigger, DataExportMenu],
  templateUrl: './shareholders-diff-rank.html',
  styleUrl: './shareholders-diff-rank.css',
})
export class ShareholdersDiffRank {
  readonly dataset = input.required<ParsedDataset>();
  readonly startDate = input.required<string>();
  readonly endDate = input.required<string>();
  readonly order = input.required<RankOrder>();
  readonly showAll = input.required<boolean>();
  readonly changeFilter = input.required<ShareholdersDiffChangeFilter>();

  readonly orderChange = output<RankOrder>();
  readonly showAllChange = output<boolean>();
  readonly changeFilterChange = output<ShareholdersDiffChangeFilter>();

  protected readonly i18n = inject(LocaleService);
  protected readonly helpTopic = SHAREHOLDERS_DIFF_RANK_HELP;

  protected readonly ranked = computed(() => {
    const from = this.startDate();
    const to = this.endDate();
    if (!from || !to) {
      return [];
    }
    return rankIssuersByShareholdersDiff(this.dataset(), from, to, this.order());
  });

  protected readonly filteredRanked = computed(() =>
    filterRankedIssuersByChange(this.ranked(), this.changeFilter()),
  );

  protected readonly visibleRows = computed(() =>
    limitRankedIssuers(this.filteredRanked(), this.showAll()),
  );

  protected readonly canToggleLimit = computed(() => this.filteredRanked().length > TOP_RANK_COUNT);

  protected readonly exportDisabled = computed(() => this.visibleRows().length === 0);

  protected readonly rangeLabel = computed(() => {
    const from = this.startDate();
    const to = this.endDate();
    if (!from || !to) {
      return '';
    }
    return this.i18n.text('stats.shareholdersDiffRange', { from, to });
  });

  protected readonly netChangeLabel = computed(() => {
    const allRows = this.ranked();
    if (allRows.length === 0) {
      return '';
    }
    const marketNet = allRows.reduce((sum, row) => sum + row.diff, 0);
    const marketNetText = formatDelta(0, marketNet, false);
    const filter = this.changeFilter();
    if (filter === 'all') {
      return this.i18n.text('stats.shareholdersDiffNet', { net: marketNetText });
    }
    const filteredRows = this.filteredRanked();
    if (filteredRows.length === 0) {
      return this.i18n.text('stats.shareholdersDiffNetMarketOnly', { marketNet: marketNetText });
    }
    const filteredNet = filteredRows.reduce((sum, row) => sum + row.diff, 0);
    return this.i18n.text('stats.shareholdersDiffNetFiltered', {
      filteredNet: formatDelta(0, filteredNet, false),
      marketNet: marketNetText,
    });
  });

  protected readonly sortLabel = computed(() =>
    this.order() === 'desc' ? this.i18n.text('stats.sortDesc') : this.i18n.text('stats.sortAsc'),
  );

  protected readonly limitLabel = computed(() =>
    this.showAll() ? this.i18n.text('stats.showTop5') : this.i18n.text('stats.showAll'),
  );

  protected readonly filterLabel = computed(() => {
    switch (this.changeFilter()) {
      case 'positive':
        return this.i18n.text('stats.changeFilterPositive');
      case 'negative':
        return this.i18n.text('stats.changeFilterNegative');
      case 'unchanged':
        return this.i18n.text('stats.changeFilterUnchanged');
      default:
        return this.i18n.text('stats.changeFilterAll');
    }
  });

  protected filterActionClass(): string {
    const base = 'shareholders-diff-rank__action';
    return this.changeFilter() === 'all' ? base : `${base} shareholders-diff-rank__action--active`;
  }

  protected readonly resolveRankExport = (): ReturnType<typeof shareholdersDiffRankToTabular> =>
    shareholdersDiffRankToTabular(this.visibleRows(), {
      issuer: this.i18n.text('stats.exportColumnIssuer'),
      isin: this.i18n.text('stats.exportColumnIsin'),
      changeAbs: this.i18n.text('stats.exportColumnChangeAbs'),
      changePercent: this.i18n.text('stats.exportColumnChangePercent'),
    });

  protected toggleOrder(): void {
    this.orderChange.emit(this.order() === 'desc' ? 'asc' : 'desc');
  }

  protected toggleLimit(): void {
    this.showAllChange.emit(!this.showAll());
  }

  protected cycleChangeFilter(): void {
    const next: Record<ShareholdersDiffChangeFilter, ShareholdersDiffChangeFilter> = {
      all: 'positive',
      positive: 'negative',
      negative: 'unchanged',
      unchanged: 'all',
    };
    this.changeFilterChange.emit(next[this.changeFilter()]);
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
