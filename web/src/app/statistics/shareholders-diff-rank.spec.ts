import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HELP_MANIFEST_FIXTURE } from '../core/help/help-manifest.fixture';
import { LOCALE_STORAGE_KEY } from '../core/i18n/locale.service';
import type { ParsedDataset, VectorCatalogEntry } from '../core/data/vectors.types';
import { ShareholdersDiffRank } from './shareholders-diff-rank';

const DATES = ['2024-01-01', '2024-04-01', '2024-07-01'];

describe('ShareholdersDiffRank', () => {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the selected date range under the title', async () => {
    const fixture = await createComponent();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.shareholders-diff-rank__range')?.textContent).toContain(
      '2024-01-01 → 2024-07-01',
    );
  });

  it('ranks by day-over-day change when the range is two adjacent report days', async () => {
    const fixture = await createComponent();
    fixture.componentRef.setInput('startDate', DATES[1]);
    fixture.componentRef.setInput('endDate', DATES[2]);
    fixture.detectChanges();

    expect(rowNames(fixture.nativeElement)).toEqual(['Delta', 'Zeta', 'Alpha', 'Beta', 'Twin']);
    expect(rowNames(fixture.nativeElement)[0]).toBe('Delta');
  });

  it('shows the top 5 issuers in descending order by default', async () => {
    const fixture = await createComponent();
    fixture.detectChanges();

    expect(rowNames(fixture.nativeElement)).toEqual(['Delta', 'Zeta', 'Alpha', 'Beta', 'Twin']);
    expect(fixture.nativeElement.querySelector('.shareholders-diff-rank__title')?.textContent).toContain(
      'Промяна в акционерите',
    );
  });

  it('toggles to ascending order', async () => {
    const fixture = await createComponent();
    fixture.detectChanges();

    clickAction(fixture.nativeElement, 'Низходящо');
    fixture.detectChanges();

    expect(rowNames(fixture.nativeElement)).toEqual(['Gamma', 'Twin', 'Twin', 'Alpha', 'Beta']);
  });

  it('cycles the change filter through positive, negative, and unchanged', async () => {
    const fixture = await createComponent();
    fixture.detectChanges();

    expect(rowNames(fixture.nativeElement)).toHaveLength(5);
    clickAction(fixture.nativeElement, 'Всички промени');
    fixture.detectChanges();
    expect(fixture.componentRef.instance['changeFilter']()).toBe('positive');
    expect(rowNames(fixture.nativeElement)).toEqual(['Delta', 'Zeta', 'Alpha', 'Beta', 'Twin']);

    clickAction(fixture.nativeElement, 'Само увеличения');
    fixture.detectChanges();
    expect(fixture.componentRef.instance['changeFilter']()).toBe('negative');
    expect(rowNames(fixture.nativeElement)).toEqual(['Gamma']);

    clickAction(fixture.nativeElement, 'Само намаления');
    fixture.detectChanges();
    expect(fixture.componentRef.instance['changeFilter']()).toBe('unchanged');
    expect(rowNames(fixture.nativeElement)).toEqual([]);
  });

  it('shows filtered sum and market net when decreases only is active', async () => {
    const fixture = await createComponent();
    fixture.componentRef.setInput('changeFilter', 'negative');
    fixture.detectChanges();

    const net = fixture.nativeElement.querySelector('.shareholders-diff-rank__net')?.textContent ?? '';
    expect(net).toContain('-8');
    expect(net).toContain('+38');
    expect(net).toContain('пазар');
  });

  it('limits top 5 within the active change filter', async () => {
    const fixture = await createComponent();
    fixture.componentRef.setInput('changeFilter', 'positive');
    fixture.detectChanges();

    expect(rowNames(fixture.nativeElement)).toEqual(['Delta', 'Zeta', 'Alpha', 'Beta', 'Twin']);
    clickAction(fixture.nativeElement, 'Покажи всички');
    fixture.detectChanges();
    expect(rowNames(fixture.nativeElement)).toEqual(['Delta', 'Zeta', 'Alpha', 'Beta', 'Twin', 'Twin']);
  });

  it('toggles between top 5 and all ranked issuers', async () => {
    const fixture = await createComponent();
    fixture.detectChanges();

    expect(rowNames(fixture.nativeElement)).toHaveLength(5);
    clickAction(fixture.nativeElement, 'Покажи всички');
    fixture.detectChanges();

    expect(rowNames(fixture.nativeElement)).toEqual(['Delta', 'Zeta', 'Alpha', 'Beta', 'Twin', 'Twin', 'Gamma']);
    clickAction(fixture.nativeElement, 'Топ 5');
    fixture.detectChanges();
    expect(rowNames(fixture.nativeElement)).toHaveLength(5);
  });

  it('shows an empty state when no issuer has a diff', async () => {
    const fixture = await createComponent(emptyFixture());
    fixture.detectChanges();

    expect(rowNames(fixture.nativeElement)).toEqual([]);
    expect(fixture.nativeElement.querySelector('.shareholders-diff-rank__empty')?.textContent).toContain(
      'Няма данни за избрания период.',
    );
  });

  it('links each row to the issuer detail page', async () => {
    const fixture = await createComponent();
    fixture.detectChanges();

    const href = fixture.nativeElement.querySelector('.shareholders-diff-rank__link')?.getAttribute('href');
    expect(href).toContain('BG1100000050');
  });
});

async function createComponent(dataset: ParsedDataset = rankingFixture()) {
  await TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [ShareholdersDiffRank],
    providers: [provideRouter([])],
  }).compileComponents();

  const fixture = TestBed.createComponent(ShareholdersDiffRank);
  fixture.componentRef.setInput('dataset', dataset);
  fixture.componentRef.setInput('startDate', DATES[0]);
  fixture.componentRef.setInput('endDate', DATES[2]);
  fixture.componentRef.setInput('order', 'desc');
  fixture.componentRef.setInput('showAll', false);
  fixture.componentRef.setInput('changeFilter', 'all');
  fixture.componentInstance.orderChange.subscribe((order) => fixture.componentRef.setInput('order', order));
  fixture.componentInstance.showAllChange.subscribe((showAll) =>
    fixture.componentRef.setInput('showAll', showAll),
  );
  fixture.componentInstance.changeFilterChange.subscribe((changeFilter) =>
    fixture.componentRef.setInput('changeFilter', changeFilter),
  );
  return fixture;
}

function rowNames(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.shareholders-diff-rank__name')].map((el) => el.textContent?.trim() ?? '');
}

function clickAction(root: HTMLElement, label: string): void {
  const button = [...root.querySelectorAll('.shareholders-diff-rank__action')].find(
    (el) => el.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;
  expect(button).toBeTruthy();
  button?.click();
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
  return packDataset(issuers, series);
}

function emptyFixture(): ParsedDataset {
  return packDataset([{ id: 1, isin: 'BG000', name: 'None' }], [[null, null, null]]);
}

function packDataset(issuers: VectorCatalogEntry[], series: Array<Array<number | null>>): ParsedDataset {
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
