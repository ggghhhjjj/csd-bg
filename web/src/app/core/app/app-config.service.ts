import { Injectable, signal } from '@angular/core';

import { LocalizedError } from '../i18n/translations';
import { isAppConfig, type AppConfig } from './app.types';

const CONFIG_URL = 'assets/app.config.json';

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  readonly version = signal<number | null>(null);

  async initialize(): Promise<void> {
    const config = await this.readConfig();
    this.version.set(config.version);
  }

  private async readConfig(): Promise<AppConfig> {
    const response = await fetch(CONFIG_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new LocalizedError('error.appConfigMissing');
    }
    const payload: unknown = await response.json();
    if (!isAppConfig(payload)) {
      throw new LocalizedError('error.appConfigInvalid');
    }
    return payload;
  }
}
