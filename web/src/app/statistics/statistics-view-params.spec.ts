import { convertToParamMap } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { DEFAULT_RANGE_PRESET } from '../issuer-detail/chart-view-params';
import {
  parseStatisticsRange,
  parseStatisticsViewParams,
  serializeStatisticsRange,
  serializeStatisticsViewParams,
  statisticsRangeQueryEquals,
  statisticsViewQueryEquals,
} from './statistics-view-params';

describe('parseStatisticsViewParams', () => {
  it('defaults to m3 when range is missing or unknown', () => {
    expect(parseStatisticsViewParams(convertToParamMap({}))).toEqual({
      preset: DEFAULT_RANGE_PRESET,
      customRange: null,
      order: 'desc',
      showAll: false,
    });
    expect(parseStatisticsViewParams(convertToParamMap({ range: 'decade' }))).toEqual({
      preset: DEFAULT_RANGE_PRESET,
      customRange: null,
      order: 'desc',
      showAll: false,
    });
  });

  it('parses a known range preset', () => {
    expect(parseStatisticsViewParams(convertToParamMap({ range: 'y1' }))).toEqual({
      preset: 'y1',
      customRange: null,
      order: 'desc',
      showAll: false,
    });
  });

  it('parses a comma-separated custom range', () => {
    expect(parseStatisticsViewParams(convertToParamMap({ range: '2024-01-01,2024-06-01' }))).toEqual({
      preset: DEFAULT_RANGE_PRESET,
      customRange: { from: '2024-01-01', to: '2024-06-01' },
      order: 'desc',
      showAll: false,
    });
  });

  it('parses order and all flags', () => {
    expect(parseStatisticsViewParams(convertToParamMap({ order: 'asc', all: '1' }))).toEqual({
      preset: DEFAULT_RANGE_PRESET,
      customRange: null,
      order: 'asc',
      showAll: true,
    });
  });
});

describe('parseStatisticsRange', () => {
  it('defaults to m3 when range is missing or unknown', () => {
    expect(parseStatisticsRange(convertToParamMap({}))).toBe(DEFAULT_RANGE_PRESET);
    expect(parseStatisticsRange(convertToParamMap({ range: 'decade' }))).toBe(DEFAULT_RANGE_PRESET);
  });

  it('parses a known range preset', () => {
    expect(parseStatisticsRange(convertToParamMap({ range: 'y1' }))).toBe('y1');
  });
});

describe('serializeStatisticsViewParams', () => {
  it('omits the default preset from the query', () => {
    expect(
      serializeStatisticsViewParams({
        preset: DEFAULT_RANGE_PRESET,
        chartDiffRange: null,
        scrollDiffRange: null,
        order: 'desc',
        showAll: false,
        dates: [],
      }),
    ).toEqual({ range: null, order: null, all: null });
    expect(
      serializeStatisticsViewParams({
        preset: 'max',
        chartDiffRange: null,
        scrollDiffRange: null,
        order: 'desc',
        showAll: false,
        dates: [],
      }),
    ).toEqual({ range: 'max', order: null, all: null });
  });

  it('serializes custom scroll or pick range as ISO dates', () => {
    expect(
      serializeStatisticsViewParams({
        preset: 'm6',
        chartDiffRange: { from: '2024-01-01', to: '2024-01-02' },
        scrollDiffRange: null,
        order: 'desc',
        showAll: false,
        dates: [],
      }),
    ).toEqual({ range: '2024-01-01,2024-01-02', order: null, all: null });
    expect(
      serializeStatisticsViewParams({
        preset: 'm6',
        chartDiffRange: null,
        scrollDiffRange: { from: '2024-04-01', to: '2024-07-01' },
        order: 'asc',
        showAll: true,
        dates: [],
      }),
    ).toEqual({ range: '2024-04-01,2024-07-01', order: 'asc', all: '1' });
  });
});

describe('serializeStatisticsRange', () => {
  it('omits the default preset from the query', () => {
    expect(serializeStatisticsRange(DEFAULT_RANGE_PRESET)).toEqual({ range: null, order: null, all: null });
    expect(serializeStatisticsRange('max')).toEqual({ range: 'max', order: null, all: null });
  });
});

describe('statisticsViewQueryEquals', () => {
  it('compares range, order, and all', () => {
    const query = { range: '2024-01-01,2024-01-02', order: 'asc', all: '1' };
    expect(
      statisticsViewQueryEquals(
        convertToParamMap({ range: '2024-01-01,2024-01-02', order: 'asc', all: '1' }),
        query,
      ),
    ).toBe(true);
    expect(statisticsViewQueryEquals(convertToParamMap({ range: 'y1' }), query)).toBe(false);
  });
});

describe('statisticsRangeQueryEquals', () => {
  it('treats a missing range as null', () => {
    expect(statisticsRangeQueryEquals(convertToParamMap({}), { range: null, order: null, all: null })).toBe(
      true,
    );
    expect(
      statisticsRangeQueryEquals(convertToParamMap({ range: 'y1' }), { range: 'y1', order: null, all: null }),
    ).toBe(true);
    expect(
      statisticsRangeQueryEquals(convertToParamMap({ range: 'y1' }), { range: null, order: null, all: null }),
    ).toBe(false);
  });
});
