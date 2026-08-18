import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { VectorsStore } from '../../core/data/vectors.store';
import { LocaleService, LOCALE_STORAGE_KEY } from '../../core/i18n/locale.service';
import { Header } from './header';

@Component({ template: '', standalone: true })
class DummyPage {}

const SOPHARMA = { id: 1, isin: 'BG1100000001', name: 'Sopharma AD' };

describe('Header', () => {
  const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

  beforeEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    document.documentElement.lang = 'bg';
  });

  afterEach(() => {
    restoreDescriptor(navigator, 'share', originalShare);
    restoreDescriptor(navigator, 'clipboard', originalClipboard);
    TestBed.resetTestingModule();
  });

  it('refresh calls VectorsStore.reloadApp', async () => {
    const reloadApp = vi.fn();
    await configureHeader({ reloadApp, loading: signal(false) });

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    const label = TestBed.inject(LocaleService).text('header.refresh');
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    const refresh = buttons.find((button) => button.textContent?.includes(label));
    expect(refresh).toBeTruthy();
    refresh?.click();
    expect(reloadApp).toHaveBeenCalledOnce();
  });

  it('renders a labeled share button', async () => {
    await configureHeader();

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    const i18n = TestBed.inject(LocaleService);
    const share = findShareButton(fixture.nativeElement, i18n);
    expect(share.textContent).toContain(i18n.text('header.share'));
  });

  it('shares the issuer view via navigator.share', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigatorFunction('share', share);
    await configureHeader();

    const router = TestBed.inject(Router);
    await router.navigateByUrl('/issuer/BG1100000001');

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    findShareButton(fixture.nativeElement, TestBed.inject(LocaleService)).click();
    await fixture.whenStable();

    expect(share).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledWith({
      title: 'Sopharma AD · Свободен флот',
      text: 'Sopharma AD (BG1100000001)',
      url: window.location.href,
    });
  });

  it('copies the URL when navigator.share is missing', async () => {
    stubNavigatorFunction('share', undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    await configureHeader();

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    const i18n = TestBed.inject(LocaleService);
    findShareButton(fixture.nativeElement, i18n).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(findShareButton(fixture.nativeElement, i18n).textContent).toContain(i18n.text('header.shareCopied'));
  });

  it('does not copy when the user cancels the share sheet', async () => {
    const abort = new Error('Share canceled');
    abort.name = 'AbortError';
    const share = vi.fn().mockRejectedValue(abort);
    stubNavigatorFunction('share', share);
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    await configureHeader();

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    findShareButton(fixture.nativeElement, TestBed.inject(LocaleService)).click();
    await fixture.whenStable();

    expect(share).toHaveBeenCalledOnce();
    expect(writeText).not.toHaveBeenCalled();
  });
});

async function configureHeader(
  store: { reloadApp?: () => void; loading?: ReturnType<typeof signal<boolean>> } = {},
): Promise<void> {
  const issuers = [SOPHARMA];
  await TestBed.configureTestingModule({
    imports: [Header],
    providers: [
      provideRouter([
        { path: '', component: DummyPage },
        { path: 'issuer/:isin', component: DummyPage },
      ]),
      {
        provide: VectorsStore,
        useValue: {
          reloadApp: store.reloadApp ?? vi.fn(),
          loading: store.loading ?? signal(false),
          dataset: signal({ issuers }),
          issuerIndexByIsin: (isin: string) => issuers.findIndex((issuer) => issuer.isin === isin),
        },
      },
    ],
  }).compileComponents();
}

function findShareButton(root: HTMLElement, i18n: LocaleService): HTMLButtonElement {
  const label = i18n.text('header.share');
  const buttons = [...root.querySelectorAll('button')] as HTMLButtonElement[];
  const share = buttons.find((button) => button.getAttribute('aria-label') === label);
  expect(share).toBeTruthy();
  return share!;
}

function stubNavigatorFunction(name: 'share', value: ((data?: ShareData) => Promise<void>) | undefined): void {
  Object.defineProperty(navigator, name, {
    configurable: true,
    writable: true,
    value,
  });
}

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: { writeText },
  });
}

function restoreDescriptor(target: object, name: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(target, name, descriptor);
    return;
  }
  Reflect.deleteProperty(target, name);
}
