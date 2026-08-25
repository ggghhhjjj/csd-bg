import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CordovaService {
  readonly deviceReady$: Observable<void> = new Observable<void>((observer) => {
    const handler = () => {
      observer.next();
      observer.complete();
    };

    document.addEventListener('deviceready', handler, { once: true });

    if (typeof cordova === 'undefined') {
      queueMicrotask(handler);
    }

    return () => document.removeEventListener('deviceready', handler);
  });

  get platformInfo(): string {
    if (typeof cordova !== 'undefined') {
      return `cordova-${cordova.platformId}@${cordova.version}`;
    }
    return 'browser';
  }
}
