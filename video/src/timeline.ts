/**
 * The film's cue sheet, shared by the 3D plate (shots.ts), the type layer (film/, Remotion) and the score
 * (audio/synth.mjs reads the same numbers). Seconds; 120 BPM, so one beat = 0.5 s and every cut sits on the grid.
 */
export const FPS = 30;
export const BEAT = 0.5;

export const T = {
  hook: 0,
  roar: 1.0, // the bear rises, flash
  slam: 1.5, // FUEL YOUR WILD SIDE lands
  reveal: 3,
  build: 6,
  base: 6.5, // base lands
  body: 7.0, // body lands on the base
  printFrom: 7.25,
  printTo: 9.25,
  lid: 9.5, // lid lands
  tab: 10.0, // tab snaps down
  flavors: 12,
  inside: 30,
  zamzam: 36,
  halal: 39,
  crack: 41,
  pop: 42.5, // the tab cracks
  finale: 44,
  lockup: 46.5,
  end: 50,
} as const;

export const FLAVOR_SLOT = 3;
export const BENEFIT_SLOT = 2;
export const DURATION = T.end;

/** Start of flavor chapter i (0..5). */
export const flavorAt = (i: number) => T.flavors + i * FLAVOR_SLOT;
/** Start of benefit block i (0..2). */
export const benefitAt = (i: number) => T.inside + i * BENEFIT_SLOT;
/** When the finale's can j (0..5) lights up. */
export const lightAt = (j: number) => T.finale + 0.35 + j * 0.25;
