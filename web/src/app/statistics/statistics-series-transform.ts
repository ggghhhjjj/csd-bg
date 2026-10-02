export type BaselineStrategy = 'min' | 'first';

export type SeriesTransformMode = 'baseline' | 'difference' | 'zscore' | 'absolute';

export type ChartSeriesPoint = {
  value: number | null;
  raw: number;
};

function finiteValuesInWindow(values: number[], startIndex: number, endIndex: number): number[] {
  const out: number[] = [];
  const from = Math.max(0, startIndex);
  const to = Math.min(values.length - 1, endIndex);
  for (let i = from; i <= to; i += 1) {
    const v = values[i];
    if (Number.isFinite(v)) {
      out.push(v);
    }
  }
  return out;
}

export function baselineSubtract(
  values: number[],
  startIndex: number,
  endIndex: number,
  strategy: BaselineStrategy = 'min',
): { display: number[]; baseline: number } {
  const windowValues = finiteValuesInWindow(values, startIndex, endIndex);
  if (windowValues.length === 0) {
    return { display: values.map(() => 0), baseline: 0 };
  }
  const baseline =
    strategy === 'first'
      ? windowValues[0]
      : Math.min(...windowValues);
  return {
    baseline,
    display: values.map((v) => (Number.isFinite(v) ? v - baseline : 0)),
  };
}

export function firstDifference(values: number[]): (number | null)[] {
  const display: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i === 0) {
      display.push(null);
      continue;
    }
    const today = values[i];
    const prev = values[i - 1];
    if (!Number.isFinite(today) || !Number.isFinite(prev)) {
      display.push(null);
      continue;
    }
    display.push(today - prev);
  }
  return display;
}

export function zScore(
  values: number[],
  startIndex: number,
  endIndex: number,
): { display: number[]; mean: number; std: number } {
  const windowValues = finiteValuesInWindow(values, startIndex, endIndex);
  if (windowValues.length === 0) {
    return { display: values.map(() => 0), mean: 0, std: 0 };
  }
  const mean = windowValues.reduce((a, b) => a + b, 0) / windowValues.length;
  const variance =
    windowValues.reduce((acc, v) => acc + (v - mean) ** 2, 0) / windowValues.length;
  const std = Math.sqrt(variance);
  if (std === 0) {
    return { display: values.map(() => 0), mean, std: 0 };
  }
  return {
    mean,
    std,
    display: values.map((v) => (Number.isFinite(v) ? (v - mean) / std : 0)),
  };
}

export function transformSeriesForChart(
  rawValues: number[],
  mode: SeriesTransformMode,
  windowStartIndex: number,
  windowEndIndex: number,
): { points: ChartSeriesPoint[]; baseline?: number; mean?: number; std?: number } {
  if (mode === 'absolute') {
    return {
      points: rawValues.map((raw) => ({ value: raw, raw })),
    };
  }
  if (mode === 'baseline') {
    const { display, baseline } = baselineSubtract(rawValues, windowStartIndex, windowEndIndex, 'min');
    return {
      baseline,
      points: rawValues.map((raw, i) => ({
        value: Number.isFinite(raw) ? display[i] : null,
        raw,
      })),
    };
  }
  if (mode === 'difference') {
    const display = firstDifference(rawValues);
    return {
      points: rawValues.map((raw, i) => ({
        value: display[i],
        raw,
      })),
    };
  }
  const { display, mean, std } = zScore(rawValues, windowStartIndex, windowEndIndex);
  return {
    mean,
    std,
    points: rawValues.map((raw, i) => ({
      value: Number.isFinite(raw) ? display[i] : null,
      raw,
    })),
  };
}

export function visibleIndexRange(dates: string[], viewStart: string, viewEnd: string): {
  startIndex: number;
  endIndex: number;
} {
  if (dates.length === 0) {
    return { startIndex: 0, endIndex: 0 };
  }
  let startIndex = dates.indexOf(viewStart);
  let endIndex = dates.indexOf(viewEnd);
  if (startIndex < 0) {
    startIndex = 0;
  }
  if (endIndex < 0) {
    endIndex = dates.length - 1;
  }
  if (startIndex > endIndex) {
    [startIndex, endIndex] = [endIndex, startIndex];
  }
  return { startIndex, endIndex };
}
