/** robots.txt, sitemap.xml and llms.txt, generated from the same data as the pages. */
import { BADGES, BRAND, GRIZZLY_BENEFITS, isTodo } from '../data/brand';
import { FAQ_ITEMS } from '../data/faq';
import { PRODUCTS } from '../data/products';
import { SITE_URL, absoluteUrl, indexableRoutes, pageMeta, productFacts } from './meta';

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\nDisallow: /cart\nDisallow: /checkout\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

/** `lastmod` is the build date (YYYY-MM-DD); omitted when not given, e.g. in tests. */
export function sitemapXml(lastmod?: string): string {
  const stamp = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';
  const urls = indexableRoutes().map((route) => `  <url><loc>${absoluteUrl(pageMeta(route).path)}</loc>${stamp}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/** A plain-language summary for AI assistants (see llmstxt.org). States clearly what is not yet confirmed. */
export function llmsTxt(): string {
  const lines: string[] = [];
  lines.push(`# ${BRAND.name}`, '', `> ${BRAND.summary}`, '');
  lines.push('## Key facts', '');
  lines.push(`- Brand: ${BRAND.name}, tagline "${BRAND.tagline}".`);
  lines.push(`- Product: ${BRAND.productType.toLowerCase()}, ${BRAND.volume} cans, ${PRODUCTS.length} flavors.`);
  lines.push('- Halal certified. Made with added Zamzam water.');
  lines.push(`- ${BRAND.origin}, by ${BRAND.company.name}.`);
  lines.push(`- ${BADGES.join('. ')}.`);
  lines.push(`- Not recommended for children, pregnant or nursing women.`);
  lines.push('- Payment: cash on delivery (card payment coming soon). Delivery terms, returns, caffeine and sugar per can, full ingredients and the halal certifier are being confirmed and are not yet published.');
  lines.push('', '## Flavors', '');
  PRODUCTS.forEach((product) => lines.push(`- [${product.name}](${absoluteUrl(`/products/${product.slug}`)}): ${product.tagline}${product.edition ? ` (${product.edition})` : ''}`));
  lines.push('', '## What is in every can', '');
  GRIZZLY_BENEFITS.forEach((benefit) => lines.push(`- ${benefit.title}: ${benefit.description}`));
  lines.push('', '## Pages', '');
  indexableRoutes().forEach((route) => {
    const meta = pageMeta(route);
    lines.push(`- [${meta.title}](${absoluteUrl(meta.path)}): ${meta.description}`);
  });
  lines.push('', '## Questions and answers', '');
  FAQ_ITEMS.filter((item) => !item.pending).forEach((item) => lines.push(`**${item.question}** ${item.answer}`, ''));
  // Per flavor: only the facts that are confirmed. Anything still being confirmed is named once, not guessed.
  lines.push('## Facts per flavor', '');
  PRODUCTS.forEach((product) => {
    const known = productFacts(product).filter((fact) => fact.confirmed).map((fact) => `${fact.label.toLowerCase()} ${fact.value}`);
    const pending = productFacts(product).filter((fact) => !fact.confirmed).map((fact) => fact.label.toLowerCase());
    lines.push(`- ${product.name}: ${known.join('; ')}. Not yet published: ${pending.join(', ')}.`);
  });
  if (isTodo(BRAND.contactEmail)) lines.push('', 'Contact details are being confirmed.');
  return `${lines.join('\n')}\n`;
}
