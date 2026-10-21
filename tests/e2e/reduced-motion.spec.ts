import { expect, test, type Page } from '@playwright/test';

/**
 * prefers-reduced-motion: reduce (the project's Playwright default). No decorative loops, no smooth-scroll
 * engine, no fly-to-bag, the light render tier, and the shop still works.
 */
test.use({ reducedMotion: 'reduce' });

async function ready(page: Page) {
  await expect(page.getByRole('progressbar', { name: 'Loading Grizzly Energy' })).toBeHidden({ timeout: 40_000 });
}

/** Infinite CSS/WAAPI animations that are actually running. */
const loops = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity)
      .map((a) => `${(a as CSSAnimation).animationName ?? a.id} on ${(a.effect as KeyframeEffect).target?.className?.toString().slice(0, 40)}`)
  );

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('grizzly_notice_v1', '1');
  });
});

for (const route of ['/', '/shop', '/products/peach', '/checkout']) {
  test(`reduced motion ${route}: no infinite animation is running`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(route);
    await ready(page);
    await page.waitForTimeout(800);
    expect(await loops(page)).toEqual([]);
  });
}

test('reduced motion: no smooth-scroll engine, no scene intro, light tier', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await ready(page);
  await expect(page.locator('html.lenis')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-quality', 'MEDIUM');
  // The pointer ring never turns on: it stays at its resting state.
  const ring = await page.evaluate(() => {
    const el = document.querySelector('.cursor-ring');
    if (!el) return 'absent';
    const style = getComputedStyle(el);
    return style.display === 'none' || Number(style.opacity) === 0 ? 'hidden' : 'shown';
  });
  expect(['absent', 'hidden']).toContain(ring);
});

test('reduced motion: add to bag works without the flying can', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/products/peach');
  await ready(page);
  await page.getByRole('button', { name: /add to bag/i }).first().click();
  await expect(page.getByRole('button', { name: /^Bag, 1 item/ })).toBeVisible();
  await expect(page.locator('.fly-can')).toHaveCount(0);
  await expect(page.locator('#pdp-status')).toContainText('added to your bag');
});
