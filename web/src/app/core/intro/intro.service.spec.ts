import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { INTRO_SEEN_VERSION_KEY, IntroService } from './intro.service';

const CONFIG = {
  contentVersion: '1.0.0',
  entryPath: 'intro/index.html',
};

describe('IntroService', () => {
  beforeEach(() => {
    localStorage.removeItem(INTRO_SEEN_VERSION_KEY);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => CONFIG,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('auto-opens on first launch when no seen version is stored', async () => {
    const service = TestBed.inject(IntroService);
    await service.initialize('bg');

    expect(service.open()).toBe(true);
    expect(service.entryUrl()).toBe('intro/index.html?v=1.0.0&lang=bg');
  });

  it('does not auto-open when seen version matches config', async () => {
    localStorage.setItem(INTRO_SEEN_VERSION_KEY, '1.0.0');
    const service = TestBed.inject(IntroService);

    await service.initialize('bg');

    expect(service.open()).toBe(false);
  });

  it('auto-opens when content version changes', async () => {
    localStorage.setItem(INTRO_SEEN_VERSION_KEY, '0.9.0');
    const service = TestBed.inject(IntroService);

    await service.initialize('en');

    expect(service.open()).toBe(true);
    expect(service.entryUrl()).toContain('lang=en');
  });

  it('persists seen version on dismiss', async () => {
    const service = TestBed.inject(IntroService);
    await service.initialize('bg');
    service.dismiss();

    expect(localStorage.getItem(INTRO_SEEN_VERSION_KEY)).toBe('1.0.0');
    expect(service.open()).toBe(false);
  });

  it('opens from menu even when already seen', async () => {
    localStorage.setItem(INTRO_SEEN_VERSION_KEY, '1.0.0');
    const service = TestBed.inject(IntroService);

    await service.openFromMenu('bg');

    expect(service.open()).toBe(true);
    expect(service.isManualOpen()).toBe(true);
  });
});
