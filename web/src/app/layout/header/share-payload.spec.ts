import { buildSharePayload, isShareAbortError, issuerIsinFromUrl } from './share-payload';

const LABELS = {
  title: 'Free Float',
  appText: 'CSD-BG Free Float analytics',
  issuerText: '{name} ({isin})',
};

describe('issuerIsinFromUrl', () => {
  it('returns null for the home route', () => {
    expect(issuerIsinFromUrl('/')).toBeNull();
    expect(issuerIsinFromUrl('/#/')).toBeNull();
  });

  it('extracts the ISIN from path, hash, and query URLs', () => {
    expect(issuerIsinFromUrl('/issuer/BG1100000001')).toBe('BG1100000001');
    expect(issuerIsinFromUrl('/#/issuer/BG1100000001')).toBe('BG1100000001');
    expect(issuerIsinFromUrl('https://example.com/app/#/issuer/BG1100000001')).toBe('BG1100000001');
    expect(issuerIsinFromUrl('/issuer/BG1100000001?x=1')).toBe('BG1100000001');
  });
});

describe('buildSharePayload', () => {
  const href = 'https://example.com/app/#/';

  it('uses the app title and text on the list view', () => {
    expect(buildSharePayload(href, LABELS)).toEqual({
      title: 'Free Float · CSD-BG Free Float analytics',
      url: href,
    });
    expect(buildSharePayload(href, LABELS, null)).toEqual({
      title: 'Free Float · CSD-BG Free Float analytics',
      url: href,
    });
  });

  it('omits text so iOS Copy uses the url field', () => {
    const payload = buildSharePayload(href, LABELS, { name: 'Sopharma AD', isin: 'BG1100000001' });
    expect(payload).not.toHaveProperty('text');
    expect(payload.url).toBe(href);
  });

  it('includes issuer name and ISIN for a detail view', () => {
    const url = 'https://example.com/app/#/issuer/BG1100000001';
    expect(
      buildSharePayload(url, LABELS, { name: 'Sopharma AD', isin: 'BG1100000001' }),
    ).toEqual({
      title: 'Sopharma AD (BG1100000001) · Free Float',
      url,
    });
  });

  it('falls back to ISIN when the issuer name is missing', () => {
    const url = 'https://example.com/app/#/issuer/BG1100000001';
    expect(buildSharePayload(url, LABELS, { isin: 'BG1100000001' })).toEqual({
      title: 'BG1100000001 (BG1100000001) · Free Float',
      url,
    });
    expect(buildSharePayload(url, LABELS, { name: '  ', isin: 'BG1100000001' }).title).toBe(
      'BG1100000001 (BG1100000001) · Free Float',
    );
  });
});

describe('isShareAbortError', () => {
  it('detects AbortError from the share sheet', () => {
    const abort = new Error('Share canceled');
    abort.name = 'AbortError';
    expect(isShareAbortError(abort)).toBe(true);
    expect(isShareAbortError({ name: 'AbortError' })).toBe(true);
    expect(isShareAbortError(new Error('failed'))).toBe(false);
    expect(isShareAbortError('AbortError')).toBe(false);
  });
});
