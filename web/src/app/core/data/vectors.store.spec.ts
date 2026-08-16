import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ParsedDataset } from './vectors.types';
import {
  appReloader,
  CACHE_DATE_KEY,
  CACHE_NAME,
  localIsoDate,
  msUntilNextLocalMidnight,
  VectorsStore,
} from './vectors.store';

const CONFIG = {
  manifestUrl: 'https://example.com/manifest.json',
  catalogUrl: 'https://example.com/catalog.json',
  datesUrl: 'https://example.com/dates.arrow',
  seriesUrl: 'https://example.com/series.arrow',
};

const DATASET: ParsedDataset = {
  generatedAt: '2026-08-16T00:00:00.000Z',
  dates: ['2026-08-15'],
  issuers: [{ id: 1, isin: 'BG000', name: 'Test' }],
  totalShares: new Int32Array([1]),
  freeFloat: new Int32Array([1]),
  shareholders: new Int32Array([1]),
  totalSharesValid: new Uint8Array([1]),
  freeFloatValid: new Uint8Array([1]),
  shareholdersValid: new Uint8Array([1]),
};

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(): void {
    queueMicrotask(() => {
      this.onmessage?.({ data: DATASET } as MessageEvent);
    });
  }

  terminate(): void {}
}

describe('localIsoDate / msUntilNextLocalMidnight', () => {
  it('formats the local calendar date', () => {
    expect(localIsoDate(new Date(2026, 7, 16, 23, 30))).toBe('2026-08-16');
  });

  it('returns milliseconds until the next local midnight', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 7, 16, 23, 59, 0))).toBe(60_000);
  });
});

describe('VectorsStore', () => {
  const cacheEntries = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (url: string) => {
      const stored = cacheEntries.get(url);
      return stored ? stored.clone() : undefined;
    }),
    put: vi.fn(async (url: string, response: Response) => {
      cacheEntries.set(url, response);
    }),
    delete: vi.fn(async (url: string) => cacheEntries.delete(url)),
  };
  const cachesApi = {
    open: vi.fn(async () => cache),
    delete: vi.fn(async () => {
      cacheEntries.clear();
      return true;
    }),
  };

  let fetchMock: ReturnType<typeof vi.fn>;
  let reloadSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cacheEntries.clear();
    cache.match.mockClear();
    cache.put.mockClear();
    cache.delete.mockClear();
    cachesApi.open.mockClear();
    cachesApi.delete.mockClear();
    localStorage.removeItem(CACHE_DATE_KEY);
    vi.stubGlobal('caches', cachesApi);
    vi.stubGlobal('Worker', FakeWorker);

    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'assets/vectors.config.json') {
        return jsonResponse(CONFIG);
      }
      if (url.endsWith('.json')) {
        return jsonResponse({});
      }
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    reloadSpy = vi.spyOn(appReloader, 'reload').mockImplementation(() => {});
  });

  afterEach(() => {
    reloadSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('same-day load uses the Cache API for vector files', async () => {
    const store = new VectorsStore();
    await store.load();
    expect(localStorage.getItem(CACHE_DATE_KEY)).toBe(localIsoDate());
    expect(vectorFetchCount()).toBe(4);

    await store.load();
    expect(vectorFetchCount()).toBe(4);
    expect(store.dataset()?.generatedAt).toBe(DATASET.generatedAt);
  });

  it('missing stamp bypasses cache and refetches', async () => {
    const store = new VectorsStore();
    await store.load();
    expect(vectorFetchCount()).toBe(4);

    localStorage.removeItem(CACHE_DATE_KEY);
    await store.load();
    expect(cachesApi.delete).toHaveBeenCalledWith(CACHE_NAME);
    expect(vectorFetchCount()).toBe(8);
  });

  it('a stamp from a different day bypasses cache', async () => {
    const store = new VectorsStore();
    await store.load();
    localStorage.setItem(CACHE_DATE_KEY, '2000-01-01');

    await store.load();
    expect(cachesApi.delete).toHaveBeenCalledWith(CACHE_NAME);
    expect(vectorFetchCount()).toBe(8);
    expect(localStorage.getItem(CACHE_DATE_KEY)).toBe(localIsoDate());
  });

  it('reloadApp deletes the cache and reloads the document', async () => {
    const store = new VectorsStore();
    await store.load();
    await store.reloadApp();
    expect(cachesApi.delete).toHaveBeenCalledWith(CACHE_NAME);
    expect(localStorage.getItem(CACHE_DATE_KEY)).toBeNull();
    expect(reloadSpy).toHaveBeenCalledOnce();
  });

  it('visibility on a new date triggers reload', async () => {
    const store = new VectorsStore();
    await store.load();
    localStorage.setItem(CACHE_DATE_KEY, '2000-01-01');
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => {
      expect(reloadSpy).toHaveBeenCalledOnce();
    });
  });

  it('visibility on the same date does not reload', async () => {
    const store = new VectorsStore();
    await store.load();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    await Promise.resolve();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  function vectorFetchCount(): number {
    return fetchMock.mock.calls.filter(([input]) => String(input).startsWith('https://example.com/')).length;
  }
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
