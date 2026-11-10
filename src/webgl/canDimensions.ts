/** Can proportions in world units (no three.js import, so the UI can read them without loading the 3D chunk). */

/**
 * The ends' profiles (canGeometry.ts) are drawn at true size from the reference can, so this is 1. It stays as one knob
 * for their heights if the ends ever need to grow or shrink together.
 */
export const END_STRETCH = { top: 1, bottom: 1 } as const;

export const CAN = {
  radius: 0.795,
  shellHeight: 3.88,
  /** Highest point of the rolled rim above the shell edge (canGeometry TOP_PROFILE). */
  topHeight: 0.094 * END_STRETCH.top,
  /** Lowest point of the stand ring below the shell edge (canGeometry BOTTOM_PROFILE). */
  bottomHeight: 0.109 * END_STRETCH.bottom,
} as const;
