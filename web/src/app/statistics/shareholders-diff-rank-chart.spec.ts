import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HELP_MANIFEST_FIXTURE } from '../core/help/help-manifest.fixture';
import { LOCALE_STORAGE_KEY } from '../core/i18n/locale.service';
import type { ParsedDataset, VectorCatalogEntry } from '../core/data/vectors.types';
import { ShareholdersDiffRankChart } from './shareholders-diff-rank-chart';

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

const DATES = ['2024-01-01', '2024-04-01', '2024-07-01'];

describe('ShareholdersDiffRankChart', () => {
  beforeEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    document.documentElement.lang = 'bg';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => HELP_MANIFEST_FIXTURE,
      }),
    );
    mockChart.setOption.mockClear();
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      } as unknown as typeof ResizeObserver;
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders title and line chart with vertical issuer labels on the x-axis', async () => {
    const fixture = TestBed.createComponent(ShareholdersDiffRankChart);
    setInputs(fixture, 'desc', 'all', false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.shareholders-diff-rank-chart__title')?.textContent).toContain('емитенти');
    const levels = root.querySelector('.shareholders-diff-rank-chart__levels')?.textContent ?? '';
    expect(levels).toContain('Средно');
    expect(levels).toContain('Медиана');
    expect(levels).toContain('Мин.');
    expect(levels).toContain('Макс.');
    expect(mockChart.setOption).toHaveBeenCalled();

    const option = mockChart.setOption.mock.calls.at(-1)?.[0] as {
      xAxis?: { data?: string[]; axisLabel?: { rotate?: number } };
      series?: Array<{ type?: string; data?: Array<{ value?: number }>; markLine?: { data?: Array<{ yAxis?: number }> } }>;
    };
    expect(option.xAxis?.data).toEqual(['Delta', 'Zeta', 'Alpha', 'Beta', 'Twin']);
    expect(option.xAxis?.axisLabel?.rotate).toBe(90);
    expect(option.series?.[0]?.type).toBe('line');
    expect(option.series?.[0]?.data?.map((item) => item.value)).toEqual([20, 10, 5, 5, 3]);
    const markY = option.series?.[0]?.markLine?.data?.map((entry) => entry.yAxis);
    expect(markY?.[0]).toBeCloseTo(8.6, 5);
    expect(markY?.[1]).toBe(5);
  });

  it('adds a bottom slider when more than 12 issuers are charted', async () => {
    const fixture = TestBed.createComponent(ShareholdersDiffRankChart);
    setInputs(fixture, 'desc', 'all', true, widePositiveFixture());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const option = mockChart.setOption.mock.calls.at(-1)?.[0] as {
      dataZoom?: Array<{ type?: string; show?: boolean }>;
    };
    expect(option.dataZoom?.length).toBe(2);
    expect(option.dataZoom?.[0]?.type).toBe('slider');
    expect(option.dataZoom?.[0]?.show).toBe(true);
  });

  it('shows empty message when sort sign filter leaves no chart rows', async () => {
    const fixture = TestBed.createComponent(ShareholdersDiffRankChart);
    setInputs(fixture, 'asc', 'positive', false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.shareholders-diff-rank-chart__empty')?.textContent).toContain('Няма данни');
    expect(root.querySelector('.shareholders-diff-rank-chart__chart')?.hasAttribute('hidden')).toBe(true);
  });
});

function setInputs(
  fixture: ReturnType<typeof TestBed.createComponent<ShareholdersDiffRankChart>>,
  order: 'asc' | 'desc',
  changeFilter: 'all' | 'positive' | 'negative' | 'unchanged',
  showAll: boolean,
  dataset: ParsedDataset = rankingFixture(),
): void {
  fixture.componentRef.setInput('dataset', dataset);
  fixture.componentRef.setInput('startDate', DATES[0]);
  fixture.componentRef.setInput('endDate', DATES[2]);
  fixture.componentRef.setInput('order', order);
  fixture.componentRef.setInput('showAll', showAll);
  fixture.componentRef.setInput('changeFilter', changeFilter);
}

function widePositiveFixture(): ParsedDataset {
  const issuers: VectorCatalogEntry[] = Array.from({ length: 13 }, (_, index) => ({
    id: index + 1,
    isin: `BG11000000${String(index).padStart(2, '0')}`,
    name: `Issuer ${index}`,
  }));
  const series = issuers.map((_, index) => [10, 10, 10 + index + 1] as Array<number | null>);
  return packWideDataset(issuers, series);
}

function packWideDataset(
  issuers: VectorCatalogEntry[],
  series: Array<Array<number | null>>,
): ParsedDataset {
  const dates = DATES;
  const cellCount = issuers.length * dates.length;
  const shareholders = new Int32Array(cellCount);
  const shareholdersValid = new Uint8Array(cellCount);
  series.forEach((values, issuerIndex) => {
    values.forEach((value, dateIndex) => {
      const offset = issuerIndex * dates.length + dateIndex;
      if (value === null) {
        return;
      }
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

function rankingFixture(): ParsedDataset {
  const issuers: VectorCatalogEntry[] = [
    { id: 1, isin: 'BG1100000010', name: 'Zeta' },
    { id: 2, isin: 'BG1100000020', name: 'Alpha' },
    { id: 3, isin: 'BG1100000030', name: 'Beta' },
    { id: 4, isin: 'BG1100000040', name: 'Gamma' },
    { id: 5, isin: 'BG1100000050', name: 'Delta' },
    { id: 6, isin: 'BG1100000060', name: 'Empty' },
    { id: 7, isin: 'BG1100000002', name: 'Twin' },
    { id: 8, isin: 'BG1100000001', name: 'Twin' },
  ];
  const series: Array<Array<number | null>> = [
    [100, 105, 110],
    [10, 12, 15],
    [20, 22, 25],
    [50, 46, 42],
    [1, 10, 21],
    [null, null, null],
    [10, 11, 13],
    [10, 12, 13],
  ];
  const cellCount = issuers.length * DATES.length;
  const shareholders = new Int32Array(cellCount);
  const shareholdersValid = new Uint8Array(cellCount);
  series.forEach((values, issuerIndex) => {
    values.forEach((value, dateIndex) => {
      const offset = issuerIndex * DATES.length + dateIndex;
      if (value === null) {
        return;
      }
      shareholders[offset] = value;
      shareholdersValid[offset] = 1;
    });
  });
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    dates: DATES,
    issuers,
    totalShares: new Int32Array(cellCount),
    freeFloat: new Int32Array(cellCount),
    shareholders,
    totalSharesValid: new Uint8Array(cellCount),
    freeFloatValid: new Uint8Array(cellCount),
    shareholdersValid,
  };
}
