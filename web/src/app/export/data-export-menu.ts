import { Component, HostListener, inject, input, signal } from '@angular/core';

import { TabularExportService } from '../core/export/tabular-export.service';
import type { TabularExportData } from '../core/export/tabular-export.types';
import { LocaleService } from '../core/i18n/locale.service';

@Component({
  selector: 'app-data-export-menu',
  templateUrl: './data-export-menu.html',
  styleUrl: './data-export-menu.css',
})
export class DataExportMenu {
  /** Resolved at export time so callers can supply fresh tabular data on each action. */
  readonly resolveData = input.required<() => TabularExportData>();
  readonly disabled = input(false);

  protected readonly i18n = inject(LocaleService);
  protected readonly exportService = inject(TabularExportService);
  protected readonly menuOpen = signal(false);

  protected toggleMenu(event: Event): void {
    event.stopPropagation();
    if (this.disabled()) {
      return;
    }
    this.menuOpen.update((open) => !open);
  }

  protected async exportCsv(): Promise<void> {
    this.menuOpen.set(false);
    await this.exportService.copyCsv(this.resolveData()());
  }

  protected async exportMarkdown(): Promise<void> {
    this.menuOpen.set(false);
    await this.exportService.copyMarkdown(this.resolveData()());
  }

  @HostListener('document:click')
  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected closeMenuOnEscape(): void {
    this.menuOpen.set(false);
  }
}
