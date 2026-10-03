/** Day-over-day window: prior report row → selected report row on the global date axis. */
export function priorReportDayRange(
  dates: string[],
  selectedIso: string,
): { from: string; to: string } | null {
  const toIndex = dates.indexOf(selectedIso);
  if (toIndex <= 0) {
    return null;
  }
  return { from: dates[toIndex - 1], to: dates[toIndex] };
}
