import { Injectable, signal } from '@angular/core';

import { LocalizedError, type TranslationKey } from '../i18n/translations';
import type { ParsedDataset, VectorsConfig, WorkerRequest } from './vectors.types';
import { isVectorsConfig } from './vectors.types';

export type StoreError = {
  key: TranslationKey;
  params?: Record<string, string>;
};

export type FetchPhase = 'idle' | 'countdown' | 'processing' | 'failed' | 'success';

export const CACHE_NAME = 'csd-vectors-v1';
export const CACHE_DATE_KEY = 'csd-vectors-cached-on';
export const VECTORS_RETRY_DELAY_SEC = 5;
export const VECTORS_SUCCESS_HIDE_SEC = 5;
const CONFIG_URL = 'assets/vectors.config.json';

let visibilityHandler: (() => void) | null = null;
let midnightTimer: ReturnType<typeof setTimeout> | null = null;

export function localIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function msUntilNextLocalMidnight(now = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, next.getTime() - now.getTime());
}

export const appReloader = {
  reload(): void {
    window.location.reload();
  },
};

type CacheEntry = {
  url: string;
  buffer: ArrayBuffer;
};

@Injectable({ providedIn: 'root' })
export class VectorsStore {
  readonly dataset = signal<ParsedDataset | null>(null);
  readonly loading = signal(false);
  readonly error = signal<StoreError | null>(null);
  readonly generatedAt = signal<string | null>(null);
  readonly cachedOn = signal<string | null>(null);
  readonly showPercentChange = signal(true);
  readonly fetchPhase = signal<FetchPhase>('idle');
  readonly countdownSec = signal<number | null>(null);
  readonly fetchDialogOpen = signal(false);
  readonly lastFetchError = signal<StoreError | null>(null);

  private config: VectorsConfig | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private successHideTimer: ReturnType<typeof setTimeout> | null = null;

  async load(): Promise<void> {
    await this.runUpdateTransaction();
  }

