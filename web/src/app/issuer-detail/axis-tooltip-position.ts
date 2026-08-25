export const AXIS_TOOLTIP_GAP = 8;
export const AXIS_TOOLTIP_HIDE_MS = 2500;

export interface AxisTooltipSize {
  contentSize: number[];
  viewSize: number[];
}

export type AxisTooltipBox = { top: number; left?: number; right?: number };

/** Prefer the right edge; flip to the left when the tap is in the right 40% so the box stays on-screen. */
export function axisTooltipPosition(
  point: number[],
  size: AxisTooltipSize,
  gap = AXIS_TOOLTIP_GAP,
): AxisTooltipBox {
  const px = point[0] ?? 0;
  const py = point[1] ?? 0;
  const tooltipHeight = size.contentSize[1] ?? 0;
  const viewWidth = size.viewSize[0] ?? 0;
  const viewHeight = size.viewSize[1] ?? 0;
  const maxTop = Math.max(gap, viewHeight - tooltipHeight - gap);
  const top = Math.max(gap, Math.min(py - tooltipHeight - gap, maxTop));
  if (px < viewWidth * 0.6) {
    return { top, right: gap };
  }
  return { top, left: gap };
}
