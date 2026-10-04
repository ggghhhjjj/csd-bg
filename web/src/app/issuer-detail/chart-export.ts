import { indexForDate } from '../core/data/date-range';
import { tabularToCsv, tabularToMarkdown } from '../core/export/tabular-export';
import type { TabularExportData } from '../core/export/tabular-export.types';
import { metricAt, type MetricId, type ParsedDataset } from '../core/data/vectors.types';
import type { ChartExportRequest } from './chart-export.types';

export type { ChartExportRequest } from './chart-export.types';

export type ChartExportRow = {
  date: string;
  values: string[];
};

export function formatExportValue(value: number | null): string {
  return value === null ? '—' : value.toLocaleString();
}

export function buildExportRows(
  dataset: ParsedDataset,
  issuerIndex: number,
  viewStart: string,
  viewEnd: string,
  metrics: MetricId[],
): ChartExportRow[] {
  const dates = dataset.dates;
  if (dates.length === 0 || metrics.length === 0) {
    return [];
  }
  const from = indexForDate(dates, viewStart);
  const to = indexForDate(dates, viewEnd);
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const rows: ChartExportRow[] = [];
  for (let dateIndex = start; dateIndex <= end; dateIndex += 1) {
    rows.push({
      date: dates[dateIndex],
      values: metrics.map((metric) =>
        formatExportValue(metricAt(dataset, metric, issuerIndex, dateIndex)),
      ),
    });
  }
  return rows;
}

export function chartExportToTabular(request: ChartExportRequest): TabularExportData {
  const exportRows = buildExportRows(
    request.dataset,
    request.issuerIndex,
    request.viewStart,
    request.viewEnd,
    request.metrics,
  );
  const metricHeaders = request.metrics.map((metric) => request.metricLabels[metric]);
  return {
    headers: [request.dateLabel, ...metricHeaders],
    rows: exportRows.map((row) => [row.date, ...row.values]),
  };
}

/** @deprecated Prefer chartExportToTabular and tabularToCsv from core/export. */
export function toCsv(dateHeader: string, metricHeaders: string[], rows: ChartExportRow[]): string {
  return tabularToCsv({
    headers: [dateHeader, ...metricHeaders],
    rows: rows.map((row) => [row.date, ...row.values]),
  });
}

/** @deprecated Prefer chartExportToTabular and tabularToMarkdown from core/export. */
export function toMarkdownTable(
  dateHeader: string,
  metricHeaders: string[],
  rows: ChartExportRow[],
): string {
  return tabularToMarkdown({
    headers: [dateHeader, ...metricHeaders],
    rows: rows.map((row) => [row.date, ...row.values]),
  });
}

export { escapeCsvField } from '../core/export/tabular-export';
