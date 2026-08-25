import { describe, expect, it } from 'vitest';

import { AXIS_TOOLTIP_GAP, axisTooltipPosition } from './axis-tooltip-position';

const size = {
  contentSize: [180, 90],
  viewSize: [360, 400],
};

describe('axisTooltipPosition', () => {
  it('pins to the right for a left or center tap so the box stays on-screen', () => {
    expect(axisTooltipPosition([40, 200], size)).toEqual({ top: 102, right: AXIS_TOOLTIP_GAP });
    expect(axisTooltipPosition([180, 200], size)).toEqual({ top: 102, right: AXIS_TOOLTIP_GAP });
  });

  it('pins to the left when the tap is in the right 40% of the chart', () => {
    expect(axisTooltipPosition([250, 200], size)).toEqual({ top: 102, left: AXIS_TOOLTIP_GAP });
  });

  it('keeps the box inside the chart vertically', () => {
    expect(axisTooltipPosition([40, 10], size).top).toBe(AXIS_TOOLTIP_GAP);
    expect(axisTooltipPosition([40, 400], size).top).toBe(302);
  });
});
