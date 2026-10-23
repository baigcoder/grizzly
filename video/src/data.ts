/**
 * Every word in the film comes from the site's single data source (src/data/grizzly.json): flavor names, taste
 * lines, accents, the four benefits and the brand line. Nothing here is written by hand except layout.
 */
import grizzly from '../../src/data/grizzly.json';

export const BRAND = grizzly.brand;

export type FilmFlavor = {
  slug: string;
  name: string;
  lines: string[];
  taste: string;
  accent: string;
  deep: string;
  edition?: string;
};

export const FLAVORS: FilmFlavor[] = grizzly.flavors.map((f) => ({
  slug: f.slug,
  name: f.name,
  lines: f.lines,
  taste: f.taste,
  accent: f.accent,
  deep: f.accentDeep,
  edition: 'edition' in f ? (f as { edition?: string }).edition : undefined,
}));

export const BENEFITS = grizzly.benefits.map((b) => ({ title: b.title, spec: b.spec }));

/** Label UV rects (u0, v0, u1, v1) of the four benefit blocks, from the label layout. */
export const BENEFIT_RECTS = grizzly.label.benefitBlocks as Array<[number, number, number, number]>;
/** The halal badge on the right panel of every label (measured on the 4096 px artwork). */
export const HALAL_RECT: [number, number, number, number] = [0.735, 0.105, 0.82, 0.215];
/** u of the front panel centre on the label. */
export const FRONT_U = grizzly.label.frontCenterU;

/** Site address as printed on the label (grizzly.json notes the production domain is still to be confirmed). */
export const SITE = BRAND.company.website.replace(/^www\./, '');
