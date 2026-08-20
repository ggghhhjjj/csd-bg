import { describe, expect, it } from 'vitest';

import { axisIndexFromChartEvent } from './axis-tip-index';

const dates = ['2024-01-01', '2024-01-02', '2024-01-03'];

describe('axisIndexFromChartEvent', () => {
  it('reads dataIndex from showTip', () => {
    expect(axisIndexFromChartEvent({ dataIndex: 2 }, dates)).toBe(2);
  });

  it('reads the category name', () => {
    expect(axisIndexFromChartEvent({ name: '2024-01-02' }, dates)).toBe(1);
  });

  it('reads the x-axis value from updateAxisPointer', () => {
    expect(
      axisIndexFromChartEvent({ axesInfo: [{ axisDim: 'x', value: '2024-01-03' }] }, dates),
    ).toBe(2);
  });

  it('reads the first item of a batch payload', () => {
    expect(axisIndexFromChartEvent([{ dataIndex: 0 }, { dataIndex: 2 }], dates)).toBe(0);
  });

  it('returns null for unknown payloads', () => {
    expect(axisIndexFromChartEvent(null, dates)).toBeNull();
    expect(axisIndexFromChartEvent({ dataIndex: 99 }, dates)).toBeNull();
    expect(axisIndexFromChartEvent({ name: 'nope' }, dates)).toBeNull();
  });
});
