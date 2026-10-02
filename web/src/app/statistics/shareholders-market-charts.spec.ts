import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCALE_STORAGE_KEY } from '../core/i18n/locale.service';
import type { ParsedDataset, VectorCatalogEntry } from '../core/data/vectors.types';
import { ShareholdersMarketCharts } from './shareholders-market-charts';

const { mockChart } = vi.hoisted(() => ({
  mockChart: {
    setOption: vi.fn(),
    dispose: vi.fn(),
    resize: vi.fn(),
  },
}));

vi.mock('echarts', () => ({
  init: () => mockChart,
}));

describe('ShareholdersMarketCharts', () => {
  beforeEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    document.documentElement.lang = 'bg';
    mockChart.setOption.mockClear();
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
    fixture.componentRef.setInput('startDate', '2024-06-02');
    fixture.componentRef.setInput('endDate', '2024-06-02');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.shareholders-market-charts__title')?.textContent).toContain('оборот');
    expect(mockChart.setOption).toHaveBeenCalled();
    expect(mockChart.setOption.mock.calls.length).toBeGreaterThanOrEqual(2);

    const flowOption = mockChart.setOption.mock.calls[0]?.[0] as {
      series?: Array<{ stack?: string; type?: string }>;
    };
    expect(flowOption.series?.length).toBe(2);
    expect(flowOption.series?.every((s) => s.type === 'bar' && s.stack === 'flow')).toBe(true);

    const totalOption = mockChart.setOption.mock.calls[1]?.[0] as {
      legend?: { show?: boolean };
      series?: Array<{ type?: string }>;
    };
    expect(totalOption.legend?.show).toBe(true);
    expect(totalOption.series?.length).toBe(3);
    expect(totalOption.series?.every((s) => s.type === 'line')).toBe(true);
  });

  it('shows empty state when range has no shareholder totals', async () => {
    const fixture = TestBed.createComponent(ShareholdersMarketCharts);
    fixture.componentRef.setInput('dataset', emptyFixture());
    fixture.componentRef.setInput('startDate', '2024-06-01');
    fixture.componentRef.setInput('endDate', '2024-06-01');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.shareholders-market-charts__empty')?.textContent).toContain(
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
