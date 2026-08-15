export interface VectorsConfig {
  manifestUrl: string;
  catalogUrl: string;
  datesUrl: string;
  seriesUrl: string;
}

export interface VectorCatalogEntry {
  id: number;
  isin: string;
  name: string;
}

export interface VectorManifest {
  version: number;
  generated_at: string;
  issuer_count: number;
  date_count: number;
  date_min: string;
  date_max: string;
  catalog_file: string;
  dates_file: string;
  arrow_file: string;
  compression: string;
  metrics: string[];
  index_convention: string;
}

export interface ParsedDataset {
  generatedAt: string;
  dates: string[];
  issuers: VectorCatalogEntry[];
  totalShares: Int32Array;
  freeFloat: Int32Array;
  shareholders: Int32Array;
  totalSharesValid: Uint8Array;
  freeFloatValid: Uint8Array;
  shareholdersValid: Uint8Array;
}

export type MetricId = 'total_shares' | 'free_float' | 'shareholders';

export interface WorkerRequest {
  catalogText: string;
  manifestText: string;
  datesBuffer: ArrayBuffer;
  seriesBuffer: ArrayBuffer;
}

export function isVectorsConfig(value: unknown): value is VectorsConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return ['manifestUrl', 'catalogUrl', 'datesUrl', 'seriesUrl'].every(
    (key) => typeof record[key] === 'string' && /^https?:\/\//.test(record[key] as string),
  );
}

export function metricAt(
  dataset: ParsedDataset,
  metric: MetricId,
  issuerIndex: number,
  dateIndex: number,
): number | null {
  const offset = issuerIndex * dataset.dates.length + dateIndex;
  const valid =
    metric === 'total_shares'
      ? dataset.totalSharesValid[offset]
      : metric === 'free_float'
        ? dataset.freeFloatValid[offset]
        : dataset.shareholdersValid[offset];
  if (!valid) {
    return null;
  }
  const values =
    metric === 'total_shares'
      ? dataset.totalShares
      : metric === 'free_float'
        ? dataset.freeFloat
        : dataset.shareholders;
  return values[offset];
}
