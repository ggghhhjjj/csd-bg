import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { AppConfigService } from './app-config.service';

const CONFIG = { version: 42 };

describe('AppConfigService', () => {
  beforeEach(() => {
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

  it('loads the application version from config', async () => {
    const service = TestBed.inject(AppConfigService);
    await service.initialize();

    expect(service.version()).toBe(42);
  });
});
