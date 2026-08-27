import { describe, expect, it } from 'vitest';

import { buildIntroEntryUrl } from './intro.types';

describe('buildIntroEntryUrl', () => {
  it('builds a versioned entry URL with locale', () => {
    expect(
      buildIntroEntryUrl({ contentVersion: '1.0.0', entryPath: 'intro/index.html' }, 'bg'),
    ).toBe('intro/index.html?v=1.0.0&lang=bg');
  });

  it('strips a leading slash from entryPath', () => {
    expect(
      buildIntroEntryUrl({ contentVersion: '2.1.0', entryPath: '/intro/index.html' }, 'en'),
    ).toBe('intro/index.html?v=2.1.0&lang=en');
  });
});
