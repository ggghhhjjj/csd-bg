export type AppLocale = 'bg' | 'en';

export function localeFromPath(pathname: string): AppLocale | null {
  const hit = pathname.split('/').find((part) => part === 'bg' || part === 'en');
  return hit === 'bg' || hit === 'en' ? hit : null;
}

export function detectLocale(pathname: string, htmlLang: string, stored: string | null): AppLocale {
  const fromPath = localeFromPath(pathname);
  if (fromPath) {
    return fromPath;
  }
  if (stored === 'en' || stored === 'bg') {
    return stored;
  }
  return htmlLang === 'en' ? 'en' : 'bg';
}

export function urlForLocale(href: string, next: AppLocale): string {
  const url = new URL(href);
  const parts = url.pathname.split('/');
  const idx = parts.findIndex((part) => part === 'bg' || part === 'en');
  if (idx >= 0) {
    parts[idx] = next;
    url.pathname = parts.join('/');
    if (!url.pathname.endsWith('/') && !parts[parts.length - 1]?.includes('.')) {
      url.pathname += '/';
    }
    return url.toString();
  }
  const base = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  url.pathname = `${base}${next}/`;
  return url.toString();
}

export function shouldReloadForRuntimeI18n(currentHref: string, nextHref: string): boolean {
  const currentPath = new URL(currentHref).pathname;
  const nextPath = new URL(nextHref).pathname;
  return localeFromPath(currentPath) === null || currentPath === nextPath;
}
