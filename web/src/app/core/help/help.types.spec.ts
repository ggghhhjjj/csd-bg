import { describe, expect, it } from 'vitest';

import { buildHelpEntryUrl } from './help.types';

describe('buildHelpEntryUrl', () => {
  it('builds a relative URL with version and locale', () => {
    expect(
      buildHelpEntryUrl(
        {
          entryPath: 'help/statistics/range-presets/index.html',
          contentVersion: '1.0.0',
        },
        'bg',
      ),
    ).toBe('help/statistics/range-presets/index.html?v=1.0.0&lang=bg');
  });

  it('strips a leading slash from entryPath', () => {
    expect(
      buildHelpEntryUrl(
        {
          entryPath: '/help/statistics/range-presets/index.html',
          contentVersion: '2.0.0',
        },
        'en',
      ),
    ).toBe('help/statistics/range-presets/index.html?v=2.0.0&lang=en');
  });
});
