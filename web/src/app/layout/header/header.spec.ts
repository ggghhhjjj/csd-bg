import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { AppConfigService } from '../../core/app/app-config.service';
import { VectorsStore } from '../../core/data/vectors.store';
import { IntroService } from '../../core/intro/intro.service';
import { LocaleService, LOCALE_STORAGE_KEY } from '../../core/i18n/locale.service';
import { formatCachedOnLabel, Header } from './header';

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

  it('help is in the overflow menu and opens the intro dialog', async () => {
    const openFromMenu = vi.fn();
    await configureHeader({ openFromMenu });

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    const i18n = TestBed.inject(LocaleService);
    findMenuButton(fixture.nativeElement, i18n).click();
    fixture.detectChanges();

    const helpLabel = i18n.text('header.help');
    const help = [...fixture.nativeElement.querySelectorAll('[role="menuitem"]')].find((button) =>
      button.textContent?.includes(helpLabel),
    ) as HTMLButtonElement | undefined;
    expect(help).toBeTruthy();
    help?.click();
    expect(openFromMenu).toHaveBeenCalledOnce();
  });

  it('refresh data is in the overflow menu and calls VectorsStore.runUpdateTransaction', async () => {
    const runUpdateTransaction = vi.fn();
    await configureHeader({ runUpdateTransaction, fetchPhase: signal('idle') });

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    const i18n = TestBed.inject(LocaleService);
    const refreshDataLabel = i18n.text('header.refreshData');
    const topLevel = [...fixture.nativeElement.querySelectorAll('.header__actions > button')] as HTMLButtonElement[];
    expect(topLevel.some((button) => button.textContent?.includes(refreshDataLabel))).toBe(false);

    findMenuButton(fixture.nativeElement, i18n).click();
    fixture.detectChanges();

    const refreshData = [...fixture.nativeElement.querySelectorAll('[role="menuitem"]')].find((button) =>
      button.textContent?.includes(refreshDataLabel),
    ) as HTMLButtonElement | undefined;
    expect(refreshData).toBeTruthy();
    refreshData?.click();
    expect(runUpdateTransaction).toHaveBeenCalledOnce();
    expect(runUpdateTransaction).toHaveBeenCalledWith({ invalidateCache: true });
  });

  it('upgrade application is in the overflow menu and calls VectorsStore.reloadApp', async () => {
    const reloadApp = vi.fn();
    await configureHeader({ reloadApp, fetchPhase: signal('idle') });

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    const i18n = TestBed.inject(LocaleService);
    findMenuButton(fixture.nativeElement, i18n).click();
    fixture.detectChanges();

    const upgradeLabel = i18n.text('header.upgradeApp');
    const upgrade = [...fixture.nativeElement.querySelectorAll('[role="menuitem"]')].find((button) =>
      button.textContent?.includes(upgradeLabel),
    ) as HTMLButtonElement | undefined;
    expect(upgrade).toBeTruthy();
    upgrade?.click();
    expect(reloadApp).toHaveBeenCalledOnce();
  });

  it('disables menu actions while a vector transaction is active', async () => {
    await configureHeader({ fetchPhase: signal('processing') });

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    const i18n = TestBed.inject(LocaleService);
    findMenuButton(fixture.nativeElement, i18n).click();
    fixture.detectChanges();

    const menuItems = [...fixture.nativeElement.querySelectorAll('[role="menuitem"]')] as HTMLButtonElement[];
    const refreshData = menuItems.find((button) => button.textContent?.includes(i18n.text('header.refreshData')));
    const upgradeApp = menuItems.find((button) => button.textContent?.includes(i18n.text('header.upgradeApp')));
    expect(refreshData?.disabled).toBe(true);
    expect(upgradeApp?.disabled).toBe(true);
  });

  it('shows a home icon on the issuer view that navigates to the list', async () => {
    await configureHeader();

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');
    await router.navigateByUrl('/issuer/BG1100000001');

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    const i18n = TestBed.inject(LocaleService);
    const home = findLabeledButton(fixture.nativeElement, i18n.text('header.home'));
    expect(home.querySelector('svg')).toBeTruthy();
    home.click();
    expect(navigateSpy).toHaveBeenCalledWith('/');
  });

  it('renders a labeled share icon button', async () => {
    await configureHeader();

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    const i18n = TestBed.inject(LocaleService);
    const share = findShareButton(fixture.nativeElement, i18n);
    expect(share.querySelector('svg')).toBeTruthy();
    expect(share.textContent?.trim()).toBe('');
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
    const share = findShareButton(fixture.nativeElement, i18n);
    share.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(share.getAttribute('aria-label')).toBe(i18n.text('header.share'));
    expect(fixture.nativeElement.querySelector('[aria-live="polite"]')?.textContent).toContain(
      i18n.text('header.shareCopied'),
    );
  });

  it('shows a compact cache date under the title', async () => {
    await configureHeader({ cachedOn: signal('2026-08-19') });

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    const i18n = TestBed.inject(LocaleService);
    const label = formatCachedOnLabel('2026-08-19', i18n.locale());
    const subtitle = fixture.nativeElement.querySelector('.header__cached-on') as HTMLElement | null;
    expect(subtitle).toBeTruthy();
    expect(subtitle?.textContent?.trim()).toBe(label);
    expect(label).not.toMatch(/2026/);
    expect(subtitle?.getAttribute('aria-label')).toBe(i18n.text('header.cachedOn', { date: label }));
  });

  it('shows the application version next to the cache date', async () => {
    await configureHeader({ cachedOn: signal('2026-08-19'), appVersion: signal(42) });

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    const i18n = TestBed.inject(LocaleService);
    const version = fixture.nativeElement.querySelector('.header__app-version') as HTMLElement | null;
    expect(version?.textContent?.trim()).toBe('v42');
    expect(version?.getAttribute('aria-label')).toBe(i18n.text('header.appVersion', { version: 'v42' }));
    expect(fixture.nativeElement.querySelector('.header__meta-separator')?.textContent?.trim()).toBe('·');
  });

  it('hides the application version when config is not loaded', async () => {
    await configureHeader({ appVersion: signal(null) });

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.header__app-version')).toBeNull();
  });

  it('hides the cache date when VectorsStore has not loaded', async () => {
    await configureHeader({ cachedOn: signal(null) });

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.header__cached-on')).toBeNull();
  });

  it('shows the fetch indicator while a transaction is active', async () => {
    await configureHeader({ fetchPhase: signal('processing') });

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    const indicator = fixture.nativeElement.querySelector('.header__fetch-indicator--processing');
    expect(indicator).toBeTruthy();
  });

  it('hides the fetch indicator when idle', async () => {
    await configureHeader({ fetchPhase: signal('idle') });

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.header__fetch-indicator')).toBeNull();
  });

  it('shows countdown text in the fetch indicator', async () => {
    await configureHeader({ fetchPhase: signal('countdown'), countdownSec: signal(3) });

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    const indicator = fixture.nativeElement.querySelector('.header__fetch-indicator--countdown') as HTMLElement | null;
    expect(indicator?.textContent).toContain('3');
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
  store: {
    runUpdateTransaction?: (options?: { invalidateCache?: boolean }) => void;
    reloadApp?: () => void;
    fetchPhase?: ReturnType<typeof signal<string>>;
    countdownSec?: ReturnType<typeof signal<number | null>>;
    cachedOn?: ReturnType<typeof signal<string | null>>;
    appVersion?: ReturnType<typeof signal<number | null>>;
    openFromMenu?: (locale: string) => void;
  } = {},
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
          runUpdateTransaction: store.runUpdateTransaction ?? vi.fn(),
          reloadApp: store.reloadApp ?? vi.fn(),
          fetchPhase: store.fetchPhase ?? signal('idle'),
          countdownSec: store.countdownSec ?? signal<number | null>(null),
          cachedOn: store.cachedOn ?? signal(null),
          dataset: signal({ issuers }),
          issuerIndexByIsin: (isin: string) => issuers.findIndex((issuer) => issuer.isin === isin),
        },
      },
      {
        provide: AppConfigService,
        useValue: {
          version: store.appVersion ?? signal(null),
        },
      },
      {
        provide: IntroService,
        useValue: {
          openFromMenu: store.openFromMenu ?? vi.fn(),
        },
      },
    ],
  }).compileComponents();
}

function findShareButton(root: HTMLElement, i18n: LocaleService): HTMLButtonElement {
  return findLabeledButton(root, i18n.text('header.share'));
}

function findMenuButton(root: HTMLElement, i18n: LocaleService): HTMLButtonElement {
  return findLabeledButton(root, i18n.text('header.menu'));
}

function findLabeledButton(root: HTMLElement, label: string): HTMLButtonElement {
  const buttons = [...root.querySelectorAll('button')] as HTMLButtonElement[];
  const match = buttons.find((button) => button.getAttribute('aria-label') === label);
  expect(match).toBeTruthy();
  return match!;
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
