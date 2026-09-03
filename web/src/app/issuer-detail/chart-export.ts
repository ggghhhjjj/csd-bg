import { indexForDate } from '../core/data/date-range';
import { metricAt, type MetricId, type ParsedDataset } from '../core/data/vectors.types';

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

export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(dateHeader: string, metricHeaders: string[], rows: ChartExportRow[]): string {
  const headerLine = [dateHeader, ...metricHeaders].map(escapeCsvField).join(',');
  const dataLines = rows.map((row) => [row.date, ...row.values].map(escapeCsvField).join(','));
  return [headerLine, ...dataLines].join('\n');
}

export function toMarkdownTable(
  dateHeader: string,
  metricHeaders: string[],
  rows: ChartExportRow[],
): string {
  const headers = [dateHeader, ...metricHeaders];
  const separator = headers.map(() => '---');
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...rows.map((row) => `| ${[row.date, ...row.values].join(' | ')} |`),
  ];
  return lines.join('\n');
}
