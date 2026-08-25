/** Reads the highlighted category index from an ECharts showTip / updateAxisPointer payload. */
export function axisIndexFromChartEvent(params: unknown, dates: string[]): number | null {
  if (Array.isArray(params)) {
    return axisIndexFromChartEvent(params[0], dates);
  }
  if (!params || typeof params !== 'object') {
    return null;
  }
  const payload = params as {
    dataIndex?: unknown;
    name?: unknown;
    value?: unknown;
    axesInfo?: Array<{ axisDim?: unknown; value?: unknown }>;
  };
  if (typeof payload.dataIndex === 'number' && Number.isInteger(payload.dataIndex)) {
    if (payload.dataIndex >= 0 && payload.dataIndex < dates.length) {
      return payload.dataIndex;
    }
  }
  const named = indexFromDateValue(payload.name, dates);
  if (named !== null) {
    return named;
  }
  const xAxis = payload.axesInfo?.find((axis) => axis.axisDim === 'x' || axis.axisDim === 'xAxis');
  const fromAxis = indexFromDateValue(xAxis?.value ?? payload.value, dates);
  if (fromAxis !== null) {
    return fromAxis;
  }
  return null;
}

function indexFromDateValue(value: unknown, dates: string[]): number | null {
  if (typeof value === 'string') {
    const found = dates.indexOf(value);
    return found >= 0 ? found : null;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < dates.length) {
    return value;
  }
  return null;
}
