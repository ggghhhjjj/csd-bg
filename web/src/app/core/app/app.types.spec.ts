import { describe, expect, it } from 'vitest';

import { isAppConfig } from './app.types';

describe('isAppConfig', () => {
  it('accepts a positive integer version', () => {
    expect(isAppConfig({ version: 1 })).toBe(true);
    expect(isAppConfig({ version: 99 })).toBe(true);
  });

  it('rejects invalid payloads', () => {
    expect(isAppConfig(null)).toBe(false);
    expect(isAppConfig({ version: 0 })).toBe(false);
    expect(isAppConfig({ version: 1.5 })).toBe(false);
    expect(isAppConfig({ version: '1' })).toBe(false);
    expect(isAppConfig({})).toBe(false);
  });
});