  async runUpdateTransaction(options: { invalidateCache?: boolean } = {}): Promise<void> {
    const phase = this.fetchPhase();
    if (phase === 'processing' || phase === 'countdown') {
      return;
    }

    this.clearSuccessHide();
    this.fetchPhase.set('processing');
    this.loading.set(true);
    this.error.set(null);
    this.lastFetchError.set(null);

    try {
      if (options.invalidateCache || localStorage.getItem(CACHE_DATE_KEY) !== localIsoDate()) {
        await this.invalidateCache();
      }
      this.config = await this.readConfig();
      const { snapshot, cacheEntries } = await this.fetchDatasetToMemory(this.config);
      await this.commitCache(cacheEntries);
      this.dataset.set(snapshot);
      this.generatedAt.set(snapshot.generatedAt);
      const cachedOn = localIsoDate();
      localStorage.setItem(CACHE_DATE_KEY, cachedOn);
      this.cachedOn.set(cachedOn);
      this.startDateWatch();
      this.fetchPhase.set('success');
      this.scheduleSuccessHide();
    } catch (error) {
      const storeError = toStoreError(error);
      this.error.set(storeError);
      this.lastFetchError.set(storeError);
      this.fetchPhase.set('failed');
      this.fetchDialogOpen.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  retryFetch(): void {
    this.fetchDialogOpen.set(false);
    this.startCountdown();
  }

  continueWithOldData(): void {
    this.fetchDialogOpen.set(false);
    this.clearCountdown();
    this.fetchPhase.set('idle');
  }

  async reloadApp(): Promise<void> {
    await this.invalidateCache();
    appReloader.reload();
  }

  togglePercentChange(): void {
    this.showPercentChange.update((value) => !value);
  }

  issuerIndexByIsin(isin: string): number {
    const dataset = this.dataset();
    if (!dataset) {
      return -1;
    }
    return dataset.issuers.findIndex((issuer) => issuer.isin === isin);
  }

  private startCountdown(): void {
    this.clearCountdown();
    this.fetchPhase.set('countdown');
    this.countdownSec.set(VECTORS_RETRY_DELAY_SEC);
    this.countdownTimer = setInterval(() => {
      const next = (this.countdownSec() ?? 0) - 1;
      if (next <= 0) {
        this.clearCountdown();
        this.fetchPhase.set('idle');
        void this.runUpdateTransaction();
        return;
      }
      this.countdownSec.set(next);
    }, 1000);
  }

  private clearCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.countdownSec.set(null);
  }

  private scheduleSuccessHide(): void {
    this.successHideTimer = setTimeout(() => {
      this.fetchPhase.set('idle');
      this.successHideTimer = null;
    }, VECTORS_SUCCESS_HIDE_SEC * 1000);
  }

  private clearSuccessHide(): void {
    if (this.successHideTimer) {
      clearTimeout(this.successHideTimer);
      this.successHideTimer = null;
    }
  }

  private startDateWatch(): void {
    if (midnightTimer) {
      clearTimeout(midnightTimer);
    }
    midnightTimer = setTimeout(() => {
      void this.reloadIfDateChanged();
    }, msUntilNextLocalMidnight());

    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
    }
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        void this.reloadIfDateChanged();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);
  }

  private async reloadIfDateChanged(): Promise<void> {
    const phase = this.fetchPhase();
    if (phase === 'processing' || phase === 'countdown') {
      return;
    }
    if (localStorage.getItem(CACHE_DATE_KEY) === localIsoDate()) {
      return;
    }
    await this.runUpdateTransaction({ invalidateCache: true });
  }

  private async invalidateCache(): Promise<void> {
    await caches.delete(CACHE_NAME);
    localStorage.removeItem(CACHE_DATE_KEY);
    this.cachedOn.set(null);
  }

  private async readConfig(): Promise<VectorsConfig> {
    const response = await fetch(CONFIG_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new LocalizedError('error.configMissing');
    }
    const json: unknown = await response.json();
    if (!isVectorsConfig(json)) {
      throw new LocalizedError('error.configInvalid');
    }
    return json;
  }

  private async fetchDatasetToMemory(
    config: VectorsConfig,
  ): Promise<{ snapshot: ParsedDataset; cacheEntries: CacheEntry[] }> {
    const manifest = await this.fetchResource(config.manifestUrl);
    const catalog = await this.fetchResource(config.catalogUrl);
    const dates = await this.fetchResource(config.datesUrl);
    const series = await this.fetchResource(config.seriesUrl);

    const manifestText = new TextDecoder().decode(manifest.buffer);
    const catalogText = new TextDecoder().decode(catalog.buffer);
    const snapshot = await this.parseInWorker({
      manifestText,
      catalogText,
      datesBuffer: dates.buffer,
      seriesBuffer: series.buffer,
    });

    return {
      snapshot,
      cacheEntries: [manifest, catalog, dates, series],
    };
  }

  private async fetchResource(url: string): Promise<CacheEntry> {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url);
    if (cached) {
      return { url, buffer: await cached.arrayBuffer() };
    }

    const response = await fetch(url, { redirect: 'follow', cache: 'no-store' });
    if (!response.ok) {
      throw new LocalizedError('error.fetchFailed', { url });
    }
    return { url, buffer: await response.arrayBuffer() };
  }

  private async commitCache(entries: CacheEntry[]): Promise<void> {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(
      entries.map(({ url, buffer }) =>
        cache.put(
          url,
          new Response(buffer.slice(0), {
            status: 200,
          }),
        ),
      ),
    );
  }

  private parseInWorker(request: WorkerRequest): Promise<ParsedDataset> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./vectors.worker', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<ParsedDataset | { error: string }>) => {
        worker.terminate();
        if (event.data && 'error' in event.data) {
          reject(new LocalizedError('error.dataCorrupt', { detail: event.data.error }));
          return;
        }
        resolve(event.data as ParsedDataset);
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(new LocalizedError('error.dataCorrupt', { detail: event.message || 'Worker failed' }));
      };
      worker.postMessage(request, [request.datesBuffer, request.seriesBuffer]);
    });
  }
}

function toStoreError(error: unknown): StoreError {
  if (error instanceof LocalizedError) {
    return { key: error.key, params: error.params };
  }
  return {
    key: 'error.dataCorrupt',
    params: { detail: error instanceof Error ? error.message : String(error) },
  };
}
