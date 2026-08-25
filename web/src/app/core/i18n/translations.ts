import type { AppLocale } from './locale-url';

const BG = {
  'error.configMissing': 'Липсва конфигурация за данни.',
  'error.configInvalid': 'Невалидни URL адреси в vectors.config.json.',
  'error.fetchFailed': 'Неуспешно зареждане на данни ({url}).',
  'status.loading': 'Зареждане на данни…',
  'header.title': 'Свободен флот',
  'header.home': 'Начало',
  'header.refresh': 'Опресни',
  'header.locale': 'EN',
  'header.share': 'Сподели',
  'header.shareCopied': 'Копирано',
  'header.menu': 'Меню',
  'header.shareAppText': 'Аналитика за свободен флот (ЦДЦК)',
  'header.shareIssuerText': '{name} ({isin})',
  'header.cachedOn': 'Заредени на {date}',
  'issuers.heading': 'Емитенти',
  'issuers.search': 'Търсене по име или ISIN…',
  'issuers.empty': 'Няма съвпадения.',
  'metric.totalShares': 'Общ брой акции',
  'metric.freeFloat': 'Свободен флот',
  'metric.shareholders': 'Акционери',
  'range.d5': '5 дни',
  'range.d10': '10 дни',
  'range.m1': '1 месец',
  'range.m3': '3 месеца',
  'range.m6': '6 месеца',
  'range.ytd': 'YTD',
  'range.y1': '12 месеца',
  'range.y3': '3 години',
  'range.y5': '5 години',
  'range.max': 'Всички',
  'compare.percent': 'Процент',
  'compare.absolute': 'Абсолютна промяна',
  'compare.close': 'Затвори',
  'table.date': 'Дата',
  'issuer.missing': 'Емитентът не е намерен.',
} as const;

export type TranslationKey = keyof typeof BG;

export const TRANSLATIONS: Record<AppLocale, Record<TranslationKey, string>> = {
  bg: BG,
  en: {
    'error.configMissing': 'Data configuration is missing.',
    'error.configInvalid': 'Invalid URLs in vectors.config.json.',
    'error.fetchFailed': 'Failed to load data ({url}).',
    'status.loading': 'Loading data…',
    'header.title': 'Free Float',
    'header.home': 'Home',
    'header.refresh': 'Refresh',
    'header.locale': 'BG',
    'header.share': 'Share',
    'header.shareCopied': 'Copied',
    'header.menu': 'Menu',
    'header.shareAppText': 'CSD-BG Free Float analytics',
    'header.shareIssuerText': '{name} ({isin})',
    'header.cachedOn': 'Loaded on {date}',
    'issuers.heading': 'Issuers',
    'issuers.search': 'Search by name or ISIN…',
    'issuers.empty': 'No matching issuers.',
    'metric.totalShares': 'Total shares',
    'metric.freeFloat': 'Free float',
    'metric.shareholders': 'Shareholders',
    'range.d5': '5 days',
    'range.d10': '10 days',
    'range.m1': '1 month',
    'range.m3': '3 months',
    'range.m6': '6 months',
    'range.ytd': 'YTD',
    'range.y1': '12 months',
    'range.y3': '3 years',
    'range.y5': '5 years',
    'range.max': 'Max',
    'compare.percent': 'Percent',
    'compare.absolute': 'Absolute change',
    'compare.close': 'Close',
    'table.date': 'Date',
    'issuer.missing': 'Issuer not found.',
  },
};

export class LocalizedError extends Error {
  constructor(
    readonly key: TranslationKey,
    readonly params?: Record<string, string>,
  ) {
    super(key);
    this.name = 'LocalizedError';
  }
}
