import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { VectorsStore } from '../core/data/vectors.store';
import { ChartPanel } from './chart-panel';
import { MetricsTable } from './metrics-table';

@Component({
  selector: 'app-issuer-detail',
  imports: [ChartPanel, MetricsTable],
  templateUrl: './issuer-detail.html',
  styleUrl: './issuer-detail.css',
})
export class IssuerDetail {
  private readonly store = inject(VectorsStore);
  private readonly route = inject(ActivatedRoute);

  private readonly isin = toSignal(this.route.paramMap.pipe(map((params) => params.get('isin') ?? '')), {
    initialValue: '',
  });

  protected readonly missingLabel = $localize`:@@issuer.missing:Емитентът не е намерен.`;

  protected readonly dataset = computed(() => this.store.dataset());
  protected readonly issuerIndex = computed(() => this.store.issuerIndexByIsin(this.isin()));
  protected readonly issuer = computed(() => {
    const dataset = this.dataset();
    const index = this.issuerIndex();
    if (!dataset || index < 0) {
      return null;
    }
    return dataset.issuers[index];
  });
}
