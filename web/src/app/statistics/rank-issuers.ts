import { indexForDate } from '../core/data/date-range';
import { firstLastInRange, formatDelta, type ParsedDataset } from '../core/data/vectors.types';

export type RankOrder = 'asc' | 'desc';

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
    const { first, last } = firstLastInRange(dataset, 'shareholders', issuerIndex, fromIndex, toIndex);
    if (first === null || last === null) {
      continue;
    }
    const issuer = dataset.issuers[issuerIndex];
    rows.push({
      issuerIndex,
      isin: issuer.isin,
      name: issuer.name,
      diff: last - first,
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

export function limitRankedIssuers(rows: RankedIssuer[], showAll: boolean): RankedIssuer[] {
  if (showAll || rows.length <= TOP_RANK_COUNT) {
    return rows;
  }
  return rows.slice(0, TOP_RANK_COUNT);
}
