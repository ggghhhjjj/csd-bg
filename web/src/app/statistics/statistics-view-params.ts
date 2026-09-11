import type { RangePreset } from '../core/data/date-range';
import { DEFAULT_RANGE_PRESET, type QueryParamReader } from '../issuer-detail/chart-view-params';

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

export type StatisticsViewQuery = {
  range: string | null;
};

export function parseStatisticsRange(params: QueryParamReader): RangePreset {
  const value = params.get('range');
  if (value && RANGE_PRESETS.has(value as RangePreset)) {
    return value as RangePreset;
  }
  return DEFAULT_RANGE_PRESET;
}

export function serializeStatisticsRange(preset: RangePreset): StatisticsViewQuery {
  return {
    range: preset === DEFAULT_RANGE_PRESET ? null : preset,
  };
}

export function statisticsRangeQueryEquals(params: QueryParamReader, query: StatisticsViewQuery): boolean {
  return (params.get('range') ?? null) === (query.range ?? null);
}
