import { convertToParamMap } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { DEFAULT_RANGE_PRESET } from '../issuer-detail/chart-view-params';
import {
  parseStatisticsRange,
  serializeStatisticsRange,
  statisticsRangeQueryEquals,
} from './statistics-view-params';

describe('parseStatisticsRange', () => {
  it('defaults to m3 when range is missing or unknown', () => {
    expect(parseStatisticsRange(convertToParamMap({}))).toBe(DEFAULT_RANGE_PRESET);
    expect(parseStatisticsRange(convertToParamMap({ range: 'decade' }))).toBe(DEFAULT_RANGE_PRESET);
  });

  it('parses a known range preset', () => {
    expect(parseStatisticsRange(convertToParamMap({ range: 'y1' }))).toBe('y1');
  });
});

describe('serializeStatisticsRange', () => {
  it('omits the default preset from the query', () => {
    expect(serializeStatisticsRange(DEFAULT_RANGE_PRESET)).toEqual({ range: null });
    expect(serializeStatisticsRange('max')).toEqual({ range: 'max' });
  });
});

describe('statisticsRangeQueryEquals', () => {
  it('treats a missing range as null', () => {
    expect(statisticsRangeQueryEquals(convertToParamMap({}), { range: null })).toBe(true);
    expect(statisticsRangeQueryEquals(convertToParamMap({ range: 'y1' }), { range: 'y1' })).toBe(true);
    expect(statisticsRangeQueryEquals(convertToParamMap({ range: 'y1' }), { range: null })).toBe(false);
  });
});
