import { describe, expect, it } from 'vitest';
import { BENEFIT_CAN_REACH, benefitCanShift } from '../webgl/sceneStates';

// px → world units at the benefit camera (z 12, 20° lens)
const unitsPerPx = (height: number) => (2 * Math.tan((20 * Math.PI) / 360) * 12) / height;

describe('benefit can clearance', () => {
  it('leaves the can alone when the copy already clears it', () => {
    // 1920×1080: copy ends near 600 px, the can's left edge is far to the right of that
    expect(benefitCanShift({ width: 1920, height: 1080 }, 600, 1800)).toBe(0);
  });

  it('slides the can right by exactly the overlap plus the gap', () => {
    const view = { width: 1280, height: 720 };
    const reachPx = BENEFIT_CAN_REACH / unitsPerPx(view.height);
    const copyRight = 560;
    const canLeft = view.width / 2 - reachPx;
    const shift = benefitCanShift(view, copyRight, 1160, 28);
    expect(shift / unitsPerPx(view.height)).toBeCloseTo(copyRight + 28 - canLeft, 5);
    expect(shift).toBeGreaterThan(0);
  });

  it('never runs the can into the chapter rail', () => {
    const view = { width: 1024, height: 768 };
    const railLeft = 905;
    const shift = benefitCanShift(view, 700, railLeft); // would need far more than the room allows
    const reachPx = BENEFIT_CAN_REACH / unitsPerPx(view.height);
    const canRight = view.width / 2 + shift / unitsPerPx(view.height) + reachPx;
    expect(canRight).toBeLessThanOrEqual(railLeft - 16 + 1e-6);
  });

  it('ignores an unmeasured layout', () => {
    expect(benefitCanShift({ width: 1280, height: 0 }, 560, 1160)).toBe(0);
    expect(benefitCanShift({ width: 1280, height: 720 }, 0, 1160)).toBe(0);
  });
});
