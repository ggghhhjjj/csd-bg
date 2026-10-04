import type { MetricId, ParsedDataset } from '../core/data/vectors.types';

export type ChartExportRequest = {
  dataset: ParsedDataset;
  issuerIndex: number;
  viewStart: string;
  viewEnd: string;
  metrics: MetricId[];
  dateLabel: string;
  metricLabels: Record<MetricId, string>;
};
