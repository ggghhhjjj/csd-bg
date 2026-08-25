export type RangePreset =
  | 'd5'
  | 'd10'
  | 'm1'
  | 'm3'
  | 'm6'
  | 'ytd'
  | 'y1'
  | 'y3'
  | 'y5'
  | 'max';

export function addCalendarMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return date.toISOString().slice(0, 10);
}

export function rangeStartIso(dates: string[], preset: RangePreset): string {
  if (dates.length === 0) {
    return '';
  }
  const last = dates[dates.length - 1];
  if (preset === 'max') {
    return dates[0];
  }
  if (preset === 'd5') {
    return dates[Math.max(0, dates.length - 5)];
  }
  if (preset === 'd10') {
    return dates[Math.max(0, dates.length - 10)];
  }
  let start: string;
  if (preset === 'm1') {
    start = addCalendarMonths(last, -1);
  } else if (preset === 'm3') {
    start = addCalendarMonths(last, -3);
  } else if (preset === 'm6') {
    start = addCalendarMonths(last, -6);
  } else if (preset === 'ytd') {
    start = `${last.slice(0, 4)}-01-01`;
  } else if (preset === 'y1') {
    start = addCalendarMonths(last, -12);
  } else if (preset === 'y3') {
    start = addCalendarMonths(last, -36);
  } else {
    start = addCalendarMonths(last, -60);
  }
  const found = dates.find((date) => date >= start);
  return found ?? dates[0];
}

export function indexForDate(dates: string[], iso: string): number {
  let low = 0;
  let high = dates.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (dates[mid] < iso) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return Math.min(dates.length - 1, Math.max(0, low));
}
