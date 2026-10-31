/**
 * Version tag for long-cached art whose file names never change: the can label textures and the product renders.
 * They are served with a 30-day cache (vercel.json), so after the art changes a returning browser keeps showing the
 * old cans until its copy expires. Bump this whenever the labels or the product renders are rebuilt, so every browser
 * fetches the new files once.
 */
export const ART_VERSION = '2';

/** `url` with the art version appended (the static host ignores the query; the browser cache keys on it). */
export const versioned = (url: string) => `${url}?v=${ART_VERSION}`;
