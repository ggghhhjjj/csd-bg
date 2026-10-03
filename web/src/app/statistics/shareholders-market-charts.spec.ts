import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCALE_STORAGE_KEY } from '../core/i18n/locale.service';
import type { ParsedDataset, VectorCatalogEntry } from '../core/data/vectors.types';
import { ShareholdersMarketCharts } from './shareholders-market-charts';

const { mockChart, zrClickHandler } = vi.hoisted(() => {
  let handler: ((params: unknown) => void) | undefined;
  const zr = {
    on: vi.fn((_event: string, fn: (params: unknown) => void) => {
      handler = fn;
    }),
    off: vi.fn(),
  };
  return {
    zrClickHandler: {
      get: () => handler,
      set: (value: ((params: unknown) => void) | undefined) => {
        handler = value;
      },
    },
    mockChart: {
      setOption: vi.fn(),
      dispose: vi.fn(),
      resize: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      getOption: vi.fn(() => ({
        dataZoom: [{ startValue: '2024-06-01', endValue: '2024-06-01' }],
      })),
      getZr: vi.fn(() => zr),
      convertFromPixel: vi.fn(() => ['2024-06-02']),
      convertToPixel: vi.fn(),
    },
  };
});

vi.mock('echarts', () => ({
  init: () => mockChart,
}));

