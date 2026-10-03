import { describe, expect, it } from 'vitest';

import { priorReportDayRange } from './prior-report-day-range';

const DATES = ['2024-01-01', '2024-04-01', '2024-07-01'];

describe('priorReportDayRange', () => {
  it('returns the prior report day and selected day', () => {
    expect(priorReportDayRange(DATES, DATES[2])).toEqual({
      from: DATES[1],
      to: DATES[2],
    });
  });

  it('returns null for the first global report day', () => {
    expect(priorReportDayRange(DATES, DATES[0])).toBeNull();
  });

  it('returns null for an unknown ISO date', () => {
    expect(priorReportDayRange(DATES, '2024-12-31')).toBeNull();
  });
});
