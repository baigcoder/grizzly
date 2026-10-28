import { expect, test, type Page } from '@playwright/test';

/**
 * Regression for the measured mobile bug: a 390px phone reported a 457px document, which pushed the
 * header bag off-screen and parked the storage notice below the fold. The cause was a pseudo-element,
 * so the check reads the document width (not a clipped body) and the real position of header controls.
 */
const WIDTHS = [320, 360, 390, 430, 1366, 1920];
const ROUTES = ['/', '/shop', '/products/peach', '/mix', '/halal-zamzam', '/about', '/stores', '/privacy', '/cart', '/checkout', '/nope'];

async function ready(page: Page) {
  await expect(page.getByRole('progressbar', { name: 'Loading Grizzly Energy' })).toBeHidden({ timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('grizzly_notice_v1', '1'));
});

for (const width of WIDTHS) {
  test(`no horizontal overflow at ${width}px, header controls on screen`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width, height: 800 });
    for (const route of ROUTES) {
      await page.goto(route);
      await ready(page);
      const metrics = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(metrics.scroll, `${route} at ${width}px: document is ${metrics.scroll}px wide`).toBeLessThanOrEqual(metrics.inner + 1);

      const bag = page.getByRole('button', { name: /^Bag,/ });
      const box = await bag.boundingBox();
      expect(box, `${route}: bag button has a box`).not.toBeNull();
      expect(box!.x, `${route}: bag left edge`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${route}: bag right edge at ${width}px`).toBeLessThanOrEqual(width + 1);
    }
  });
}

test('home sections keep copy inside the screen on a phone', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page);
  const sections = await page.locator('.home > .home-section').count();
  for (let i = 0; i < sections; i++) {
    const y = await page.evaluate((index) => {
      const el = document.querySelectorAll('.home > .home-section')[index] as HTMLElement;
      return el.getBoundingClientRect().top + window.scrollY;
    }, i);
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    await page.waitForTimeout(300);
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.section-copy, .section-copy__title, .hero__title-wrap, .faq__title')]
        .filter((el) => el.offsetWidth > 0)
        .map((el) => ({ cls: el.className, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.left < -1 || r.right > window.innerWidth + 1)
        .map(({ cls, r }) => `${cls} ${Math.round(r.left)}..${Math.round(r.right)}`)
    );
    expect(clipped, `section ${i} clips text`).toEqual([]);
  }
});
