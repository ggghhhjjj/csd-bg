import type { RangePreset } from '../core/data/date-range';
import { DEFAULT_RANGE_PRESET, type QueryParamReader } from '../issuer-detail/chart-view-params';
import type { RankOrder } from './rank-issuers';

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
const CUSTOM_RANGE = /^(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$/;

export type StatisticsCustomRange = {
  from: string;
  to: string;
};

export type StatisticsViewQuery = {
  range: string | null;
  order: string | null;
  all: string | null;
};

export type StatisticsViewState = {
  preset: RangePreset;
  customRange: StatisticsCustomRange | null;
  order: RankOrder;
  showAll: boolean;
};

export type StatisticsSerializeInput = {
  preset: RangePreset;
  chartDiffRange: StatisticsCustomRange | null;
  scrollDiffRange: StatisticsCustomRange | null;
  order: RankOrder;
  showAll: boolean;
  dates: string[];
};

export function parseStatisticsViewParams(params: QueryParamReader): StatisticsViewState {
  const rangeValue = params.get('range');
  const preset = parsePresetFromRange(rangeValue);
  const customRange = parseCustomRangeFromRange(rangeValue);
  return {
    preset,
    customRange,
    order: parseOrder(params.get('order')),
    showAll: params.get('all') === '1',
  };
}

export function parseStatisticsRange(params: QueryParamReader): RangePreset {
  return parseStatisticsViewParams(params).preset;
}

export function serializeStatisticsViewParams(input: StatisticsSerializeInput): StatisticsViewQuery {
  const override = input.scrollDiffRange ?? input.chartDiffRange;
  let range: string | null;
  if (override) {
    range = `${override.from},${override.to}`;
  } else {
    range = input.preset === DEFAULT_RANGE_PRESET ? null : input.preset;
  }
  return {
    range,
    order: input.order === 'desc' ? null : 'asc',
    all: input.showAll ? '1' : null,
  };
}

export function serializeStatisticsRange(preset: RangePreset): StatisticsViewQuery {
  return serializeStatisticsViewParams({
    preset,
    chartDiffRange: null,
    scrollDiffRange: null,
    order: 'desc',
    showAll: false,
    dates: [],
  });
}

export function statisticsViewQueryEquals(params: QueryParamReader, query: StatisticsViewQuery): boolean {
  return (
    (params.get('range') ?? null) === (query.range ?? null) &&
    (params.get('order') ?? null) === (query.order ?? null) &&
    (params.get('all') ?? null) === (query.all ?? null)
  );
}

export function statisticsRangeQueryEquals(params: QueryParamReader, query: StatisticsViewQuery): boolean {
  return statisticsViewQueryEquals(params, query);
}

function parsePresetFromRange(value: string | null): RangePreset {
  if (value && RANGE_PRESETS.has(value as RangePreset)) {
    return value as RangePreset;
  }
  if (value && CUSTOM_RANGE.test(value)) {
    return DEFAULT_RANGE_PRESET;
  }
  return DEFAULT_RANGE_PRESET;
}

function parseCustomRangeFromRange(value: string | null): StatisticsCustomRange | null {
  if (!value) {
    return null;
  }
  const match = value.match(CUSTOM_RANGE);
  if (!match) {
    return null;
  }
  const from = match[1];
  const to = match[2];
  if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return null;
  }
  return { from, to };
}

function parseOrder(value: string | null): RankOrder {
  return value === 'asc' ? 'asc' : 'desc';
}
