import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { VectorsStore } from '../../core/data/vectors.store';
import { LocaleService, LOCALE_STORAGE_KEY } from '../../core/i18n/locale.service';
import { Header } from './header';

describe('Header', () => {
  beforeEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    document.documentElement.lang = 'bg';
  });

  it('refresh calls VectorsStore.reloadApp', async () => {
    const reloadApp = vi.fn();
    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [
        provideRouter([]),
        {
          provide: VectorsStore,
          useValue: { reloadApp, loading: signal(false) },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    const label = TestBed.inject(LocaleService).text('header.refresh');
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    const refresh = buttons.find((button) => button.textContent?.includes(label));
    expect(refresh).toBeTruthy();
    refresh?.click();
    expect(reloadApp).toHaveBeenCalledOnce();
  });
});
