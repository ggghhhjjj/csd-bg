import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { CordovaService } from './cordova.service';
import { VectorsStore } from './core/data/vectors.store';
import { LocaleService } from './core/i18n/locale.service';
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
  protected readonly i18n = inject(LocaleService);

  ngOnInit(): void {
    this.cordova.deviceReady$.subscribe(() => {
      void this.store.load();
    });
  }
}
