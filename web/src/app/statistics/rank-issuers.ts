import { indexForDate } from '../core/data/date-range';
import {
  formatBasisForRangeChange,
  formatDelta,
  metricChangeAtRangeEndpoints,
  type ParsedDataset,
} from '../core/data/vectors.types';

export type RankOrder = 'asc' | 'desc';

export type ShareholdersDiffChangeFilter = 'all' | 'positive' | 'negative' | 'unchanged';

export type RankedIssuer = {
  issuerIndex: number;
  isin: string;
  name: string;
  diff: number;
  abs: string;
  percent: string;
};

export const TOP_RANK_COUNT = 5;

export function rankIssuersByShareholdersDiff(
  dataset: ParsedDataset,
  from: string,
  to: string,
  order: RankOrder,
): RankedIssuer[] {
  const start = from || dataset.dates[0] || '';
  const end = to || dataset.dates[dataset.dates.length - 1] || '';
  if (!start || !end) {
    return [];
  }
  const fromIndex = indexForDate(dataset.dates, start);
  const toIndex = indexForDate(dataset.dates, end);
  const rows: RankedIssuer[] = [];
  for (let issuerIndex = 0; issuerIndex < dataset.issuers.length; issuerIndex += 1) {
    const change = metricChangeAtRangeEndpoints(dataset, 'shareholders', issuerIndex, fromIndex, toIndex);
    if (!change) {
      continue;
    }
    const { first, last } = formatBasisForRangeChange(change.start, change.end);
    const issuer = dataset.issuers[issuerIndex];
    rows.push({
      issuerIndex,
      isin: issuer.isin,
      name: issuer.name,
      diff: change.diff,
      abs: formatDelta(first, last, false),
      percent: formatDelta(first, last, true),
    });
  }
  const sign = order === 'desc' ? -1 : 1;
  rows.sort((left, right) => {
    if (left.diff !== right.diff) {
      return sign * (left.diff - right.diff);
    }
    const byName = left.name.localeCompare(right.name);
    if (byName !== 0) {
      return byName;
    }
    return left.isin.localeCompare(right.isin);
  });
  return rows;
}

export function filterRankedIssuersByChange(
  rows: RankedIssuer[],
  filter: ShareholdersDiffChangeFilter,
): RankedIssuer[] {
  switch (filter) {
    case 'positive':
      return rows.filter((row) => row.diff > 0);
    case 'negative':
      return rows.filter((row) => row.diff < 0);
    case 'unchanged':
      return rows.filter((row) => row.diff === 0);
    default:
      return rows;
  }
}

export function limitRankedIssuers(rows: RankedIssuer[], showAll: boolean): RankedIssuer[] {
  if (showAll || rows.length <= TOP_RANK_COUNT) {
    return rows;
  }
  return rows.slice(0, TOP_RANK_COUNT);
}

export function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? null;
  }
  const lower = sorted[mid - 1];
  const upper = sorted[mid];
  if (lower === undefined || upper === undefined) {
    return null;
  }
  return (lower + upper) / 2;
}

/** Same rows as the diff-rank list (`visibleRows`). */
export function visibleShareholdersDiffRankRows(
  dataset: ParsedDataset,
  from: string,
  to: string,
  order: RankOrder,
  changeFilter: ShareholdersDiffChangeFilter,
  showAll: boolean,
): RankedIssuer[] {
  const ranked = rankIssuersByShareholdersDiff(dataset, from, to, order);
  const filtered = filterRankedIssuersByChange(ranked, changeFilter);
  return limitRankedIssuers(filtered, showAll);
}

/** Chart-only: descending → gains only; ascending → losses only (after change filter). */
export function filterRankedIssuersByChartSortSign(
  rows: RankedIssuer[],
  order: RankOrder,
): RankedIssuer[] {
  if (order === 'desc') {
    return rows.filter((row) => row.diff > 0);
  }
  return rows.filter((row) => row.diff < 0);
}

export function chartSignedShareholdersDiffRankRows(
  dataset: ParsedDataset,
  from: string,
  to: string,
  order: RankOrder,
  changeFilter: ShareholdersDiffChangeFilter,
): RankedIssuer[] {
  const ranked = rankIssuersByShareholdersDiff(dataset, from, to, order);
  const filtered = filterRankedIssuersByChange(ranked, changeFilter);
  return filterRankedIssuersByChartSortSign(filtered, order);
}

export function chartRowsForShareholdersDiffRank(
  dataset: ParsedDataset,
  from: string,
  to: string,
  order: RankOrder,
  changeFilter: ShareholdersDiffChangeFilter,
  showAll: boolean,
): RankedIssuer[] {
  return limitRankedIssuers(
    chartSignedShareholdersDiffRankRows(dataset, from, to, order, changeFilter),
    showAll,
  );
}

/** Mean/median/min/max from the same rows drawn on the chart (sign-filtered, then top 5 / show all). */
export function chartReferenceLevelsForRows(rows: RankedIssuer[]): {
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
} {
  const diffs = rows.map((row) => row.diff);
  if (diffs.length === 0) {
    return { mean: null, median: null, min: null, max: null };
  }
  return {
    mean: mean(diffs),
    median: median(diffs),
    min: Math.min(...diffs),
    max: Math.max(...diffs),
  };
}
