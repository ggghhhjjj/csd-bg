import { describe, expect, it } from 'vitest';

import {
  calendarDaysBetween,
  isMarketDataStale,
  latestMarketDataIso,
  MARKET_DATA_STALE_DAYS,
} from './market-data-date';

describe('market-data-date', () => {
  it('uses the last sorted report date', () => {
    expect(latestMarketDataIso(['2026-01-01', '2026-01-03'])).toBe('2026-01-03');
    expect(latestMarketDataIso([])).toBeNull();
  });

  it('treats data as stale when today is two or more calendar days after the latest report', () => {
    expect(calendarDaysBetween('2026-10-09', '2026-10-10')).toBe(1);
    expect(isMarketDataStale('2026-10-09', '2026-10-10')).toBe(false);
    expect(isMarketDataStale('2026-10-09', '2026-10-11')).toBe(true);
    expect(MARKET_DATA_STALE_DAYS).toBe(2);
  });
});
