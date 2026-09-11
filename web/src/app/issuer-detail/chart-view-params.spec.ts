import { convertToParamMap } from '@angular/router';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CHART_VISIBLE,
  DEFAULT_RANGE_PRESET,
  chartViewQueryEquals,
  parseChartViewParams,
  serializeChartViewParams,
  type ChartViewState,
} from './chart-view-params';

const ALL_ON = { ...DEFAULT_CHART_VISIBLE };
const ALL_OFF = { total_shares: false, free_float: false, shareholders: false } as const;

describe('parseChartViewParams', () => {
  it('uses default metrics and m3 when the map is empty', () => {
    expect(parseChartViewParams(convertToParamMap({}))).toEqual({
      visible: ALL_ON,
      preset: DEFAULT_RANGE_PRESET,
      from: '',
      to: '',
    });
  });

  it('parses a non-default range and subset of metrics', () => {
    expect(parseChartViewParams(convertToParamMap({ range: 'y1', metrics: 'free_float' }))).toEqual({
      visible: { total_shares: false, free_float: true, shareholders: false },
      preset: 'y1',
      from: '',
      to: '',
    });
  });

  it('parses metrics in stable order regardless of input order', () => {
    expect(parseChartViewParams(convertToParamMap({ metrics: 'shareholders,total_shares' })).visible).toEqual({
      total_shares: true,
      free_float: false,
      shareholders: true,
    });
  });

  it('parses metrics=none as all series off', () => {
    expect(parseChartViewParams(convertToParamMap({ metrics: 'none' })).visible).toEqual(ALL_OFF);
  });

  it('treats an empty metrics value as all series off', () => {
    expect(parseChartViewParams(convertToParamMap({ metrics: '' })).visible).toEqual(ALL_OFF);
  });

  it('falls back to defaults for unknown range and metrics tokens', () => {
    expect(parseChartViewParams(convertToParamMap({ range: 'decade', metrics: 'volume' }))).toEqual({
      visible: ALL_ON,
      preset: DEFAULT_RANGE_PRESET,
      from: '',
      to: '',
    });
  });

  it('keeps valid metrics when mixed with unknown tokens', () => {
    expect(parseChartViewParams(convertToParamMap({ metrics: 'free_float,bogus' })).visible).toEqual({
      total_shares: false,
      free_float: true,
      shareholders: false,
    });
  });

  it('prefers range over from/to when both are present', () => {
    expect(
      parseChartViewParams(
        convertToParamMap({ range: 'y5', from: '2024-01-01', to: '2024-06-01' }),
      ),
    ).toEqual({
      visible: ALL_ON,
      preset: 'y5',
      from: '',
      to: '',
    });
  });

  it('uses a custom window when from and to are valid ISO dates and range is absent', () => {
    expect(
      parseChartViewParams(convertToParamMap({ from: '2024-02-01', to: '2024-03-15' })),
    ).toEqual({
      visible: ALL_ON,
      preset: null,
      from: '2024-02-01',
      to: '2024-03-15',
    });
  });

  it('falls back to m3 when a custom window is incomplete or invalid', () => {
    expect(parseChartViewParams(convertToParamMap({ from: '2024-02-01' })).preset).toBe('m3');
    expect(parseChartViewParams(convertToParamMap({ from: 'not-a-date', to: '2024-03-15' })).preset).toBe(
      'm3',
    );
  });

  it('parses query params taken from a hash-style issuer URL', () => {
    const hash = '#/issuer/BG1100085072?range=y1&metrics=free_float';
    const query = hash.split('?')[1] ?? '';
    const search = new URLSearchParams(query);
    expect(parseChartViewParams({ get: (name) => search.get(name) })).toEqual({
      visible: { total_shares: false, free_float: true, shareholders: false },
      preset: 'y1',
      from: '',
      to: '',
    });
  });
});

describe('serializeChartViewParams', () => {
  it('omits keys for the default view', () => {
    expect(
      serializeChartViewParams({ visible: ALL_ON, preset: 'm3', from: '', to: '' }),
    ).toEqual({ range: null, metrics: null, from: null, to: null });
  });

  it('writes a non-default range and subset of metrics', () => {
    expect(
      serializeChartViewParams({
        visible: { total_shares: false, free_float: true, shareholders: true },
        preset: 'y1',
        from: '',
        to: '',
      }),
    ).toEqual({
      range: 'y1',
      metrics: 'free_float,shareholders',
      from: null,
      to: null,
    });
  });

  it('writes metrics=none when every series is off', () => {
    expect(serializeChartViewParams({ visible: { ...ALL_OFF }, preset: 'm3', from: '', to: '' }).metrics).toBe(
      'none',
    );
  });

  it('clears from/to when a named preset is active', () => {
    expect(
      serializeChartViewParams({
        visible: ALL_ON,
        preset: 'max',
        from: '2024-01-01',
        to: '2024-06-01',
      }),
    ).toEqual({ range: 'max', metrics: null, from: null, to: null });
  });

  it('writes from/to when the preset is cleared by a custom zoom', () => {
    expect(
      serializeChartViewParams({
        visible: ALL_ON,
        preset: null,
        from: '2024-02-01',
        to: '2024-03-15',
      }),
    ).toEqual({
      range: null,
      metrics: null,
      from: '2024-02-01',
      to: '2024-03-15',
    });
  });
});

describe('parse/serialize round-trip', () => {
  it('round-trips a shared issuer view', () => {
    const state: ChartViewState = {
      visible: { total_shares: false, free_float: true, shareholders: false },
      preset: 'y1',
      from: '',
      to: '',
    };
    const query = serializeChartViewParams(state);
    const params = convertToParamMap({
      range: query.range ?? undefined,
      metrics: query.metrics ?? undefined,
    });
    expect(parseChartViewParams(params)).toEqual(state);
  });
});

describe('chartViewQueryEquals', () => {
  it('treats missing keys as null', () => {
    const query = serializeChartViewParams({ visible: ALL_ON, preset: 'm3', from: '', to: '' });
    expect(chartViewQueryEquals(convertToParamMap({}), query)).toBe(true);
    expect(chartViewQueryEquals(convertToParamMap({ range: 'y1' }), query)).toBe(false);
  });
});
