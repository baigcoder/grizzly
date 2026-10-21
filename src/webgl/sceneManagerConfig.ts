/**
 * Hero carousel at 1920×920: a symmetric fan of cans. The centre can stands front and largest; the
 * neighbours step back in depth along a deep ring, rise gently either side and lean in toward the
 * centre with their labels facing forward, like a premium product line-up (flavors repeat).
 */
export const CAROUSEL_CONFIG = {
  spacing: 2.95,         // arc length between cans: about a third of a can of air between the larger neighbours
  spacingMobile: 2.6,
  ringRadius: 23,        // a deep ring: the cans fan back from the centre, the outermost clearly further away
  ringRadiusMobile: 10,
  ringArc: 0.075,        // a symmetric fan: cans rise gently either side of the centre (squared with slot distance)
  ringArcMobile: 0.09,   // phones: outer cans rise slightly (squared with the slot distance)
  ringWave: 0.4,         // tilted ring, as in the reference: lower left of centre, higher right of it
  ringWaveMobile: 0.35,
  ringWaveSlots: 5,      // slots from the centre to where the ring turns back level (its edge)
  visibleSlots: 4,       // nine big cans across the frame on desktop; the outermost fade into the frame edge
  visibleSlotsMobile: 1.35,
  heroScale: 1.5,        // the hero can fills the space between the header and the title (heroFit scales it down to fit)
  heroScaleMobile: 1.6,
  neighbourScale: 0.76,  // neighbours relative to the centre can (stepped down so the focused can clearly leads, as in the reference)
  heroLift: 1.4,         // focused can steps toward the camera
  yBase: 0.1,
  pitchX: -0.2,          // focused can: bottom toward camera, underside ellipse visible
  pitchNeighbour: -0.06, // neighbours stand closer to upright
  yawHeroY: -0.35,       // logo turned toward camera
  rollZ: 0.08,           // focused can leans a little left
  neighbourLean: 0.42,   // neighbours lean toward the centre, like a fan
  scatter: 0.4,          // per-can height/roll jitter (desktop): a light, stable tumble so the ring floats like the reference, not a shelf
  scatterMobile: 0.4,
  labelTurn: -0.7,       // neighbours turn a little with the ring but keep their fronts readable
};
