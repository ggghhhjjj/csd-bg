import { Injectable, signal } from '@angular/core';

import type { ParsedDataset, VectorsConfig, WorkerRequest } from './vectors.types';
import { isVectorsConfig } from './vectors.types';

const CACHE_NAME = 'csd-vectors-v1';
const CONFIG_URL = 'assets/vectors.config.json';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class VectorsStore {
  readonly dataset = signal<ParsedDataset | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly generatedAt = signal<string | null>(null);
  readonly showPercentChange = signal(true);

  private config: VectorsConfig | null = null;
  private checkTimer: ReturnType<typeof setInterval> | null = null;

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.config = await this.readConfig();
      const snapshot = await this.fetchDataset(this.config, false);
      this.dataset.set(snapshot);
      this.generatedAt.set(snapshot.generatedAt);
      this.startDailyCheck();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }

  async refresh(): Promise<void> {
    if (!this.config) {
      await this.load();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        [this.config.manifestUrl, this.config.catalogUrl, this.config.datesUrl, this.config.seriesUrl].map((url) =>
          cache.delete(url),
        ),
      );
      const snapshot = await this.fetchDataset(this.config, true);
      this.dataset.set(snapshot);
      this.generatedAt.set(snapshot.generatedAt);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
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

  private startDailyCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }
    this.checkTimer = setInterval(() => {
      void this.probeUpdate();
    }, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.probeUpdate();
      }
    });
  }

  private async probeUpdate(): Promise<void> {
    if (!this.config || this.loading()) {
      return;
    }
    try {
      const response = await fetch(this.config.manifestUrl, { cache: 'no-store', redirect: 'follow' });
      if (!response.ok) {
        return;
      }
      const manifest = (await response.json()) as { generated_at?: string };
      if (manifest.generated_at && manifest.generated_at !== this.generatedAt()) {
        await this.refresh();
      }
    } catch {
      /* keep cached dataset */
    }
  }

  private async readConfig(): Promise<VectorsConfig> {
    const response = await fetch(CONFIG_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error($localize`:@@error.configMissing:Липсва конфигурация за данни.`);
    }
    const json: unknown = await response.json();
    if (!isVectorsConfig(json)) {
      throw new Error($localize`:@@error.configInvalid:Невалидни URL адреси в vectors.config.json.`);
    }
    return json;
  }

  private async fetchDataset(config: VectorsConfig, bypassCache: boolean): Promise<ParsedDataset> {
    const [manifestText, catalogText, datesBuffer, seriesBuffer] = await Promise.all([
      this.readText(config.manifestUrl, bypassCache),
      this.readText(config.catalogUrl, bypassCache),
      this.readBuffer(config.datesUrl, bypassCache),
      this.readBuffer(config.seriesUrl, bypassCache),
    ]);
    return this.parseInWorker({ manifestText, catalogText, datesBuffer, seriesBuffer });
  }

  private async readText(url: string, bypassCache: boolean): Promise<string> {
    const buffer = await this.readBuffer(url, bypassCache);
    return new TextDecoder().decode(buffer);
  }

  private async readBuffer(url: string, bypassCache: boolean): Promise<ArrayBuffer> {
    const cache = await caches.open(CACHE_NAME);
    if (!bypassCache) {
      const cached = await cache.match(url);
      if (cached) {
        return cached.arrayBuffer();
      }
    }
    const response = await fetch(url, { redirect: 'follow', cache: 'no-store' });
    if (!response.ok) {
      throw new Error($localize`:@@error.fetchFailed:Неуспешно зареждане на данни (${url}).`);
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
