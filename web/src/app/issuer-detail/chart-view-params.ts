import type { MetricId } from '../core/data/vectors.types';
import type { RangePreset } from '../core/data/date-range';

export const DEFAULT_RANGE_PRESET: RangePreset = 'm3';

export const METRIC_ORDER: MetricId[] = ['total_shares', 'free_float', 'shareholders'];

export const DEFAULT_CHART_VISIBLE: Record<MetricId, boolean> = {
  total_shares: true,
  free_float: true,
  shareholders: true,
};

const RANGE_PRESETS = new Set<RangePreset>([
  'd5',
  'd10',
  'm1',
  'm3',
  'm6',
  'ytd',
  'y1',
  'y3',
  'y5',
  'max',
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const METRICS_NONE = 'none';

export type QueryParamReader = {
  get(name: string): string | null;
};

export type ChartViewState = {
  visible: Record<MetricId, boolean>;
  preset: RangePreset | null;
  from: string;
  to: string;
};

export type ChartViewQuery = {
  range: string | null;
  metrics: string | null;
  from: string | null;
  to: string | null;
};

export function parseChartViewParams(params: QueryParamReader): ChartViewState {
  const visible = parseMetrics(params.get('metrics'));
  const range = parseRange(params.get('range'));
  if (range) {
    return { visible, preset: range, from: '', to: '' };
  }
  const from = parseIsoDate(params.get('from'));
  const to = parseIsoDate(params.get('to'));
  if (from && to) {
    return { visible, preset: null, from, to };
  }
  return { visible, preset: DEFAULT_RANGE_PRESET, from: '', to: '' };
}

export function serializeChartViewParams(state: ChartViewState): ChartViewQuery {
  return {
    range: serializeRange(state.preset),
    metrics: serializeMetrics(state.visible),
    from: state.preset ? null : parseIsoDate(state.from),
    to: state.preset ? null : parseIsoDate(state.to),
  };
}

export function chartViewQueryEquals(params: QueryParamReader, query: ChartViewQuery): boolean {
  return (
    (params.get('range') ?? null) === (query.range ?? null) &&
    (params.get('metrics') ?? null) === (query.metrics ?? null) &&
    (params.get('from') ?? null) === (query.from ?? null) &&
    (params.get('to') ?? null) === (query.to ?? null)
  );
}

function parseRange(value: string | null): RangePreset | null {
  if (!value) {
    return null;
  }
  return isRangePreset(value) ? value : null;
}

function parseMetrics(value: string | null): Record<MetricId, boolean> {
  if (value === null) {
    return { ...DEFAULT_CHART_VISIBLE };
  }
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === METRICS_NONE) {
    return { total_shares: false, free_float: false, shareholders: false };
  }
  const tokens = trimmed.split(',').map((token) => token.trim());
  const selected = new Set<MetricId>();
  for (const token of tokens) {
    if (isMetricId(token)) {
      selected.add(token);
    }
  }
  if (selected.size === 0) {
    return { ...DEFAULT_CHART_VISIBLE };
  }
  return {
    total_shares: selected.has('total_shares'),
    free_float: selected.has('free_float'),
    shareholders: selected.has('shareholders'),
  };
}

function parseIsoDate(value: string | null): string | null {
  if (!value || !ISO_DATE.test(value)) {
    return null;
  }
  return value;
}

function serializeRange(preset: RangePreset | null): string | null {
  if (!preset || preset === DEFAULT_RANGE_PRESET) {
    return null;
  }
  return preset;
}

function serializeMetrics(visible: Record<MetricId, boolean>): string | null {
  const selected = METRIC_ORDER.filter((metric) => visible[metric]);
  if (selected.length === METRIC_ORDER.length) {
    return null;
  }
  if (selected.length === 0) {
    return METRICS_NONE;
  }
  return selected.join(',');
}

function isRangePreset(value: string): value is RangePreset {
  return RANGE_PRESETS.has(value as RangePreset);
}

function isMetricId(value: string): value is MetricId {
  return METRIC_ORDER.includes(value as MetricId);
}
