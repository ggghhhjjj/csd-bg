import { Component, HostListener, computed, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { LocaleService } from '../core/i18n/locale.service';
import { IntroService } from '../core/intro/intro.service';

@Component({
  selector: 'app-intro-dialog',
  templateUrl: './intro-dialog.html',
  styleUrl: './intro-dialog.css',
})
export class IntroDialog {
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly intro = inject(IntroService);
  protected readonly i18n = inject(LocaleService);

  protected readonly frameSrc = computed(() => {
    const url = this.intro.entryUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  protected close(): void {
    this.intro.dismiss();
  }

  @HostListener('document:keydown.escape')
  protected closeOnEscape(): void {
    if (this.intro.open()) {
      this.close();
    }
  }
}
