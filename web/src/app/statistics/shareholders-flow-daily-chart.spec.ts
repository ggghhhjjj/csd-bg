import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCALE_STORAGE_KEY } from '../core/i18n/locale.service';
import type { ParsedDataset, VectorCatalogEntry } from '../core/data/vectors.types';
import { ShareholdersFlowDailyChart } from './shareholders-flow-daily-chart';

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
      containPixel: vi.fn(() => true),
      convertFromPixel: vi.fn(() => 0),
      getZr: () => mockZr,
    },
  };
});

vi.mock('echarts', () => ({
  init: () => mockChart,
}));

describe('ShareholdersFlowDailyChart', () => {
  beforeEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    document.documentElement.lang = 'bg';
    mockChart.setOption.mockClear();
    mockChart.containPixel.mockClear();
    mockChart.containPixel.mockReturnValue(true);
    mockChart.convertFromPixel.mockClear();
    mockChart.convertFromPixel.mockReturnValue(0);
    zrClickHandler.set(undefined);
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      } as unknown as typeof ResizeObserver;
    }
  });

  it('renders flow chart title and configures stacked bar series', async () => {
    const fixture = TestBed.createComponent(ShareholdersFlowDailyChart);
    fixture.componentRef.setInput('dataset', datasetFixture());
    fixture.componentRef.setInput('startDate', '2024-06-02');
    fixture.componentRef.setInput('endDate', '2024-06-02');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.shareholders-flow-daily-chart__title')?.textContent).toContain('оборот');
    expect(mockChart.setOption).toHaveBeenCalled();

    const flowOption = mockChart.setOption.mock.calls[0]?.[0] as {
      series?: Array<{ stack?: string; type?: string }>;
    };
    expect(flowOption.series?.length).toBe(2);
    expect(flowOption.series?.every((s) => s.type === 'bar' && s.stack === 'flow')).toBe(true);
    const xAxis = (flowOption as { xAxis?: { triggerEvent?: boolean } }).xAxis;
    expect(xAxis?.triggerEvent).toBe(true);
  });

  it('emits dateSelect from canvas clicks in the plot column', async () => {
    const fixture = TestBed.createComponent(ShareholdersFlowDailyChart);
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
    const fixture = TestBed.createComponent(ShareholdersFlowDailyChart);
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
    const fixture = TestBed.createComponent(ShareholdersFlowDailyChart);
    fixture.componentRef.setInput('dataset', emptyFixture());
    fixture.componentRef.setInput('startDate', '2024-06-01');
    fixture.componentRef.setInput('endDate', '2024-06-01');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.shareholders-flow-daily-chart__empty')?.textContent).toContain(
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
