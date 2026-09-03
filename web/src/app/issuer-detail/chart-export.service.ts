import { Injectable, signal } from '@angular/core';

import type { MetricId, ParsedDataset } from '../core/data/vectors.types';
import { buildExportRows, toCsv, toMarkdownTable } from './chart-export';

const COPIED_MS = 2000;

export type ChartExportRequest = {
  dataset: ParsedDataset;
  issuerIndex: number;
  viewStart: string;
  viewEnd: string;
  metrics: MetricId[];
  dateLabel: string;
  metricLabels: Record<MetricId, string>;
};

@Injectable({ providedIn: 'root' })
export class ChartExportService {
  readonly copied = signal(false);

  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  async copyCsv(request: ChartExportRequest): Promise<void> {
    await this.copyToClipboard(this.formatCsv(request));
  }

  async copyMarkdown(request: ChartExportRequest): Promise<void> {
    await this.copyToClipboard(this.formatMarkdown(request));
  }

  formatCsv(request: ChartExportRequest): string {
    const rows = buildExportRows(
      request.dataset,
      request.issuerIndex,
      request.viewStart,
      request.viewEnd,
      request.metrics,
    );
    const metricHeaders = request.metrics.map((metric) => request.metricLabels[metric]);
    return toCsv(request.dateLabel, metricHeaders, rows);
  }

  formatMarkdown(request: ChartExportRequest): string {
    const rows = buildExportRows(
      request.dataset,
      request.issuerIndex,
      request.viewStart,
      request.viewEnd,
      request.metrics,
    );
    const metricHeaders = request.metrics.map((metric) => request.metricLabels[metric]);
    return toMarkdownTable(request.dateLabel, metricHeaders, rows);
  }

  private async copyToClipboard(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    this.copied.set(true);
    if (this.copiedTimer) {
      clearTimeout(this.copiedTimer);
    }
    this.copiedTimer = setTimeout(() => {
      this.copied.set(false);
      this.copiedTimer = null;
    }, COPIED_MS);
  }
}
