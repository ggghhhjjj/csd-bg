import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { VectorsStore } from '../core/data/vectors.store';
import { IssuerList } from './issuer-list';

const ISSUERS = [
  { id: 1, isin: 'BG1100000001', name: 'Sopharma AD' },
  { id: 2, isin: 'BG1100000002', name: 'First Investment Bank' },
  { id: 3, isin: 'BG1100000003', name: 'Chimimport AD' },
];

describe('IssuerList', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IssuerList],
      providers: [
        provideRouter([]),
        {
          provide: VectorsStore,
          useValue: { dataset: signal({ issuers: ISSUERS }) },
        },
      ],
    }).compileComponents();
  });

  it('renders all issuers when the query is empty', () => {
    const fixture = TestBed.createComponent(IssuerList);
    fixture.detectChanges();

    expect(issuerNames(fixture.nativeElement)).toEqual([
      'Sopharma AD',
      'First Investment Bank',
      'Chimimport AD',
    ]);
  });

  it('filters by issuer name as the user types', () => {
    const fixture = TestBed.createComponent(IssuerList);
    fixture.detectChanges();

    typeSearch(fixture.nativeElement, 'soph');
    fixture.detectChanges();

    expect(issuerNames(fixture.nativeElement)).toEqual(['Sopharma AD']);
  });

  it('filters by ISIN substring', () => {
    const fixture = TestBed.createComponent(IssuerList);
    fixture.detectChanges();

    typeSearch(fixture.nativeElement, '000003');
    fixture.detectChanges();

    expect(issuerNames(fixture.nativeElement)).toEqual(['Chimimport AD']);
  });

  it('shows empty state when nothing matches', () => {
    const fixture = TestBed.createComponent(IssuerList);
    fixture.detectChanges();

    typeSearch(fixture.nativeElement, 'zzzz');
    fixture.detectChanges();

    expect(issuerNames(fixture.nativeElement)).toEqual([]);
    expect(fixture.nativeElement.querySelector('.issuer-list__empty')?.textContent).toContain(
      'Няма съвпадения.',
    );
  });
});

function typeSearch(root: HTMLElement, value: string): void {
  const input = root.querySelector('input') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function issuerNames(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.issuer-list__name')].map((el) => el.textContent?.trim() ?? '');
}
