import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { VectorsStore } from '../../core/data/vectors.store';
import { Header } from './header';

describe('Header', () => {
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

    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    const refresh = buttons.find((button) => button.textContent?.includes('Опресни'));
    expect(refresh).toBeTruthy();
    refresh?.click();
    expect(reloadApp).toHaveBeenCalledOnce();
  });
});
