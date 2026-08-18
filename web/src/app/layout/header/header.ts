import { Component, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';

import { VectorsStore } from '../../core/data/vectors.store';
import { LocaleService } from '../../core/i18n/locale.service';
import { buildSharePayload, isShareAbortError, issuerIsinFromUrl, type ShareIssuer } from './share-payload';

const COPIED_MS = 2000;

@Component({
  selector: 'app-header',
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  protected readonly store = inject(VectorsStore);
  protected readonly i18n = inject(LocaleService);

  protected readonly shareCopied = signal(false);
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly showBack = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => issuerIsinFromUrl(event.urlAfterRedirects) !== null),
      startWith(issuerIsinFromUrl(this.router.url) !== null),
    ),
    { initialValue: false },
  );

  protected goBack(): void {
    if (window.history.length > 1) {
      this.location.back();
      return;
    }
    void this.router.navigateByUrl('/');
  }

  protected switchLocale(): void {
    this.i18n.toggle();
  }

  protected refresh(): void {
    void this.store.reloadApp();
  }

  protected async share(): Promise<void> {
    const payload = buildSharePayload(
      window.location.href,
      {
        title: this.i18n.text('header.title'),
        appText: this.i18n.text('header.shareAppText'),
        issuerText: this.i18n.text('header.shareIssuerText'),
      },
      this.currentIssuer(),
    );
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share(payload);
        return;
      }
      await this.copyUrl(payload.url);
    } catch (error) {
      if (isShareAbortError(error)) {
        return;
      }
      await this.copyUrl(payload.url);
    }
  }

  private currentIssuer(): ShareIssuer | null {
    const isin = issuerIsinFromUrl(this.router.url);
    if (!isin) {
      return null;
    }
    const index = this.store.issuerIndexByIsin(isin);
    return { name: this.store.dataset()?.issuers[index]?.name, isin };
  }

  private async copyUrl(url: string): Promise<void> {
    await navigator.clipboard.writeText(url);
    this.shareCopied.set(true);
    if (this.copiedTimer) {
      clearTimeout(this.copiedTimer);
    }
    this.copiedTimer = setTimeout(() => this.shareCopied.set(false), COPIED_MS);
  }
}
