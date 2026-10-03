import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { LOCALE_STORAGE_KEY } from '../i18n/locale.service';
import { HelpService } from './help.service';

import { HELP_MANIFEST_FIXTURE } from './help-manifest.fixture';

describe('HelpService', () => {
  beforeEach(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'bg');
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
    TestBed.resetTestingModule();
  });

  it('opens a topic with locale in the iframe URL', async () => {
    const service = TestBed.inject(HelpService);
    await service.openTopic('statistics.shareholders-diff-rank');

    expect(service.open()).toBe(true);
    expect(service.activeTopicId()).toBe('statistics.shareholders-diff-rank');
    expect(service.entryUrl()).toBe('help/statistics/shareholders-diff-rank/index.html?v=1.0.0&lang=bg');
  });

  it('closes and clears active state', async () => {
    const service = TestBed.inject(HelpService);
    await service.openTopic('statistics.range-presets');
    service.close();

    expect(service.open()).toBe(false);
    expect(service.activeTopicId()).toBeNull();
    expect(service.entryUrl()).toBeNull();
  });

  it('reports topic availability after manifest load', async () => {
    const service = TestBed.inject(HelpService);
    await service.ensureManifest();

    expect(service.hasTopic('statistics.range-presets')).toBe(true);
  });
});
