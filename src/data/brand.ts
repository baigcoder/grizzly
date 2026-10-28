/**
 * Typed access to src/data/grizzly.json — the single source for label and site
 * text (also read by scripts/build-labels.mjs). Strings starting with "TODO" are
 * unconfirmed: show them through `confirmed()` so they never reach the page raw.
 */
import grizzly from './grizzly.json';

export const BRAND = grizzly.brand;
export const UNCONFIRMED = grizzly.unconfirmed;
export const NUTRITION = grizzly.nutrition;
export const LABEL = grizzly.label;
export const BADGES = grizzly.badges;
export const POLICIES = grizzly.policies;
export const COMMERCE = grizzly.commerce;
export const REVIEWS: Array<{ author: string; rating: number; text: string }> = grizzly.reviews;
export const HALAL_PAGE = grizzly.halalPage;
export const ABOUT_PAGE = grizzly.aboutPage;
export type Store = { name: string; city: string; address: string; mapUrl?: string };
/** Retail stores: empty until the list is confirmed. */
export const STORES: Store[] = grizzly.stores.items;
export const NEWSLETTER_OFFER: string = grizzly.newsletterOffer;
export const LIMITED_EDITION = grizzly.limitedEdition;

export function isTodo(value: unknown): boolean {
  return typeof value === 'string' && value.trim().startsWith('TODO');
}

/** Returns the value, or a neutral fallback while it is still TODO. */
export function confirmed(value: string, fallback = 'To be confirmed'): string {
  return isTodo(value) ? fallback : value;
}

export type GrizzlyFlavor = (typeof grizzly.flavors)[number];
export const GRIZZLY_FLAVORS: GrizzlyFlavor[] = grizzly.flavors;
export const GRIZZLY_BENEFITS = grizzly.benefits;
/** Label badges (natural caffeine, no artificial colors, no preservatives). */
export const GRIZZLY_BADGES: string[] = grizzly.badges;
export const GRIZZLY_FAQ = grizzly.faq;

/**
 * Public text for strings that may contain a trailing "TODO: …" note: keeps the
 * confirmed part and replaces the rest with a neutral "to be confirmed".
 */
export function publicText(value: string, fallback = 'Details to be confirmed.'): string {
  const at = value.indexOf('TODO');
  if (at < 0) return value;
  const head = value.slice(0, at).trim();
  return head ? `${head} ${fallback}` : fallback;
}
