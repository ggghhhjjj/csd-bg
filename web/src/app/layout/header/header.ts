import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';

import { VectorsStore } from '../../core/data/vectors.store';
import { detectLocale } from '../../core/i18n/locale-url';

@Component({
  selector: 'app-header',
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  protected readonly store = inject(VectorsStore);

  protected readonly titleLabel = $localize`:@@header.title:Свободен флот`;
  protected readonly backLabel = $localize`:@@header.back:Назад`;
  protected readonly refreshLabel = $localize`:@@header.refresh:Опресни`;
  protected readonly localeLabel = $localize`:@@header.locale:EN`;

  protected readonly showBack = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => this.isDetailUrl(event.urlAfterRedirects)),
      startWith(this.isDetailUrl(this.router.url)),
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
    const current = detectLocale(
      document.documentElement.lang,
      localStorage.getItem('csd-locale'),
    );
    const next = current === 'bg' ? 'en' : 'bg';
    localStorage.setItem('csd-locale', next);
    window.location.reload();
  }

  protected refresh(): void {
    void this.store.refresh();
  }

  private isDetailUrl(url: string): boolean {
    return url.includes('/issuer/');
  }
}
