/** Can proportions in world units (no three.js import, so the UI can read them without loading the 3D chunk). */

/**
 * The ends' profiles are authored compact and stretched up/down by these factors. At 1× the necked shoulder was ~2% of
 * the can's height and read as a flat, cut-off top (a real 250 ml slim can shows a clear sloped shoulder, ~7%, and a
 * visible taper into the base).
 */
export const END_STRETCH = { top: 1.4, bottom: 1.3 } as const;

export const CAN = {
  radius: 0.795,
  shellHeight: 3.88,
  topHeight: 0.29 * END_STRETCH.top,
  bottomHeight: 0.245 * END_STRETCH.bottom,
} as const;
