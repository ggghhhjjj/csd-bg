import { describe, expect, it } from 'vitest';

import { detectLocale, shouldReloadForRuntimeI18n, urlForLocale } from './locale-url';

describe('detectLocale', () => {
  it('prefers a locale path segment', () => {
    expect(detectLocale('/csd-bg/en/index.html', 'bg', 'bg')).toBe('en');
  });

  it('uses stored locale when the path has no locale folder', () => {
    expect(detectLocale('/', 'bg', 'en')).toBe('en');
  });
});

describe('urlForLocale', () => {
  it('replaces a trailing locale folder', () => {
    expect(urlForLocale('https://example.com/csd-bg/bg/#/', 'en')).toBe(
      'https://example.com/csd-bg/en/#/',
    );
  });

  it('replaces locale before index.html', () => {
    expect(urlForLocale('https://example.com/csd-bg/bg/index.html#/', 'en')).toBe(
      'https://example.com/csd-bg/en/index.html#/',
    );
  });

  it('does not no-op when the path has no locale segment', () => {
    const next = urlForLocale('http://localhost:4200/#/issuer/x', 'en');
    expect(next).toContain('/en/');
    expect(next).not.toBe('http://localhost:4200/#/issuer/x');
  });
});

describe('shouldReloadForRuntimeI18n', () => {
  it('reloads on the dev server where no locale folder exists', () => {
    expect(shouldReloadForRuntimeI18n('http://localhost:4200/#/', 'http://localhost:4200/en/#/')).toBe(
      true,
    );
  });

  it('navigates between compiled locale folders', () => {
    expect(
      shouldReloadForRuntimeI18n('https://example.com/csd-bg/bg/#/', 'https://example.com/csd-bg/en/#'),
    ).toBe(false);
  });
});
