import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';

import { VectorsStore } from '../../core/data/vectors.store';
import type { AppLocale } from '../../core/i18n/locale-url';
import { LocaleService } from '../../core/i18n/locale.service';
import { buildSharePayload, isShareAbortError, issuerIsinFromUrl, type ShareIssuer } from './share-payload';

const COPIED_MS = 2000;

export function formatCachedOnLabel(isoDate: string, locale: AppLocale): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const tag = locale === 'bg' ? 'bg-BG' : 'en-GB';
  return new Intl.DateTimeFormat(tag, { day: '2-digit', month: '2-digit' }).format(date);
}

@Component({
  selector: 'app-header',
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private readonly router = inject(Router);
  protected readonly store = inject(VectorsStore);
  protected readonly i18n = inject(LocaleService);

  protected readonly shareCopied = signal(false);
  protected readonly menuOpen = signal(false);
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly cachedOnLabel = computed(() => {
    const iso = this.store.cachedOn();
    if (!iso) {
      return null;
    }
    return formatCachedOnLabel(iso, this.i18n.locale());
  });

  protected readonly cachedOnAria = computed(() => {
    const label = this.cachedOnLabel();
    if (!label) {
      return null;
    }
    return this.i18n.text('header.cachedOn', { date: label });
  });

  protected readonly showHome = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => issuerIsinFromUrl(event.urlAfterRedirects) !== null),
      startWith(issuerIsinFromUrl(this.router.url) !== null),
    ),
    { initialValue: false },
  );

  protected goHome(): void {
    void this.router.navigateByUrl('/');
  }

  protected switchLocale(): void {
    this.i18n.toggle();
  }

  protected toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((open) => !open);
  }

  protected refresh(): void {
    this.menuOpen.set(false);
    void this.store.reloadApp();
  }

  @HostListener('document:click')
  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected closeMenuOnEscape(): void {
    this.menuOpen.set(false);
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
