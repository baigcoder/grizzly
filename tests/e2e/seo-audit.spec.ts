import { expect, test } from '@playwright/test';

/**
 * Per-route SEO contract on the static HTML a crawler receives (JavaScript off): unique title and description,
 * canonical on the one configured origin, correct robots, exactly one h1 with a logical heading order, Open
 * Graph with a real social image, alt text, parseable JSON-LD built only from verified facts (no TODO text, no
 * invented prices or reviews), and internal links that resolve.
 */
test.use({ javaScriptEnabled: false });

const INDEXABLE = ['/', '/shop', '/mix', '/halal-zamzam', '/about', '/stores', '/privacy', ...['blue-raspberry', 'mango-fuego', 'watermelon', 'strawberry-kiwi', 'peach', 'blackout-berry'].map((slug) => `/products/${slug}`)];
const NOINDEX = ['/cart', '/checkout'];
const ORIGIN = 'https://www.grizzlyenergy.pk';

const titles = new Map<string, string>();
const descriptions = new Map<string, string>();

for (const path of [...INDEXABLE, ...NOINDEX]) {
  test(`SEO contract ${path}`, async ({ page, request }) => {
    await page.goto(path);
    const indexable = INDEXABLE.includes(path);

    const title = await page.title();
    expect(title.length, 'title length').toBeGreaterThan(15);
    expect(title.length, 'title length').toBeLessThanOrEqual(80);
    const description = (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
    expect(description.length, 'description length').toBeGreaterThanOrEqual(40);
    expect(description.length, 'description length').toBeLessThanOrEqual(200);
    if (indexable) {
      expect(titles.get(title), `title "${title}" already used by ${titles.get(title)}`).toBeUndefined();
      expect(descriptions.get(description), `description already used by ${descriptions.get(description)}`).toBeUndefined();
      titles.set(title, path);
      descriptions.set(description, path);
    }

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBe(`${ORIGIN}${path === '/' ? '/' : path}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', indexable ? /index, follow/ : /noindex/);

    // Open Graph + Twitter
    for (const key of ['og:title', 'og:description', 'og:url', 'og:image', 'og:site_name']) {
      await expect(page.locator(`meta[property="${key}"]`), key).toHaveAttribute('content', /.+/);
    }
    expect(await page.locator('meta[property="og:site_name"]').getAttribute('content')).toBe('Grizzly Energy');
    expect(await page.locator('meta[property="og:url"]').getAttribute('content')).toBe(canonical);
    const image = (await page.locator('meta[property="og:image"]').getAttribute('content'))!;
    expect(image.startsWith(`${ORIGIN}/social/`)).toBe(true);
    const imageResponse = await request.get(image.replace(ORIGIN, ''));
    expect(imageResponse.status(), `og:image ${image}`).toBe(200);
    expect(imageResponse.headers()['content-type']).toMatch(/image\//);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');

    // Headings: one h1, no skipped levels, no empty headings.
    const headings = await page.locator('h1, h2, h3, h4').evaluateAll((nodes) => nodes.map((n) => ({ level: Number(n.tagName[1]), text: (n.textContent ?? '').trim() })));
    expect(headings.filter((h) => h.level === 1).length, 'exactly one h1').toBe(1);
    expect(headings.every((h) => h.text.length > 0), 'no empty headings').toBe(true);
    headings.forEach((heading, index) => {
      if (index > 0) expect(heading.level - headings[index - 1].level, `heading order at "${heading.text}"`).toBeLessThanOrEqual(1);
    });

    // Urdu has no localized URLs yet, so no hreflang and an English document: the in-page language switch is a
    // convenience, not an SEO surface (decide the URL architecture with reviewed copy before adding either).
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // Images have alt text (empty alt is allowed only for decoration).
    const missingAlt = await page.locator('img:not([alt])').count();
    expect(missingAlt, 'images without an alt attribute').toBe(0);

    // JSON-LD: valid, verified facts only.
    const ldText = await page.locator('script[type="application/ld+json"]').allTextContents();
    if (indexable) {
      expect(ldText.length).toBeGreaterThan(0);
      for (const block of ldText) {
        const graph = JSON.parse(block)['@graph'] as Array<Record<string, unknown>>;
        expect(JSON.stringify(graph)).not.toMatch(/TODO|To be confirmed/i);
        expect(graph.some((node) => node.offers || node.aggregateRating || node.review), 'no invented offers or reviews').toBe(false);
      }
    }

    // Internal links resolve (same origin, 200 or a prerendered page).
    const hrefs = await page.locator('a[href^="/"]').evaluateAll((nodes) => [...new Set(nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href')!.split('#')[0]))]);
    for (const href of hrefs.filter((h) => h && !h.startsWith('//'))) {
      const response = await request.get(href);
      expect(response.status(), `link ${href} on ${path}`).toBeLessThan(400);
    }
  });
}

test('Organization schema uses the PNG logo and the single origin', async ({ page, request }) => {
  await page.goto('/');
  const graph = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!)['@graph'] as Array<Record<string, any>>;
  const org = graph.find((node) => node['@type'] === 'Organization')!;
  expect(org.logo.url).toBe(`${ORIGIN}/brand/logo.png`);
  expect((await request.get('/brand/logo.png')).status()).toBe(200);
  expect(org.url).toBe(ORIGIN);
  // Every absolute URL in every JSON-LD block uses that one origin.
  const urls = JSON.stringify(graph).match(/https?:\/\/[^"]+/g) ?? [];
  for (const url of urls) expect(url.startsWith(ORIGIN), url).toBe(true);
});
