/**
 * PRODUCT CATALOG — product page, bag and checkout. Built from grizzly.json so
 * names, copy, nutrition and accents have one source. Pack prices are
 * PLACEHOLDERS until real pricing is supplied (labelled as such in the UI).
 */
import { BRAND, COMMERCE, GRIZZLY_BENEFITS, GRIZZLY_FLAVORS, NUTRITION } from './brand';
import { versioned } from './assetVersion';

export const PLACEHOLDER_PRICING = COMMERCE.placeholderPricing;

export interface PackOption {
  id: 'single' | 'pack-6' | 'pack-12' | 'case-24';
  label: string;
  count: number;
  price: number; // PKR, placeholder
  unitPrice: number;
  badge?: string;
  inStock: boolean;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  flavor: string;
  line1: string;
  line2: string;
  index: number;
  tagline: string;
  description: string;
  edition?: string;
  accentColor: string;
  accentToken: string;
  currency: 'PKR';
  packOptions: PackOption[];
  leadTime: string;
  origin: string;
  volume: string;
  /** May be a TODO string until confirmed. */
  ingredients: string;
  nutrition: { serving: string; rows: Array<[string, string]> };
  features: string[];
  textureUrl: string;
  relatedSlugs: string[];
}

export const PACK_OPTIONS: PackOption[] = COMMERCE.packs.map((pack) => ({
  id: pack.id as PackOption['id'],
  label: pack.label,
  count: pack.count,
  price: pack.price,
  unitPrice: Math.round(pack.price / pack.count),
  badge: 'badge' in pack ? (pack as { badge?: string }).badge : undefined,
  inStock: true, // TODO: stock per flavor (see grizzly.json → commerce.stock)
}));

export const PRODUCTS: Product[] = GRIZZLY_FLAVORS.map((flavor, index, all) => ({
  id: flavor.slug,
  slug: flavor.slug,
  name: flavor.name,
  flavor: flavor.name,
  line1: flavor.lines[0].toUpperCase(),
  line2: (flavor.lines[1] ?? '').toUpperCase(),
  index,
  tagline: flavor.taste,
  description: flavor.description,
  edition: 'edition' in flavor ? (flavor as { edition?: string }).edition : undefined,
  accentColor: flavor.accent,
  accentToken: flavor.accentToken,
  currency: 'PKR',
  packOptions: PACK_OPTIONS,
  leadTime: 'Delivery times to be confirmed',
  origin: BRAND.origin,
  volume: BRAND.volume,
  ingredients: flavor.ingredients,
  nutrition: { serving: NUTRITION.serving, rows: NUTRITION.rows as Array<[string, string]> },
  features: GRIZZLY_BENEFITS.map((benefit) => benefit.title),
  textureUrl: `/textures/grizzly/${flavor.slug}.webp`,
  relatedSlugs: [1, 2, 3].map((step) => all[(index + step) % all.length].slug),
}));

export function getProductBySlug(slug: string): Product | undefined {
  return PRODUCTS.find((product) => product.slug === slug);
}

/** Small transparent packshot for the bag and related flavors. */
export function getProductThumbUrl(product: Pick<Product, 'slug'>): string {
  return versioned(`/products/thumbs/${product.slug}.webp`);
}

/** PKR, no decimals ("Rs 1,400"); Urdu digits stay Latin for price legibility. */
export function formatPrice(value: number, locale: string = COMMERCE.locale): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: COMMERCE.currency, maximumFractionDigits: 0 }).format(value);
}

export function getRelatedProducts(slug: string): Product[] {
  const current = getProductBySlug(slug);
  if (!current) return PRODUCTS.slice(0, 3);
  return current.relatedSlugs.map((s) => getProductBySlug(s)).filter((p): p is Product => Boolean(p));
}
