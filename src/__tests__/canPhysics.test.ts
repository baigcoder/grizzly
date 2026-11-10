import { describe, it, expect } from 'vitest';
import { CanPhysics } from '../webgl/canPhysics';
import { CAN_PHYSICS } from '../webgl/motionVocabulary';

/** Runs `seconds` of 60 fps frames with a constant carrier acceleration. */
const run = (p: CanPhysics, ax: number, az: number, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) p.step(0, ax, az, dt);
};

describe('can physics', () => {
  it('leans the top away from a sideways push, then overshoots and settles', () => {
    const p = new CanPhysics(1);
    run(p, 60, 0, 0.25);
    expect(p.tiltZ(0)).toBeGreaterThan(0.01); // the top lags: positive roll for a push toward +x
    let sign = Math.sign(p.tiltZ(0));
    let swings = 0;
    for (let t = 0; t < 3; t += 1 / 60) {
      p.step(0, 0, 0, 1 / 60);
      const now = Math.sign(p.tiltZ(0));
      if (now !== 0 && now !== sign) {
        swings += 1;
        sign = now;
      }
    }
    expect(swings).toBeGreaterThanOrEqual(1); // it swings through upright at least once
    expect(Math.abs(p.tiltZ(0))).toBeLessThan(0.002); // and is still again after 3 s
    expect(p.restlessness()).toBeLessThan(0.01);
  });

  it('never tilts past the cap, even under a huge acceleration or a long frame', () => {
    const p = new CanPhysics(1);
    run(p, 1e6, -1e6, 2);
    p.step(0, 1e6, 1e6, 5);
    expect(Math.abs(p.tiltX(0))).toBeLessThanOrEqual(CAN_PHYSICS.maxTilt);
    expect(Math.abs(p.tiltZ(0))).toBeLessThanOrEqual(CAN_PHYSICS.maxTilt);
    expect(Number.isFinite(p.tiltX(0)) && Number.isFinite(p.tiltZ(0))).toBe(true);
  });

  it('gives the same motion at 30, 60 and 144 fps', () => {
    const at = (fps: number) => {
      const p = new CanPhysics(1);
      run(p, 40, 0, 0.5, 1 / fps);
      return p.tiltZ(0);
    };
    expect(Math.abs(at(30) - at(144))).toBeLessThan(0.006);
    expect(Math.abs(at(60) - at(144))).toBeLessThan(0.004);
  });

  it('shrugs off NaN and Infinity input instead of latching it', () => {
    const p = new CanPhysics(1);
    p.step(0, NaN, 0, 1 / 60);
    p.step(0, 0, Infinity, 1 / 60);
    p.step(0, 10, 0, NaN);
    expect(p.tiltX(0)).toBe(0);
    expect(p.tiltZ(0)).toBe(0);
    run(p, 40, 0, 0.2); // and it still works afterwards
    expect(p.tiltZ(0)).toBeGreaterThan(0);
  });

  it('resets a can and keeps cans independent', () => {
    const p = new CanPhysics(2);
    p.step(0, 80, 0, 0.2);
    expect(p.tiltZ(1)).toBe(0);
    p.reset(0);
    expect(p.tiltZ(0)).toBe(0);
    expect(p.restlessness()).toBe(0);
  });
});
