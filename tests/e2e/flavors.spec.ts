import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Flavor consistency. For each of the six flavors: the product page, the html[data-flavor] theme and the
 * resolved accent colour all match grizzly.json, and cycling the home carousel keeps the theme in step with the
 * flavor on screen. Peach is checked by name because the audit saw a pink accent on a Peach screen once.
 */
const data = JSON.parse(readFileSync('src/data/grizzly.json', 'utf8')) as {
  flavors: Array<{ slug: string; name: string; accent: string; lines: string[] }>;
};

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

async function ready(page: Page) {
  await expect(page.getByRole('progressbar', { name: 'Loading Grizzly Energy' })).toBeHidden({ timeout: 40_000 });
}

/** The accent colour the page actually renders with (resolves the token chain through a probe element). */
const resolvedAccent = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.color = 'var(--color-accent)';
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('grizzly_notice_v1', '1');
  });
});

for (const flavor of data.flavors) {
  test(`product page ${flavor.name}: name, theme and accent match the data`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`/products/${flavor.slug}`);
    await ready(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(new RegExp(flavor.lines.join('\\s*'), 'i'));
    await expect(page.locator('html')).toHaveAttribute('data-flavor', flavor.slug);
    expect(await resolvedAccent(page), `${flavor.name} accent`).toBe(rgb(flavor.accent));
    await expect(page).toHaveTitle(new RegExp(flavor.name, 'i'));
    await expect(page.locator('.pdp[data-accent]')).toBeVisible();
  });
}

test('home carousel: the theme follows the flavor in focus, all six, Peach included', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await ready(page);
  const seen: string[] = [];
  for (let step = 0; step < data.flavors.length; step += 1) {
    const expected = data.flavors[step];
    await expect(page.locator('html')).toHaveAttribute('data-flavor', expected.slug, { timeout: 60_000 });
    // The hero title and the accent agree with the theme once the carousel has settled.
    await expect(page.locator('.hero__title-wrap')).toContainText(expected.lines[0], { ignoreCase: true, timeout: 30_000 });
    // The accent crossfades for about a second after data-flavor flips (by design), so wait for it to settle.
    await expect.poll(() => resolvedAccent(page), { message: `${expected.name} accent while in focus`, timeout: 30_000 }).toBe(rgb(expected.accent));
    seen.push(expected.slug);
    await page.getByRole('button', { name: 'Next flavor' }).click();
  }
  expect(seen).toEqual(data.flavors.map((flavor) => flavor.slug));
});
