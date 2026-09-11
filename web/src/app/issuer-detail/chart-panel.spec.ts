import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VectorsStore } from '../core/data/vectors.store';
import { LOCALE_STORAGE_KEY } from '../core/i18n/locale.service';
import type { ParsedDataset } from '../core/data/vectors.types';
import { ChartPanel } from './chart-panel';

const { mockChart } = vi.hoisted(() => ({
  mockChart: {
    setOption: vi.fn(),
    getOption: vi.fn(() => ({})),
    on: vi.fn(),
    off: vi.fn(),
    dispose: vi.fn(),
    resize: vi.fn(),
    dispatchAction: vi.fn(),
    convertToPixel: vi.fn(),
    convertFromPixel: vi.fn(),
  },
}));

vi.mock('echarts', () => ({
  init: () => mockChart,
}));

function datasetFixture(): ParsedDataset {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    dates: ['2024-01-01', '2024-01-02', '2024-01-03', '2024-06-01'],
    issuers: [{ id: 1, isin: 'BG1100085072', name: 'Test' }],
    totalShares: new Int32Array([1, 1, 1, 1]),
    freeFloat: new Int32Array([1, 1, 1, 1]),
    shareholders: new Int32Array([1, 1, 1, 1]),
    totalSharesValid: new Uint8Array([1, 1, 1, 1]),
    freeFloatValid: new Uint8Array([1, 1, 1, 1]),
    shareholdersValid: new Uint8Array([1, 1, 1, 1]),
  };
}

describe('ChartPanel URL state', () => {
  const navigate = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    document.documentElement.lang = 'bg';
    navigate.mockClear();
    mockChart.setOption.mockClear();
    mockChart.on.mockClear();
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      } as unknown as typeof ResizeObserver;
    }
  });

  it('applies range and metrics from the current query params', async () => {
    const fixture = await createPanel({ range: 'y1', metrics: 'free_float' });
    fixture.detectChanges();

    expect(toggleOff(fixture.nativeElement, 'total_shares')).toBe(true);
    expect(toggleOff(fixture.nativeElement, 'free_float')).toBe(false);
    expect(toggleOff(fixture.nativeElement, 'shareholders')).toBe(true);
    expect(activePreset(fixture.nativeElement)).toBe('12 месеца');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('writes metrics to the URL when a series toggle is clicked', async () => {
    const fixture = await createPanel({});
    fixture.detectChanges();

    clickToggle(fixture.nativeElement, 'total_shares');

    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: {
          range: null,
          metrics: 'free_float,shareholders',
          from: null,
          to: null,
        },
        replaceUrl: true,
      }),
    );
  });

  it('writes a non-default preset to the URL', async () => {
    const fixture = await createPanel({});
    fixture.detectChanges();

    clickPreset(fixture.nativeElement, 'Всички');

    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: {
          range: 'max',
          metrics: null,
          from: null,
          to: null,
        },
        replaceUrl: true,
      }),
    );
  });

  it('restores a custom from/to window with no active preset', async () => {
    const fixture = await createPanel({ from: '2024-01-02', to: '2024-06-01' });
    fixture.detectChanges();

    expect(activePreset(fixture.nativeElement)).toBeNull();
    expect(mockChart.setOption).toHaveBeenCalled();
    const option = mockChart.setOption.mock.calls[0][0] as {
      dataZoom: Array<{ startValue: string; endValue: string }>;
    };
    expect(option.dataZoom[0].startValue).toBe('2024-01-02');
    expect(option.dataZoom[0].endValue).toBe('2024-06-01');
  });

  async function createPanel(query: Record<string, string>) {
    const route = {
      snapshot: { queryParamMap: convertToParamMap(query) },
    };
    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ChartPanel],
      providers: [
        { provide: ActivatedRoute, useValue: route },
        { provide: Router, useValue: { navigate } },
        {
          provide: VectorsStore,
          useValue: {
            showPercentChange: signal(true),
            togglePercentChange: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ChartPanel);
    fixture.componentRef.setInput('dataset', datasetFixture());
    fixture.componentRef.setInput('issuerIndex', 0);
    return fixture;
  }
});

function toggleOff(root: HTMLElement, metric: string): boolean {
  const button = root.querySelector(`.chart-panel__toggle--${metric}`);
  return button?.classList.contains('chart-panel__toggle--off') ?? false;
}

function clickToggle(root: HTMLElement, metric: string): void {
  (root.querySelector(`.chart-panel__toggle--${metric}`) as HTMLButtonElement).click();
}

function clickPreset(root: HTMLElement, label: string): void {
  const button = [...root.querySelectorAll('.chart-panel__preset')].find(
    (el) => el.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;
  button?.click();
}

function activePreset(root: HTMLElement): string | null {
  const button = root.querySelector('.chart-panel__preset--active');
  return button?.textContent?.trim() ?? null;
}
