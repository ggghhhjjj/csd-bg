import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { VectorsStore } from '../core/data/vectors.store';
import { LocaleService } from '../core/i18n/locale.service';

@Component({
  selector: 'app-issuer-list',
  imports: [RouterLink],
  templateUrl: './issuer-list.html',
  styleUrl: './issuer-list.css',
})
export class IssuerList {
  private readonly store = inject(VectorsStore);
  protected readonly i18n = inject(LocaleService);
  protected readonly query = signal('');

  private readonly allIssuers = computed(() => this.store.dataset()?.issuers ?? []);

  protected readonly issuers = computed(() => {
    const all = this.allIssuers();
    const q = this.query().trim().toLowerCase();
    if (!q) {
      return all;
    }
    return all.filter(
      (issuer) => issuer.name.toLowerCase().includes(q) || issuer.isin.toLowerCase().includes(q),
    );
  });
}
