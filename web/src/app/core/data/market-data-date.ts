import { localIsoDate } from './vectors.store';

/** Highlight header date when local today is at least this many calendar days after the latest report. */
export const MARKET_DATA_STALE_DAYS = 2;

export function latestMarketDataIso(dates: readonly string[]): string | null {
  if (dates.length === 0) {
    return null;
  }
  return dates[dates.length - 1] ?? null;
}

function parseLocalIso(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Calendar-day difference from `fromIso` to `toIso` in the local timezone (both `YYYY-MM-DD`). */
export function calendarDaysBetween(fromIso: string, toIso: string): number {
  const from = parseLocalIso(fromIso);
  const to = parseLocalIso(toIso);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function isMarketDataStale(latestIso: string, todayIso = localIsoDate()): boolean {
  return calendarDaysBetween(latestIso, todayIso) >= MARKET_DATA_STALE_DAYS;
}
