/**
 * The scene's motion vocabulary: five roles, each a frame-independent damping rate (per second; higher is snappier).
 * Every eased value in the scene picks one of these, so the whole page moves with the same hand, and a change of feel
 * is a one-line edit. CSS uses the matching duration tokens (src/styles/tokens.css: --motion-instant / -fast / -slow).
 *
 *   REVEAL      something fades or settles into view (effects, tints)          slow, soft
 *   FOCUS       the scene answers the person: pointer, hover                   immediate
 *   TRANSITION  the story moves with the scroll, a beat behind it              medium
 *   EMPHASIZE   light shifts attention (benefit glow)                          unhurried, physical
 *   REST        nothing moves: ambient loops stop, reduced motion lives here   0
 */
export const MOTION_RATE = {
  reveal: 4,
  focus: 12,
  transition: 9,
  emphasize: 6,
  /** The featured can travelling between pages. */
  settle: 3.6,
  rest: 0,
} as const;

/**
 * Weight of a full 250 ml can (canPhysics.ts): it swings on a ~2 Hz pendulum with its liquid trailing on a slower
 * ~1 Hz spring. A damping ratio near 0.2 shows two or three wobbles; the tilt never passes ~4°.
 */
export const CAN_PHYSICS = {
  canHz: 2.2,
  canDamping: 0.2,
  liquidHz: 1.1,
  liquidDamping: 0.3,
  /** How hard the liquid drags the can (0 = a solid block). */
  liquidMass: 0.5,
  /** Angular drive (rad/s²) per unit of carrier acceleration; at rest the lean is gain × a / (2π·canHz)². */
  rollGain: 0.45, // sideways flick: the swing that reads
  pitchGain: 0.1, // toward the camera: the ring's curve alone would nod every can
  /** Carrier acceleration cap, world units/s²: a teleport or a hitch never throws a can. */
  maxAcceleration: 90,
  /** Soft cap on the tilt, radians (≈4°). */
  maxTilt: 0.07,
} as const;

/** Exponential damping factor for one frame: 1 - e^(-rate * delta). The same feel at 30, 60 or 144 fps. */
export const damp = (rate: number, delta: number): number => 1 - Math.exp(-rate * delta);
