import { Component, HostListener, computed, effect, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { HelpService } from '../core/help/help.service';
import { LocaleService } from '../core/i18n/locale.service';

@Component({
  selector: 'app-help-dialog',
  templateUrl: './help-dialog.html',
  styleUrl: './help-dialog.css',
})
export class HelpDialog {
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly help = inject(HelpService);
  protected readonly i18n = inject(LocaleService);

  protected readonly frameSrc = computed(() => {
    const url = this.help.entryUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  constructor() {
    effect(() => {
      const locale = this.i18n.locale();
      if (this.help.open()) {
        this.help.refreshEntryUrlForLocale(locale);
      }
    });
  }

  protected close(): void {
    this.help.close();
  }

  @HostListener('document:keydown.escape')
  protected closeOnEscape(): void {
    if (this.help.open()) {
      this.close();
    }
  }
}
