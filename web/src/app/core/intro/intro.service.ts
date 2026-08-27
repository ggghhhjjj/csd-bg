import { Injectable, signal } from '@angular/core';

import type { AppLocale } from '../i18n/locale-url';
import { LocalizedError } from '../i18n/translations';
import { buildIntroEntryUrl, isIntroConfig, type IntroConfig } from './intro.types';

export const INTRO_SEEN_VERSION_KEY = 'csd-intro-seen-version';
const CONFIG_URL = 'assets/intro.config.json';

@Injectable({ providedIn: 'root' })
export class IntroService {
  readonly open = signal(false);
  readonly entryUrl = signal<string | null>(null);

  private config: IntroConfig | null = null;
  private manualOpen = false;

  async initialize(locale: AppLocale): Promise<void> {
    this.config = await this.readConfig();
    if (this.shouldAutoShow(this.config)) {
      this.show(this.config, locale);
    }
  }

  shouldAutoShow(config: IntroConfig): boolean {
    const seen = localStorage.getItem(INTRO_SEEN_VERSION_KEY);
    return seen !== config.contentVersion;
  }

  async openFromMenu(locale: AppLocale): Promise<void> {
    this.config ??= await this.readConfig();
    this.manualOpen = true;
    this.show(this.config, locale);
  }

  close(): void {
    this.open.set(false);
    this.manualOpen = false;
    if (this.config) {
      localStorage.setItem(INTRO_SEEN_VERSION_KEY, this.config.contentVersion);
    }
  }

  dismiss(): void {
    this.close();
  }

  isManualOpen(): boolean {
    return this.manualOpen;
  }

  currentConfig(): IntroConfig | null {
    return this.config;
  }

  private show(config: IntroConfig, locale: AppLocale): void {
    this.entryUrl.set(buildIntroEntryUrl(config, locale));
    this.open.set(true);
  }

  private async readConfig(): Promise<IntroConfig> {
    const response = await fetch(CONFIG_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new LocalizedError('error.introConfigMissing');
    }
    const payload: unknown = await response.json();
    if (!isIntroConfig(payload)) {
      throw new LocalizedError('error.introConfigInvalid');
    }
    return payload;
  }
}
