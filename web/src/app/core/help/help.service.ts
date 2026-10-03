import { Injectable, inject, signal } from '@angular/core';

import type { AppLocale } from '../i18n/locale-url';
import { LocaleService } from '../i18n/locale.service';
import { LocalizedError } from '../i18n/translations';
import type { HelpTopicId } from './help-topic-id';
import { buildHelpEntryUrl, isHelpTopicsConfig, type HelpTopicsConfig } from './help.types';

const CONFIG_URL = 'assets/help-topics.json';

@Injectable({ providedIn: 'root' })
export class HelpService {
  readonly open = signal(false);
  readonly activeTopicId = signal<HelpTopicId | null>(null);
  readonly entryUrl = signal<string | null>(null);

  private config: HelpTopicsConfig | null = null;
  private manifestPromise: Promise<void> | null = null;

  private readonly i18n = inject(LocaleService);

  async ensureManifest(): Promise<void> {
    if (this.config) {
      return;
    }
    this.manifestPromise ??= this.loadManifest();
    await this.manifestPromise;
  }

  hasTopic(id: HelpTopicId): boolean {
    return Boolean(this.config?.topics[id]);
  }

  async openTopic(id: HelpTopicId): Promise<void> {
    await this.ensureManifest();
    const entry = this.config?.topics[id];
    if (!entry) {
      return;
    }
    this.activeTopicId.set(id);
    this.entryUrl.set(buildHelpEntryUrl(entry, this.i18n.locale()));
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
    this.activeTopicId.set(null);
    this.entryUrl.set(null);
  }

  refreshEntryUrlForLocale(locale: AppLocale): void {
    const id = this.activeTopicId();
    if (!this.open() || !id || !this.config) {
      return;
    }
    const entry = this.config.topics[id];
    if (!entry) {
      return;
    }
    this.entryUrl.set(buildHelpEntryUrl(entry, locale));
  }

  private async loadManifest(): Promise<void> {
    const response = await fetch(CONFIG_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new LocalizedError('error.helpTopicsMissing');
    }
    const payload: unknown = await response.json();
    if (!isHelpTopicsConfig(payload)) {
      throw new LocalizedError('error.helpTopicsInvalid');
    }
    this.config = payload;
  }
}
