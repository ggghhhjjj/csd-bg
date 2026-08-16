import { Injectable, signal } from '@angular/core';

import { LocalizedError, type TranslationKey } from '../i18n/translations';
import type { ParsedDataset, VectorsConfig, WorkerRequest } from './vectors.types';
import { isVectorsConfig } from './vectors.types';

export type StoreError = {
  key: TranslationKey;
  params?: Record<string, string>;
};

export const CACHE_NAME = 'csd-vectors-v1';
export const CACHE_DATE_KEY = 'csd-vectors-cached-on';
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

@Injectable({ providedIn: 'root' })
export class VectorsStore {
  readonly dataset = signal<ParsedDataset | null>(null);
  readonly loading = signal(false);
  readonly error = signal<StoreError | null>(null);
  readonly generatedAt = signal<string | null>(null);
  readonly showPercentChange = signal(true);

  private config: VectorsConfig | null = null;

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.config = await this.readConfig();
      if (localStorage.getItem(CACHE_DATE_KEY) !== localIsoDate()) {
        await this.invalidateCache();
      }
      const snapshot = await this.fetchDataset(this.config);
      this.dataset.set(snapshot);
      this.generatedAt.set(snapshot.generatedAt);
      localStorage.setItem(CACHE_DATE_KEY, localIsoDate());
      this.startDateWatch();
    } catch (error) {
      this.error.set(toStoreError(error));
    } finally {
      this.loading.set(false);
    }
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
    if (this.loading()) {
      return;
    }
    if (localStorage.getItem(CACHE_DATE_KEY) === localIsoDate()) {
      return;
    }
    await this.reloadApp();
  }

  private async invalidateCache(): Promise<void> {
    await caches.delete(CACHE_NAME);
    localStorage.removeItem(CACHE_DATE_KEY);
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

  private async fetchDataset(config: VectorsConfig): Promise<ParsedDataset> {
    const [manifestText, catalogText, datesBuffer, seriesBuffer] = await Promise.all([
      this.readText(config.manifestUrl),
      this.readText(config.catalogUrl),
      this.readBuffer(config.datesUrl),
      this.readBuffer(config.seriesUrl),
    ]);
    return this.parseInWorker({ manifestText, catalogText, datesBuffer, seriesBuffer });
  }

  private async readText(url: string): Promise<string> {
    const buffer = await this.readBuffer(url);
    return new TextDecoder().decode(buffer);
  }

  private async readBuffer(url: string): Promise<ArrayBuffer> {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url);
    if (cached) {
      return cached.arrayBuffer();
    }
    const response = await fetch(url, { redirect: 'follow', cache: 'no-store' });
    if (!response.ok) {
      throw new LocalizedError('error.fetchFailed', { url });
    }
    const clone = response.clone();
    await cache.put(url, clone);
    return response.arrayBuffer();
  }

  private parseInWorker(request: WorkerRequest): Promise<ParsedDataset> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./vectors.worker', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<ParsedDataset | { error: string }>) => {
        worker.terminate();
        if (event.data && 'error' in event.data) {
          reject(new Error(event.data.error));
          return;
        }
        resolve(event.data as ParsedDataset);
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(new Error(event.message || 'Worker failed'));
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
    key: 'error.fetchFailed',
    params: { url: error instanceof Error ? error.message : String(error) },
  };
}
