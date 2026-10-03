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

export function firstLastInRange(
  dataset: ParsedDataset,
  metric: MetricId,
  issuerIndex: number,
  from: number,
  to: number,
): { first: number | null; last: number | null } {
  const start = Math.max(0, Math.min(from, to));
  const end = Math.min(dataset.dates.length - 1, Math.max(from, to));
  let first: number | null = null;
  let last: number | null = null;
  for (let dateIndex = start; dateIndex <= end; dateIndex += 1) {
    const value = metricAt(dataset, metric, issuerIndex, dateIndex);
    if (value === null) {
      continue;
    }
    if (first === null) {
      first = value;
    }
    last = value;
  }
  return { first, last };
}

/** Change from the range start report date to the range end report date (missing endpoint = listing / delisting). */
export type RangeEndpointChange = {
  start: number | null;
  end: number | null;
  diff: number;
};

export function metricChangeAtRangeEndpoints(
  dataset: ParsedDataset,
  metric: MetricId,
  issuerIndex: number,
  fromIndex: number,
  toIndex: number,
): RangeEndpointChange | null {
  const startIndex = Math.min(fromIndex, toIndex);
  const endIndex = Math.max(fromIndex, toIndex);
  const start = metricAt(dataset, metric, issuerIndex, startIndex);
  const end = metricAt(dataset, metric, issuerIndex, endIndex);
  if (start === null && end === null) {
    return null;
  }
  if (start === null) {
    return { start: null, end, diff: end as number };
  }
  if (end === null) {
    return { start, end: null, diff: -start };
  }
  return { start, end, diff: end - start };
}

/** Values passed to {@link formatDelta} for listing, delisting, and ordinary range moves. */
export function formatBasisForRangeChange(start: number | null, end: number | null): { first: number; last: number } {
  if (start === null && end !== null) {
    return { first: 0, last: end };
  }
  if (start !== null && end === null) {
    return { first: start, last: 0 };
  }
  if (start !== null && end !== null) {
    return { first: start, last: end };
  }
  throw new Error('formatBasisForRangeChange requires at least one endpoint value');
}

export function formatDelta(
  first: number | null,
  last: number | null,
  asPercent: boolean,
): string {
  if (first === null || last === null) {
    return '—';
  }
  const abs = last - first;
  if (!asPercent) {
    const sign = abs > 0 ? '+' : '';
    return `${sign}${abs.toLocaleString()}`;
  }
  if (first === 0) {
    return '—';
  }
  const percent = (abs / first) * 100;
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}
