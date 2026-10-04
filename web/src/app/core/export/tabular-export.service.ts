import { Injectable, signal } from '@angular/core';

import { tabularToCsv, tabularToMarkdown } from './tabular-export';
import type { TabularExportData } from './tabular-export.types';

const COPIED_MS = 2000;

@Injectable({ providedIn: 'root' })
export class TabularExportService {
  readonly copied = signal(false);

  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  async copyCsv(data: TabularExportData): Promise<void> {
    await this.copyToClipboard(tabularToCsv(data));
  }

  async copyMarkdown(data: TabularExportData): Promise<void> {
    await this.copyToClipboard(tabularToMarkdown(data));
  }

  formatCsv(data: TabularExportData): string {
    return tabularToCsv(data);
  }

  formatMarkdown(data: TabularExportData): string {
    return tabularToMarkdown(data);
  }

  private async copyToClipboard(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    this.copied.set(true);
    if (this.copiedTimer) {
      clearTimeout(this.copiedTimer);
    }
    this.copiedTimer = setTimeout(() => {
      this.copied.set(false);
      this.copiedTimer = null;
    }, COPIED_MS);
  }
}
