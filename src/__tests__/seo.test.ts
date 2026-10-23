import { describe, expect, it } from 'vitest';
import { indexableRoutes, pageMeta, productFacts, SITE_URL } from '../seo/meta';
import { llmsTxt, robotsTxt, sitemapXml } from '../seo/files';
import { staticHtml } from '../seo/staticPage';
import { PRODUCTS } from '../data/products';
import { FAQ_ITEMS } from '../data/faq';
import { FILM, FILM_CHAPTERS } from '../data/film';

const everything = () =>
  [
    ...indexableRoutes().map((route) => JSON.stringify(pageMeta(route))),
    ...indexableRoutes().map((route) => staticHtml(route)),
    llmsTxt(),
    sitemapXml(),
  ].join('\n');

describe('SEO and AEO output', () => {
  it('never publishes a TODO marker', () => {
    expect(everything()).not.toMatch(/TODO/);
  });

  it('keeps unconfirmed facts out of structured data: no offers, prices, caffeine or sugar amounts, ratings or reviews', () => {
    const schema = indexableRoutes().map((route) => JSON.stringify(pageMeta(route).jsonLd)).join('\n');
    expect(schema).not.toMatch(/"offers"|"price"|priceCurrency|aggregateRating|"review"|\b\d+(\.\d+)? ?mg\b/i);
  });

  it('describes every product page with its own title, canonical path and Product schema', () => {
    const titles = new Set<string>();
    PRODUCTS.forEach((product) => {
      const meta = pageMeta({ type: 'PRODUCT', slug: product.slug });
      expect(meta.path).toBe(`/products/${product.slug}`);
      expect(meta.title).toContain(product.name);
      titles.add(meta.title);
      expect(meta.jsonLd.some((node) => node['@type'] === 'Product')).toBe(true);
      expect(meta.jsonLd.some((node) => node['@type'] === 'BreadcrumbList')).toBe(true);
    });
    expect(titles.size).toBe(PRODUCTS.length);
  });

  it('FAQ schema matches the visible, answered questions only', () => {
    const faq = pageMeta({ type: 'HOME' }).jsonLd.find((node) => node['@type'] === 'FAQPage') as { mainEntity: Array<{ name: string }> };
    const answered = FAQ_ITEMS.filter((item) => !item.pending).map((item) => item.question);
    expect(faq.mainEntity.map((q) => q.name)).toEqual(answered);
    expect(FAQ_ITEMS.some((item) => item.pending)).toBe(true); // caffeine and sugar are still unconfirmed
  });

  it('answers "What is Grizzly Energy?" in the first FAQ item and in static HTML', () => {
    expect(FAQ_ITEMS[0].question).toBe('What is Grizzly Energy?');
    expect(staticHtml({ type: 'HOME' })).toContain(FAQ_ITEMS[0].answer.slice(0, 60));
    expect(FAQ_ITEMS[0].answer).toMatch(/halal/i);
  });

  it('lists size, caffeine, sugar, ingredients and halal status for each product', () => {
    PRODUCTS.forEach((product) => {
      const labels = productFacts(product).map((fact) => fact.label);
      ['Size', 'Caffeine', 'Sugar', 'Ingredients', 'Halal status'].forEach((label) => expect(labels).toContain(label));
    });
  });

  it('sitemap and robots point at the same origin; checkout and bag stay out of the index', () => {
    expect(sitemapXml()).toContain(`${SITE_URL}/products/peach`);
    expect(sitemapXml()).not.toContain('/checkout');
    expect(robotsTxt()).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
    expect(pageMeta({ type: 'CHECKOUT' }).noindex).toBe(true);
  });

  it('every static page has exactly one h1 and a link back to the shop', () => {
    indexableRoutes().forEach((route) => {
      const html = staticHtml(route);
      expect(html.match(/<h1[ >]/g)?.length).toBe(1);
      expect(html).toContain('href="/shop"');
    });
  });

  it('uses exactly one production origin everywhere (canonical, sitemap, robots, Open Graph, JSON-LD, llms.txt)', () => {
    const urls = [everything(), robotsTxt()].join('\n').match(/https?:\/\/[^\s"'<>)\]]+/g) ?? [];
    const origins = new Set(
      urls
        .map((url) => new URL(url).origin)
        // schema.org / sitemaps.org namespace URLs are not site URLs
        .filter((origin) => !/schema\.org|sitemaps\.org|w3\.org/.test(origin))
    );
    expect([...origins]).toEqual([new URL(SITE_URL).origin]);
  });

  it('describes the film page with a VideoObject whose length and chapters match the film', () => {
    const meta = pageMeta({ type: 'FILM' });
    expect(meta.path).toBe('/film');
    const video = meta.jsonLd.find((node) => node['@type'] === 'VideoObject') as { duration: string; hasPart: Array<{ startOffset: number; endOffset: number }> };
    expect(video.duration).toBe(`PT${FILM.duration}S`);
    expect(video.hasPart).toHaveLength(FILM_CHAPTERS.length);
    // chapters tile the whole film with no gaps or overlaps
    FILM_CHAPTERS.forEach((chapter, i) => expect(chapter.start).toBe(i === 0 ? 0 : FILM_CHAPTERS[i - 1].end));
    expect(FILM_CHAPTERS[FILM_CHAPTERS.length - 1].end).toBe(FILM.duration);
    expect(sitemapXml()).toContain(`${SITE_URL}/film`);
  });
});
