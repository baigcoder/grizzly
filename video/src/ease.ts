/** Deterministic timing helpers: every value in the film is a pure function of time. */
export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** 0 before a, 1 after b, linear in between. */
export const range = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const smooth = (k: number) => k * k * (3 - 2 * k);
export const inOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const inOutQuint = (k: number) => (k < 0.5 ? 16 * k ** 5 : 1 - Math.pow(-2 * k + 2, 5) / 2);
export const outExpo = (k: number) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k));
export const inExpo = (k: number) => (k <= 0 ? 0 : Math.pow(2, 10 * k - 10));
export const outCubic = (k: number) => 1 - Math.pow(1 - k, 3);
export const inCubic = (k: number) => k * k * k;
export const outBack = (k: number, s = 1.4) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2);
/** Rises over [a, a + rise], holds, falls over [b - fall, b]. */
export const window01 = (t: number, a: number, b: number, rise = 0.4, fall = 0.4) =>
  Math.min(smooth(range(t, a, a + rise)), 1 - smooth(range(t, b - fall, b)));
