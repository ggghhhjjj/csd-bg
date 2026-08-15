import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { CordovaService } from './cordova.service';
import { VectorsStore } from './core/data/vectors.store';
import { Header } from './layout/header/header';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly cordova = inject(CordovaService);
  protected readonly store = inject(VectorsStore);
  protected readonly loadingLabel = $localize`:@@status.loading:Зареждане на данни…`;

  ngOnInit(): void {
    this.cordova.deviceReady$.subscribe(() => {
      void this.store.load();
    });
  }
}
