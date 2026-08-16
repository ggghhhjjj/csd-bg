import { Component, computed, inject } from '@angular/core';
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

  protected readonly issuers = computed(() => this.store.dataset()?.issuers ?? []);
}
