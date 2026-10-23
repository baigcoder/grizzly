/**
 * Words and colours for the type layer, from the site's single data source (src/data/grizzly.json), and the cue
 * sheet shared with the 3D plate and the score (video/src/timeline.ts).
 */
import grizzly from "../../../src/data/grizzly.json";

export { T, FPS, FLAVOR_SLOT, BENEFIT_SLOT, DURATION, flavorAt, benefitAt, lightAt } from "../../src/timeline";

export const BRAND = grizzly.brand;
export const FLAVORS = grizzly.flavors.map((f) => ({
  slug: f.slug,
  name: f.name,
  lines: f.lines.map((l) => l.toUpperCase()),
  taste: f.taste,
  accent: f.accent,
  edition: "edition" in f ? (f as { edition?: string }).edition : undefined,
}));
export const BENEFITS = grizzly.benefits.map((b) => ({ title: b.title, spec: b.spec, description: b.description }));
/** The label's own Zamzam line. */
export const ZAMZAM_LINE = grizzly.benefits.find((b) => b.id === "zamzam")?.description ?? "";
/** Address printed on the label (grizzly.json: production domain still to be confirmed). */
export const SITE = BRAND.company.website.replace(/^www\./, "");
export const BRAND_BLUE = FLAVORS[0].accent;
export const GOLD = "#e9c27a";
