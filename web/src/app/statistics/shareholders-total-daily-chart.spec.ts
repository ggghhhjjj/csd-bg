import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCALE_STORAGE_KEY } from '../core/i18n/locale.service';
import type { ParsedDataset, VectorCatalogEntry } from '../core/data/vectors.types';
import { ShareholdersTotalDailyChart } from './shareholders-total-daily-chart';

const { mockChart, zrClickHandler } = vi.hoisted(() => {
  let handler: ((event: { offsetX?: number; offsetY?: number }) => void) | undefined;
  const clickHandlerRef = {
    get: () => handler,
    set: (next: ((event: { offsetX?: number; offsetY?: number }) => void) | undefined) => {
      handler = next;
    },
  };
  const mockZr = {
    on: vi.fn((_event: string, cb: (event: { offsetX?: number; offsetY?: number }) => void) => {
      clickHandlerRef.set(cb);
    }),
    off: vi.fn(() => {
      clickHandlerRef.set(undefined);
    }),
  };
  return {
    zrClickHandler: clickHandlerRef,
    mockChart: {
      setOption: vi.fn(),
      dispose: vi.fn(),
      resize: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      getOption: vi.fn(() => ({ dataZoom: [{ startValue: '2024-06-01', endValue: '2024-06-02' }] })),
      containPixel: vi.fn(() => true),
      convertFromPixel: vi.fn(() => 0),
      getZr: () => mockZr,
    },
  };
});

vi.mock('echarts', () => ({
  init: () => mockChart,
}));

