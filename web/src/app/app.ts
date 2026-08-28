import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { CordovaService } from './cordova.service';
import { VectorsStore } from './core/data/vectors.store';
import { IntroService } from './core/intro/intro.service';
import { LocaleService } from './core/i18n/locale.service';
import { IntroDialog } from './intro/intro-dialog';
import { Header } from './layout/header/header';
import { VectorsFetchDialog } from './vectors-fetch/vectors-fetch-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, IntroDialog, VectorsFetchDialog],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly cordova = inject(CordovaService);
  private readonly intro = inject(IntroService);
  private readonly store = inject(VectorsStore);
  private readonly i18n = inject(LocaleService);

  ngOnInit(): void {
    this.cordova.deviceReady$.subscribe(() => {
      void this.store.load();
      void this.intro.initialize(this.i18n.locale()).catch(() => {
        // Intro is optional; missing config must not block the app.
      });
    });
  }
}
