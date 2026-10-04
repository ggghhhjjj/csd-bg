import type { TabularExportData } from './tabular-export.types';

export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function tabularToCsv(data: TabularExportData): string {
  const headerLine = data.headers.map(escapeCsvField).join(',');
  const dataLines = data.rows.map((row) => row.map(escapeCsvField).join(','));
  return [headerLine, ...dataLines].join('\n');
}

export function tabularToMarkdown(data: TabularExportData): string {
  const { headers, rows } = data;
  const separator = headers.map(() => '---');
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
  return lines.join('\n');
}