describe('ShareholdersTotalDailyChart', () => {
  beforeEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    document.documentElement.lang = 'bg';
    mockChart.setOption.mockClear();
    mockChart.on.mockClear();
    mockChart.off.mockClear();
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      } as unknown as typeof ResizeObserver;
    }
  });

  it('renders total chart title and configures line series with per-series baseline axes', async () => {
    const fixture = TestBed.createComponent(ShareholdersTotalDailyChart);
    fixture.componentRef.setInput('dataset', datasetFixture());
    fixture.componentRef.setInput('startDate', '2024-06-02');
    fixture.componentRef.setInput('endDate', '2024-06-02');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.shareholders-total-daily-chart__title')?.textContent).toContain('брой');
    expect(root.querySelector('.shareholders-total-daily-chart__action')?.textContent).toContain('базова');
    expect(mockChart.setOption).toHaveBeenCalled();

    const totalOption = mockChart.setOption.mock.calls[0]?.[0] as {
      legend?: { show?: boolean };
      series?: Array<{ type?: string; yAxisIndex?: number; data?: Array<{ value?: number; raw?: number }> }>;
      tooltip?: { formatter?: (params: unknown) => string };
      dataZoom?: Array<{ type?: string; startValue?: string; endValue?: string }>;
      yAxis?: Array<{ scale?: boolean; position?: string }>;
      grid?: { right?: number };
    };
    expect(totalOption.legend?.show).toBe(true);
    expect(totalOption.series?.length).toBe(3);
    expect(totalOption.series?.every((s) => s.type === 'line')).toBe(true);
    expect(totalOption.yAxis?.length).toBe(3);
    expect(totalOption.yAxis?.[0]?.scale).toBe(true);
    expect(totalOption.yAxis?.[1]?.position).toBe('right');
    expect(totalOption.yAxis?.[2]?.position).toBe('right');
    expect(totalOption.grid?.right).toBe(108);
    expect(totalOption.series?.[0]?.yAxisIndex).toBe(0);
    expect(totalOption.series?.[1]?.yAxisIndex).toBe(1);
    expect(totalOption.series?.[2]?.yAxisIndex).toBe(2);
    expect(totalOption.series?.[0]?.data?.[1]?.raw).toBe(2400);
    expect(totalOption.series?.[0]?.data?.[1]?.value).toBe(0);
    expect(totalOption.series?.[2]?.data?.[1]?.raw).toBe(2400);
    expect(totalOption.series?.[2]?.data?.[1]?.value).toBe(0);
    expect(typeof totalOption.tooltip?.formatter).toBe('function');
    const xAxis = (totalOption as { xAxis?: { data?: string[] } }).xAxis;
    expect(xAxis?.data).toEqual(['2024-06-01', '2024-06-02']);
    expect(totalOption.dataZoom?.[0]?.type).toBe('slider');
    expect(totalOption.dataZoom?.[0]?.startValue).toBe('2024-06-02');
    expect(totalOption.dataZoom?.[0]?.endValue).toBe('2024-06-02');
    expect(mockChart.on).toHaveBeenCalledWith('datazoom', expect.any(Function));

    const tooltip = totalOption.tooltip?.formatter?.([
      {
        axisValue: '2024-06-02',
        seriesName: 'Общо (пазар)',
        marker: '•',
        data: { value: 0, raw: 2400 },
      },
    ]);
    expect(tooltip).toContain('2,400');
    expect(tooltip).toContain('Δ');
    expect(tooltip).toContain('Общо:');
    expect(tooltip).not.toContain('абс.');
    expect(tooltip).not.toContain('Общо (пазар)');
  });

  it('baseline-transforms period-changed totals on a dedicated axis', async () => {
    const fixture = TestBed.createComponent(ShareholdersTotalDailyChart);
    fixture.componentRef.setInput('dataset', datasetFixture());
    fixture.componentRef.setInput('startDate', '2024-06-01');
    fixture.componentRef.setInput('endDate', '2024-06-02');
    fixture.detectChanges();
    await fixture.whenStable();

    const totalOption = mockChart.setOption.mock.calls.at(-1)?.[0] as {
      series?: Array<{ yAxisIndex?: number; data?: Array<{ value?: number; raw?: number }> }>;
    };
    expect(totalOption.series?.[2]?.yAxisIndex).toBe(2);
    expect(totalOption.series?.[2]?.data?.[0]?.raw).toBe(2407);
    expect(totalOption.series?.[2]?.data?.[0]?.value).toBe(7);
    expect(totalOption.series?.[2]?.data?.[1]?.raw).toBe(2400);
    expect(totalOption.series?.[2]?.data?.[1]?.value).toBe(0);
  });

  it('updates dataZoom window when startDate and endDate inputs change', async () => {
    const fixture = TestBed.createComponent(ShareholdersTotalDailyChart);
    fixture.componentRef.setInput('dataset', datasetFixture());
    fixture.componentRef.setInput('startDate', '2024-06-02');
    fixture.componentRef.setInput('endDate', '2024-06-02');
    fixture.detectChanges();
    await fixture.whenStable();
    mockChart.setOption.mockClear();

    fixture.componentRef.setInput('startDate', '2024-06-01');
    fixture.componentRef.setInput('endDate', '2024-06-02');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mockChart.setOption).toHaveBeenCalled();
    const lastOption = mockChart.setOption.mock.calls.at(-1)?.[0] as {
      dataZoom?: Array<{ startValue?: string; endValue?: string }>;
    };
    expect(lastOption.dataZoom?.[0]?.startValue).toBe('2024-06-01');
    expect(lastOption.dataZoom?.[0]?.endValue).toBe('2024-06-02');
  });

  it('cycles to absolute scale with a single y-axis', async () => {
    const fixture = TestBed.createComponent(ShareholdersTotalDailyChart);
    fixture.componentRef.setInput('dataset', datasetFixture());
    fixture.componentRef.setInput('startDate', '2024-06-01');
    fixture.componentRef.setInput('endDate', '2024-06-02');
    fixture.detectChanges();
    await fixture.whenStable();
    mockChart.setOption.mockClear();

    const root = fixture.nativeElement as HTMLElement;
    const action = root.querySelector('.shareholders-total-daily-chart__action') as HTMLButtonElement;
    action.click();
    action.click();
    action.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const lastOption = mockChart.setOption.mock.calls.at(-1)?.[0] as {
      yAxis?: unknown[];
      series?: Array<{ data?: Array<{ value?: number; raw?: number }> }>;
    };
    expect(lastOption.yAxis?.length).toBe(1);
    expect(lastOption.series?.[0]?.data?.[0]?.value).toBe(2407);
  });

  it('emits dateSelect from canvas clicks in the plot column', async () => {
    const fixture = TestBed.createComponent(ShareholdersTotalDailyChart);
    fixture.componentRef.setInput('dataset', datasetFixture());
    fixture.componentRef.setInput('startDate', '2024-06-01');
    fixture.componentRef.setInput('endDate', '2024-06-02');
    const dates: string[] = [];
    fixture.componentRef.instance.dateSelect.subscribe((date) => dates.push(date));
    fixture.detectChanges();
    await fixture.whenStable();

    mockChart.convertFromPixel.mockReturnValue(1);
    zrClickHandler.get()?.({ offsetX: 400, offsetY: 20 });
    expect(dates).toEqual(['2024-06-02']);
  });

  it('ignores canvas clicks outside the plot and x-axis', async () => {
    const fixture = TestBed.createComponent(ShareholdersTotalDailyChart);
    fixture.componentRef.setInput('dataset', datasetFixture());
    fixture.componentRef.setInput('startDate', '2024-06-01');
    fixture.componentRef.setInput('endDate', '2024-06-02');
    const dates: string[] = [];
    fixture.componentRef.instance.dateSelect.subscribe((date) => dates.push(date));
    fixture.detectChanges();
    await fixture.whenStable();

    mockChart.containPixel.mockReturnValue(false);
    zrClickHandler.get()?.({ offsetX: 10, offsetY: 200 });
    expect(dates).toEqual([]);
  });

  it('shows empty state when range has no shareholder totals', async () => {
    const fixture = TestBed.createComponent(ShareholdersTotalDailyChart);
    fixture.componentRef.setInput('dataset', emptyFixture());
    fixture.componentRef.setInput('startDate', '2024-06-01');
    fixture.componentRef.setInput('endDate', '2024-06-01');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.shareholders-total-daily-chart__empty')?.textContent).toContain(
      'Няма данни',
    );
    expect(mockChart.setOption).not.toHaveBeenCalled();
  });
});

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
