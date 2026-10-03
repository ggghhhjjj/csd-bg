export type NiceAxisBoundsOptions = {
  paddingRatio?: number;
  targetTicks?: number;
};

export type NiceAxisBounds = {
  min: number;
  max: number;
};

function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  let niceNormalized: number;
  if (normalized <= 1) {
    niceNormalized = 1;
  } else if (normalized <= 2) {
    niceNormalized = 2;
  } else if (normalized <= 5) {
    niceNormalized = 5;
  } else {
    niceNormalized = 10;
  }
  return niceNormalized * magnitude;
}

/**
 * Padded min/max for a value axis from data extent, with 1–2–5–10 tick steps.
 */
export function niceAxisBounds(
  dataMin: number,
  dataMax: number,
  options: NiceAxisBoundsOptions = {},
): NiceAxisBounds | null {
  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
    return null;
  }

  const paddingRatio = options.paddingRatio ?? 0.05;
  const targetTicks = options.targetTicks ?? 5;

  let span = dataMax - dataMin;
  if (span === 0) {
    span = Math.max(Math.abs(dataMin) * 0.02, 1);
  }

  const paddedMin = dataMin - paddingRatio * span;
  const paddedMax = dataMax + paddingRatio * span;
  const paddedRange = paddedMax - paddedMin;
  const step = niceStep(paddedRange / targetTicks);

  let axisMin = Math.floor(paddedMin / step) * step;
  let axisMax = Math.ceil(paddedMax / step) * step;

  if (step >= 1) {
    axisMin = Math.round(axisMin);
    axisMax = Math.round(axisMax);
  }

  if (axisMin >= axisMax) {
    axisMax = axisMin + step;
  }

  return { min: axisMin, max: axisMax };
}

export function finiteMinMaxInWindow(
  values: Array<number | null>,
  startIndex: number,
  endIndex: number,
): { min: number; max: number } | null {
  const from = Math.max(0, startIndex);
  const to = Math.min(values.length - 1, endIndex);
  let min = Infinity;
  let max = -Infinity;
  for (let i = from; i <= to; i += 1) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) {
      continue;
    }
    if (v < min) {
      min = v;
    }
    if (v > max) {
      max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }
  return { min, max };
}
