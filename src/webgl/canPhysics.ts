/**
 * Secondary motion for the cans: a full can is heavy and its liquid lags behind it. Each can is a damped pendulum
 * (the can, ~2 Hz) coupled to a slower spring (the liquid, ~1 Hz). The carrier (ring, scroll glide, drag) accelerates
 * the can's foot; the top swings past and settles in two or three shrinking wobbles. Pure maths, no three.js, no
 * allocation per frame: the scene reads tiltX / tiltZ and adds them to the can's rotation.
 *
 * Semi-implicit Euler at a fixed 1/120 s step keeps it stable and identical at 30, 60 or 144 fps.
 */
import { CAN_PHYSICS } from './motionVocabulary';

const STEP = 1 / 120;
const MAX_STEPS = 8; // a long frame never spirals: it just drops the remainder
const TWO_PI = Math.PI * 2;

/** Natural frequencies (rad/s) and damping ratios, from the vocabulary. */
const W1 = TWO_PI * CAN_PHYSICS.canHz;
const W2 = TWO_PI * CAN_PHYSICS.liquidHz;
const C1 = 2 * CAN_PHYSICS.canDamping * W1;
const C2 = 2 * CAN_PHYSICS.liquidDamping * W2;

export class CanPhysics {
  // per can, per axis (0 = about X, 1 = about Z): can angle, its rate, liquid angle, its rate
  private readonly angle: Float32Array;
  private readonly rate: Float32Array;
  private readonly liquid: Float32Array;
  private readonly liquidRate: Float32Array;
  private readonly clock: Float32Array;

  constructor(private readonly count: number) {
    this.angle = new Float32Array(count * 2);
    this.rate = new Float32Array(count * 2);
    this.liquid = new Float32Array(count * 2);
    this.liquidRate = new Float32Array(count * 2);
    this.clock = new Float32Array(count);
  }

  /**
   * Advances can `i` by `dt` seconds. `ax` and `az` are the carrier's acceleration (world units/s²), sideways and
   * toward the camera.
   */
  step(i: number, ax: number, az: number, dt: number) {
    // a bad input (NaN or Infinity from a hitch or a degenerate frame) must never latch into the state: it would hide the
    // can for good, because every later step builds on it
    if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(dt)) {
      this.reset(i);
      return;
    }
    const limit = CAN_PHYSICS.maxAcceleration;
    // a lean from sideways acceleration is a roll about Z; from acceleration toward the camera, a pitch back about X
    const drive0 = -CAN_PHYSICS.pitchGain * Math.max(-limit, Math.min(limit, az));
    const drive1 = CAN_PHYSICS.rollGain * Math.max(-limit, Math.min(limit, ax));
    this.clock[i] = Math.min(this.clock[i] + dt, STEP * MAX_STEPS);
    while (this.clock[i] >= STEP) {
      this.clock[i] -= STEP;
      this.integrate(i * 2, drive0);
      this.integrate(i * 2 + 1, drive1);
    }
    if (!Number.isFinite(this.angle[i * 2] + this.angle[i * 2 + 1] + this.liquid[i * 2] + this.liquid[i * 2 + 1])) this.reset(i);
  }

  private integrate(k: number, drive: number) {
    const a = this.angle[k];
    const r = this.rate[k];
    const s = this.liquid[k];
    const sr = this.liquidRate[k];
    // the spring between liquid and can (what the liquid pulls with, and what pulls it along)
    const pull = W2 * W2 * (s - a) + C2 * (sr - r);
    const accelCan = -W1 * W1 * a - C1 * r + drive + CAN_PHYSICS.liquidMass * pull;
    const accelLiquid = -pull;
    const nr = r + accelCan * STEP;
    const nsr = sr + accelLiquid * STEP;
    this.rate[k] = nr;
    this.liquidRate[k] = nsr;
    this.angle[k] = a + nr * STEP;
    this.liquid[k] = s + nsr * STEP;
  }

  /** Kicks can `i` (radians per second about X and Z), for a pick-up, a landing or the tab popping. */
  impulse(i: number, rateX: number, rateZ: number) {
    this.rate[i * 2] += rateX;
    this.rate[i * 2 + 1] += rateZ;
  }

  /** Rest angle added to the can's rotation, in radians, softly capped so it never reads as cartoon wobble. */
  tiltX(i: number) {
    return this.cap(this.angle[i * 2]);
  }

  tiltZ(i: number) {
    return this.cap(this.angle[i * 2 + 1]);
  }

  /** Stops can `i` dead (it was hidden or jumped across the ring). */
  reset(i: number) {
    for (let k = i * 2; k < i * 2 + 2; k += 1) {
      this.angle[k] = 0;
      this.rate[k] = 0;
      this.liquid[k] = 0;
      this.liquidRate[k] = 0;
    }
    this.clock[i] = 0;
  }

  /** Sum of |angle| and |rate| over every can: 0 when everything is still (the scene can stay asleep). */
  restlessness() {
    let total = 0;
    for (let k = 0; k < this.count * 2; k += 1) total += Math.abs(this.angle[k]) + Math.abs(this.rate[k]) * 0.1;
    return total;
  }

  private cap(angle: number) {
    const max = CAN_PHYSICS.maxTilt;
    return max * Math.tanh(angle / max);
  }
}
