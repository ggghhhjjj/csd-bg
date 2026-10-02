import { indexForDate } from '../core/data/date-range';
import { metricAt, type ParsedDataset } from '../core/data/vectors.types';

export type ShareholdersDailyAggregate = {
  dates: string[];
  /** Sum of negative day-over-day deltas, displayed as a positive magnitude. */
  losses: number[];
  /** Sum of positive day-over-day deltas. */
  gains: number[];
  /** Sum of valid shareholder counts across all issuers. */
  totalShareholders: number[];
  /** Sum of shareholder counts for issuers with non-zero day-over-day delta. */
  totalShareholdersChanged: number[];
  /** Sum of daily counts for issuers with any non-zero day-over-day delta in the range. */
  totalShareholdersChangedInPeriod: number[];
};

/** Issuers with at least one valid day-over-day change on any day in [rangeStart, rangeEnd]. */
export function issuersWithShareholderChangeInRange(
  dataset: ParsedDataset,
  rangeStart: number,
  rangeEnd: number,
): Uint8Array {
  const changed = new Uint8Array(dataset.issuers.length);
  for (let issuerIndex = 0; issuerIndex < dataset.issuers.length; issuerIndex += 1) {
    for (let dateIndex = rangeStart; dateIndex <= rangeEnd; dateIndex += 1) {
      if (dateIndex === 0) {
        continue;
      }
      const today = metricAt(dataset, 'shareholders', issuerIndex, dateIndex);
      const prev = metricAt(dataset, 'shareholders', issuerIndex, dateIndex - 1);
      if (today !== null && prev !== null && today !== prev) {
        changed[issuerIndex] = 1;
        break;
      }
    }
  }
  return changed;
}

/**
 * Day-over-day change uses the previous row in `dataset.dates` (prior report day),
 * not calendar days. The first global date has zero gains/losses.
 */
export function aggregateShareholdersDailyFull(dataset: ParsedDataset): ShareholdersDailyAggregate {
  const dates = dataset.dates;
  if (dates.length === 0) {
    return {
      dates: [],
      losses: [],
      gains: [],
      totalShareholders: [],
      totalShareholdersChanged: [],
      totalShareholdersChangedInPeriod: [],
    };
  }
  return aggregateShareholdersDaily(dataset, dates[0], dates[dates.length - 1] ?? '');
}

export function aggregateShareholdersDaily(
  dataset: ParsedDataset,
  fromIso: string,
  toIso: string,
): ShareholdersDailyAggregate {
  const start = fromIso || dataset.dates[0] || '';
  const end = toIso || dataset.dates[dataset.dates.length - 1] || '';
  if (!start || !end || dataset.dates.length === 0) {
    return {
      dates: [],
      losses: [],
      gains: [],
      totalShareholders: [],
      totalShareholdersChanged: [],
      totalShareholdersChangedInPeriod: [],
    };
  }

  const fromIndex = indexForDate(dataset.dates, start);
  const toIndex = indexForDate(dataset.dates, end);
  const rangeStart = Math.min(fromIndex, toIndex);
  const rangeEnd = Math.max(fromIndex, toIndex);
  const changedInPeriod = issuersWithShareholderChangeInRange(dataset, rangeStart, rangeEnd);

  const dates: string[] = [];
  const losses: number[] = [];
  const gains: number[] = [];
  const totalShareholders: number[] = [];
  const totalShareholdersChanged: number[] = [];
  const totalShareholdersChangedInPeriod: number[] = [];

  for (let dateIndex = rangeStart; dateIndex <= rangeEnd; dateIndex += 1) {
    dates.push(dataset.dates[dateIndex]);

    let total = 0;
    let changedTotal = 0;
    let changedInPeriodTotal = 0;
    let negativeSum = 0;
    let positiveSum = 0;

    for (let issuerIndex = 0; issuerIndex < dataset.issuers.length; issuerIndex += 1) {
      const today = metricAt(dataset, 'shareholders', issuerIndex, dateIndex);
      if (today !== null) {
        total += today;
        if (changedInPeriod[issuerIndex]) {
          changedInPeriodTotal += today;
        }
      }

      if (dateIndex > 0) {
        const prev = metricAt(dataset, 'shareholders', issuerIndex, dateIndex - 1);
        if (today !== null && prev !== null) {
          const delta = today - prev;
          if (delta !== 0) {
            changedTotal += today;
          }
          if (delta < 0) {
            negativeSum += delta;
          } else if (delta > 0) {
            positiveSum += delta;
          }
        }
      }
    }

    totalShareholders.push(total);
    totalShareholdersChanged.push(changedTotal);
    totalShareholdersChangedInPeriod.push(changedInPeriodTotal);
    losses.push(Math.abs(negativeSum));
    gains.push(positiveSum);
  }

  return {
    dates,
    losses,
    gains,
    totalShareholders,
    totalShareholdersChanged,
    totalShareholdersChangedInPeriod,
  };
}

export function hasShareholdersAggregateData(aggregate: ShareholdersDailyAggregate): boolean {
  if (aggregate.dates.length === 0) {
    return false;
  }
  return aggregate.totalShareholders.some((value) => value > 0);
}
