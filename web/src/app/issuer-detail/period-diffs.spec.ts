import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { LOCALE_STORAGE_KEY } from '../core/i18n/locale.service';
import type { ParsedDataset } from '../core/data/vectors.types';
import { PeriodDiffs, periodDiffs } from './period-diffs';

function datasetFixture(): ParsedDataset {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    dates: ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'],
    issuers: [{ id: 1, isin: 'BG000', name: 'Test' }],
    totalShares: new Int32Array([0, 100, 0, 150]),
    freeFloat: new Int32Array([0, 0, 0, 0]),
    shareholders: new Int32Array([0, 10, 12, 0]),
    totalSharesValid: new Uint8Array([0, 1, 0, 1]),
    freeFloatValid: new Uint8Array([0, 0, 0, 0]),
    shareholdersValid: new Uint8Array([0, 1, 1, 0]),
  };
}

describe('periodDiffs', () => {
  it('computes abs and percent for all three metrics, skipping invalid cells', () => {
    expect(periodDiffs(datasetFixture(), 0, '2024-01-01', '2024-01-04')).toEqual([
      { metric: 'total_shares', abs: '+50', percent: '+50.00%' },
      { metric: 'free_float', abs: '—', percent: '—' },
      { metric: 'shareholders', abs: '+2', percent: '+20.00%' },
    ]);
  });

  it('narrows first/last to the selected window', () => {
    expect(periodDiffs(datasetFixture(), 0, '2024-01-03', '2024-01-04')).toEqual([
      { metric: 'total_shares', abs: '0', percent: '0.00%' },
      { metric: 'free_float', abs: '—', percent: '—' },
      { metric: 'shareholders', abs: '0', percent: '0.00%' },
    ]);
  });
});

describe('PeriodDiffs', () => {
  beforeEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    document.documentElement.lang = 'bg';
  });

  it('renders all three metrics without a visibility map', async () => {
    const fixture = await createComponent('2024-01-01', '2024-01-04');
    fixture.detectChanges();

    expect(metricLabels(fixture.nativeElement)).toEqual(['Общ брой акции:', 'Свободен флот:', 'Акционери:']);
    expect(metricValues(fixture.nativeElement)).toEqual(['+50 (+50.00%)', '— (—)', '+2 (+20.00%)']);
    expect(rangeText(fixture.nativeElement)).toBe('2024-01-01 — 2024-01-04');
  });

  it('updates when the selected period changes', async () => {
    const fixture = await createComponent('2024-01-01', '2024-01-04');
    fixture.detectChanges();

    fixture.componentRef.setInput('startDate', '2024-01-03');
    fixture.detectChanges();

    expect(metricValues(fixture.nativeElement)).toEqual(['0 (0.00%)', '— (—)', '0 (0.00%)']);
    expect(rangeText(fixture.nativeElement)).toBe('2024-01-03 — 2024-01-04');
  });

  it('hides until both dates are set', async () => {
    const fixture = await createComponent('', '');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.period-diffs')).toBeNull();
  });

  async function createComponent(startDate: string, endDate: string) {
    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PeriodDiffs],
    }).compileComponents();

    const fixture = TestBed.createComponent(PeriodDiffs);
    fixture.componentRef.setInput('dataset', datasetFixture());
    fixture.componentRef.setInput('issuerIndex', 0);
    fixture.componentRef.setInput('startDate', startDate);
    fixture.componentRef.setInput('endDate', endDate);
    return fixture;
  }
});

function metricLabels(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.period-diffs__label')].map((el) => el.textContent?.trim() ?? '');
}

function metricValues(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.period-diffs__values')].map((el) => el.textContent?.trim() ?? '');
}

function rangeText(root: HTMLElement): string {
  return root.querySelector('.period-diffs__range')?.textContent?.trim() ?? '';
}
