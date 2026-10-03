import { describe, expect, it, vi } from 'vitest';

import { bindChartDatePick, selectedDateMarkLine } from './shareholders-chart-date-pick';

describe('selectedDateMarkLine', () => {
  const dates = ['2024-06-01', '2024-06-02'];

  it('returns markLine data when the date is in the chart categories', () => {
    const markLine = selectedDateMarkLine('2024-06-02', dates);
    expect(markLine?.data).toEqual([{ xAxis: '2024-06-02' }]);
  });

  it('returns undefined when there is no selection', () => {
    expect(selectedDateMarkLine(null, dates)).toBeUndefined();
    expect(selectedDateMarkLine('2024-06-03', dates)).toBeUndefined();
  });
});

describe('bindChartDatePick', () => {
  it('registers zrender click and picks the category from pointer coordinates', () => {
    const zrHandlers = new Map<string, (params: unknown) => void>();
    const zr = {
      on: vi.fn((event: string, handler: (params: unknown) => void) => {
        zrHandlers.set(event, handler);
      }),
      off: vi.fn(),
    };
    const host = document.createElement('div');
    host.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 200,
        width: 400,
        height: 240,
      }) as DOMRect;
    const chart = {
      getZr: vi.fn(() => zr),
      convertFromPixel: vi.fn(() => ['2024-06-02']),
      convertToPixel: vi.fn(),
    };
    const onPick = vi.fn();
    const binding = bindChartDatePick(
      chart as never,
      host,
      () => ['2024-06-01', '2024-06-02'],
      onPick,
    );

    expect(zrHandlers.has('click')).toBe(true);
    zrHandlers.get('click')?.({
      event: new MouseEvent('click', { clientX: 150, clientY: 250 }),
    });
    expect(onPick).toHaveBeenCalledWith('2024-06-02');

    onPick.mockClear();
    zrHandlers.get('click')?.({
      event: {
        changedTouches: [{ clientX: 150, clientY: 250 }],
      },
    });
    expect(onPick).toHaveBeenCalledWith('2024-06-02');

    binding.dispose();
    expect(zr.off).toHaveBeenCalledWith('click', expect.any(Function));
  });
});
