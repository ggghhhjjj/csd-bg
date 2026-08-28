import { Component, computed, inject } from '@angular/core';

import { VectorsStore } from '../core/data/vectors.store';
import { LocaleService } from '../core/i18n/locale.service';

@Component({
  selector: 'app-vectors-fetch-dialog',
  templateUrl: './vectors-fetch-dialog.html',
  styleUrl: './vectors-fetch-dialog.css',
})
export class VectorsFetchDialog {
  protected readonly store = inject(VectorsStore);
  protected readonly i18n = inject(LocaleService);

  protected readonly errorMessage = computed(() => {
    const error = this.store.lastFetchError();
    if (!error) {
      return this.i18n.text('vectorsFetch.dialogBody');
    }
    return this.i18n.text(error.key, error.params);
  });

  protected retry(): void {
    this.store.retryFetch();
  }

  protected continueWithOldData(): void {
    this.store.continueWithOldData();
  }
}
