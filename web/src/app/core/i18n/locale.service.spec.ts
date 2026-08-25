import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { VectorsStore } from '../data/vectors.store';
import { LocaleService, LOCALE_STORAGE_KEY } from './locale.service';

describe('LocaleService', () => {
  beforeEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    document.documentElement.lang = 'bg';
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    document.documentElement.lang = 'bg';
    TestBed.resetTestingModule();
  });

  it('interpolates params in text()', () => {
    const i18n = TestBed.inject(LocaleService);
    expect(i18n.text('error.fetchFailed', { url: 'https://example.com/data' })).toBe(
      'Неуспешно зареждане на данни (https://example.com/data).',
    );
  });

  it('toggle persists locale, updates html lang, and switches labels', () => {
    const i18n = TestBed.inject(LocaleService);
    expect(i18n.locale()).toBe('bg');
    expect(i18n.text('header.title')).toBe('Свободен флот');

    i18n.toggle();

    expect(i18n.locale()).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(i18n.text('header.title')).toBe('Free Float');
    expect(i18n.text('error.fetchFailed', { url: 'x' })).toBe('Failed to load data (x).');
  });

  it('reads stored locale on construct', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    const i18n = TestBed.inject(LocaleService);
    expect(i18n.locale()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('toggle does not call VectorsStore.load', () => {
    const load = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: VectorsStore, useValue: { load } }],
    });
    const i18n = TestBed.inject(LocaleService);
    i18n.toggle();
    expect(load).not.toHaveBeenCalled();
  });
});
