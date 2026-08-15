import { loadTranslations } from '@angular/localize';

import { detectLocale } from './app/core/i18n/locale-url';
import { EN_TRANSLATIONS } from './locale/en-translations';

const pathname = globalThis.location?.pathname ?? '/';
const stored = globalThis.localStorage?.getItem('csd-locale') ?? null;
const htmlLang = globalThis.document?.documentElement?.lang ?? 'bg';
const locale = detectLocale(pathname, htmlLang, stored);

if (locale === 'en') {
  loadTranslations(EN_TRANSLATIONS);
}

if (globalThis.document?.documentElement) {
  globalThis.document.documentElement.lang = locale;
}
