import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { VectorsStore } from '../core/data/vectors.store';

@Component({
  selector: 'app-issuer-list',
  imports: [RouterLink],
  templateUrl: './issuer-list.html',
  styleUrl: './issuer-list.css',
})
export class IssuerList {
  private readonly store = inject(VectorsStore);

  protected readonly heading = $localize`:@@issuers.heading:Емитенти`;
  protected readonly issuers = computed(() => this.store.dataset()?.issuers ?? []);
}
