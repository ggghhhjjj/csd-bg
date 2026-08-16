import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';

import { VectorsStore } from '../../core/data/vectors.store';
import { LocaleService } from '../../core/i18n/locale.service';

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
    this.i18n.toggle();
  }

  protected refresh(): void {
    void this.store.refresh();
  }

  private isDetailUrl(url: string): boolean {
    return url.includes('/issuer/');
  }
}