describe('ShareholdersMarketCharts', () => {
  beforeEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    document.documentElement.lang = 'bg';
    mockChart.setOption.mockClear();
    mockChart.on.mockClear();
    mockChart.getOption.mockClear();
    zrClickHandler.set(undefined);
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      } as unknown as typeof ResizeObserver;
    }
  });

  it('renders flow chart title and configures stacked flow plus total charts', async () => {
    const fixture = TestBed.createComponent(ShareholdersMarketCharts);
    fixture.componentRef.setInput('dataset', datasetFixture());
    setPeriodAndView(fixture, '2024-06-02', '2024-06-02');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.shareholders-flow-daily-chart__title')?.textContent).toContain('оборот');
    expect(mockChart.setOption).toHaveBeenCalled();
    expect(mockChart.setOption.mock.calls.length).toBeGreaterThanOrEqual(3);

    const flowOption = mockChart.setOption.mock.calls.find(
      (call) => (call[0] as { series?: Array<{ type?: string }> }).series?.every((s) => s.type === 'bar'),
    )?.[0] as {
      series?: Array<{ stack?: string; type?: string }>;
    };
    expect(flowOption?.series?.length).toBe(2);
    expect(flowOption?.series?.every((s) => s.type === 'bar' && s.stack === 'flow')).toBe(true);

    const lineOptions = mockChart.setOption.mock.calls
      .map((call) => call[0] as {
        legend?: { show?: boolean };
        series?: Array<{ type?: string; yAxisIndex?: number }>;
        tooltip?: { formatter?: unknown };
        yAxis?: Array<{ position?: string; min?: number; max?: number }>;
      })
      .filter((option) => option.series?.every((s) => s.type === 'line'));
    expect(lineOptions.length).toBe(2);
    for (const option of mockChart.setOption.mock.calls.map((call) => call[0] as {
      dataZoom?: Array<{ type?: string; startValue?: string; endValue?: string }>;
      xAxis?: { data?: string[] };
    })) {
      expect(option.dataZoom?.[0]?.type).toBe('slider');
      expect(option.dataZoom?.[0]?.startValue).toBe('2024-06-02');
      expect(option.dataZoom?.[0]?.endValue).toBe('2024-06-02');
    }

    const flowWithAxis = mockChart.setOption.mock.calls.find(
      (call) => (call[0] as { series?: Array<{ type?: string }> }).series?.every((s) => s.type === 'bar'),
    )?.[0] as { xAxis?: { data?: string[] } };
    expect(flowWithAxis?.xAxis?.data).toEqual(['2024-06-01', '2024-06-02']);

    for (const totalOption of lineOptions) {
      expect(totalOption.legend?.show).toBe(true);
      expect(totalOption.series?.length).toBe(2);
      expect(totalOption.series?.every((s) => s.type === 'line')).toBe(true);
      expect(totalOption.series?.[0]?.yAxisIndex).toBe(0);
      expect(totalOption.series?.[1]?.yAxisIndex).toBe(1);
      expect(typeof totalOption.tooltip?.formatter).toBe('function');
      expect(totalOption.yAxis?.length).toBe(2);
      expect(totalOption.yAxis?.[0]?.position).toBe('left');
      expect(totalOption.yAxis?.[1]?.position).toBe('right');
      for (const axis of totalOption.yAxis ?? []) {
        expect(axis.min).toBeDefined();
        expect(axis.max).toBeDefined();
        expect(axis.min!).toBeLessThan(axis.max!);
        expect(axis.min!).toBeGreaterThan(0);
      }
    }
  });

  it('shows empty state when range has no shareholder totals', async () => {
    const fixture = TestBed.createComponent(ShareholdersMarketCharts);
    fixture.componentRef.setInput('dataset', emptyFixture());
    setPeriodAndView(fixture, '2024-06-01', '2024-06-01');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.shareholders-market-charts__empty')?.textContent).toContain(
      'Няма данни',
    );
    expect(mockChart.setOption).not.toHaveBeenCalled();
  });

  it('still emits viewRangeSettled when parent inputs echo the scrolled range', async () => {
    vi.useFakeTimers();
    try {
      const fixture = TestBed.createComponent(ShareholdersMarketCharts);
      fixture.componentRef.setInput('dataset', wideDatasetFixture());
      setPeriodAndView(fixture, '2024-06-01', '2024-06-03');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const settled: Array<{ from: string; to: string }> = [];
      fixture.componentInstance.viewRangeSettled.subscribe((range) => settled.push(range));

      type Host = ShareholdersMarketCharts & {
        onChartViewRangeChange: (range: { from: string; to: string }) => void;
      };
      (fixture.componentInstance as Host).onChartViewRangeChange({
        from: '2024-06-02',
        to: '2024-06-03',
      });
      fixture.componentRef.setInput('viewStart', '2024-06-02');
      fixture.componentRef.setInput('viewEnd', '2024-06-03');
      fixture.detectChanges();

      vi.advanceTimersByTime(350);
      expect(settled).toEqual([{ from: '2024-06-02', to: '2024-06-03' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits viewRangeSettled after scrolling stops', async () => {
    vi.useFakeTimers();
    try {
      const fixture = TestBed.createComponent(ShareholdersMarketCharts);
      fixture.componentRef.setInput('dataset', wideDatasetFixture());
      setPeriodAndView(fixture, '2024-06-01', '2024-06-03');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const live: Array<{ from: string; to: string }> = [];
      const settled: Array<{ from: string; to: string }> = [];
      fixture.componentInstance.viewRangeChange.subscribe((range) => live.push(range));
      fixture.componentInstance.viewRangeSettled.subscribe((range) => settled.push(range));

      type Host = ShareholdersMarketCharts & {
        onChartViewRangeChange: (range: { from: string; to: string }) => void;
      };
      (fixture.componentInstance as Host).onChartViewRangeChange({
        from: '2024-06-02',
        to: '2024-06-03',
      });
      expect(live).toEqual([{ from: '2024-06-02', to: '2024-06-03' }]);
      expect(settled).toEqual([]);

      vi.advanceTimersByTime(350);
      expect(settled).toEqual([{ from: '2024-06-02', to: '2024-06-03' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('recomputes line y-axis bounds after datazoom and syncs all charts', async () => {
    const fixture = TestBed.createComponent(ShareholdersMarketCharts);
    fixture.componentRef.setInput('dataset', wideDatasetFixture());
    setPeriodAndView(fixture, '2024-06-01', '2024-06-03');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const lineBefore = mockChart.setOption.mock.calls
      .map((call) => call[0] as { yAxis?: Array<{ min?: number; max?: number }>; series?: Array<{ type?: string }> })
      .filter((option) => option.series?.every((s) => s.type === 'line'))
      .at(-1);
    const minBefore = lineBefore?.yAxis?.[0]?.min;
    const maxBefore = lineBefore?.yAxis?.[0]?.max;

    const dataZoomHandler = mockChart.on.mock.calls.find(([event]) => event === 'datazoom')?.[1] as
      | (() => void)
      | undefined;
    expect(dataZoomHandler).toBeDefined();

    mockChart.getOption.mockReturnValue({
      dataZoom: [{ startValue: '2024-06-03', endValue: '2024-06-03' }],
    });
    mockChart.setOption.mockClear();
    dataZoomHandler!();
    fixture.detectChanges();

    const lineAfter = mockChart.setOption.mock.calls
      .map((call) => call[0] as {
        dataZoom?: Array<{ startValue?: string; endValue?: string }>;
        yAxis?: Array<{ min?: number; max?: number }>;
        series?: Array<{ type?: string }>;
      })
      .filter((option) => option.series?.every((s) => s.type === 'line'));
    expect(lineAfter.length).toBeGreaterThanOrEqual(2);
    for (const option of lineAfter) {
      expect(option.dataZoom?.[0]?.startValue).toBe('2024-06-03');
      expect(option.dataZoom?.[0]?.endValue).toBe('2024-06-03');
    }
    const narrowed = lineAfter.at(-1);
    expect(narrowed?.yAxis?.[0]?.min).not.toBe(minBefore);
    expect(narrowed?.yAxis?.[0]?.max).not.toBe(maxBefore);
  });

  it('registers zrender click handlers and re-emits a picked date from pointer position', async () => {
    const fixture = TestBed.createComponent(ShareholdersMarketCharts);
    fixture.componentRef.setInput('dataset', datasetFixture());
    setPeriodAndView(fixture, '2024-06-01', '2024-06-02');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockChart.getZr).toHaveBeenCalled();

    const emitted: string[] = [];
    fixture.componentInstance.dateSelected.subscribe((iso) => emitted.push(iso));
    zrClickHandler.get()?.({
      event: new MouseEvent('click', { clientX: 0, clientY: 0 }),
    });
    expect(emitted).toEqual(['2024-06-02']);
  });
});

function setPeriodAndView(fixture: ComponentFixture<ShareholdersMarketCharts>, from: string, to: string): void {
  fixture.componentRef.setInput('startDate', from);
  fixture.componentRef.setInput('endDate', to);
  fixture.componentRef.setInput('viewStart', from);
  fixture.componentRef.setInput('viewEnd', to);
}

function wideDatasetFixture(): ParsedDataset {
  return packDataset(
    [
      { id: 1, isin: 'A', name: 'A' },
      { id: 2, isin: 'B', name: 'B' },
    ],
    ['2024-06-01', '2024-06-02', '2024-06-03'],
    [
      [100, 200, 5000],
      [100, 200, 5000],
    ],
  );
}

function datasetFixture(): ParsedDataset {
  return packDataset(
    [
      { id: 1, isin: 'A', name: 'A' },
      { id: 2, isin: 'B', name: 'B' },
      { id: 3, isin: 'C', name: 'C' },
    ],
    ['2024-06-01', '2024-06-02'],
    [
      [502, 500],
      [1295, 1300],
      [610, 600],
    ],
  );
}

function emptyFixture(): ParsedDataset {
  return packDataset([{ id: 1, isin: 'A', name: 'A' }], ['2024-06-01'], [[null]]);
}

function packDataset(
  issuers: VectorCatalogEntry[],
  dates: string[],
  series: Array<Array<number | null>>,
): ParsedDataset {
  const cellCount = issuers.length * dates.length;
  const shareholders = new Int32Array(cellCount);
  const shareholdersValid = new Uint8Array(cellCount);
  series.forEach((values, issuerIndex) => {
    values.forEach((value, dateIndex) => {
      if (value === null) {
        return;
      }
      const offset = issuerIndex * dates.length + dateIndex;
      shareholders[offset] = value;
      shareholdersValid[offset] = 1;
    });
  });
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    dates,
    issuers,
    totalShares: new Int32Array(cellCount),
    freeFloat: new Int32Array(cellCount),
    shareholders,
    totalSharesValid: new Uint8Array(cellCount),
    freeFloatValid: new Uint8Array(cellCount),
    shareholdersValid,
  };
}
