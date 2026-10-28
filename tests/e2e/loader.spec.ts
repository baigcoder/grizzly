import { expect, test } from '@playwright/test';

/**
 * Route-aware loader: only the home story gets the cinematic loader, a product page a short plain one,
 * everything else none. Every route is hit directly (hard load) and must never deadlock.
 */
const NO_LOADER = ['/shop', '/cart', '/checkout', '/mix', '/halal-zamzam', '/about', '/stores', '/privacy', '/definitely-not-a-page'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('grizzly_notice_v1', '1'));
});

for (const route of NO_LOADER) {
  test(`hard load ${route}: no loader, content is visible straight away`, async ({ page }) => {
    // Never let the 3D chunk finish: the page must not wait for it.
    await page.route('**/assets/sceneManager-*.js', (r) => r.abort());
    await page.goto(route);
    await expect(page.locator('main h1').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('progressbar', { name: 'Loading Grizzly Energy' })).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-loader', 'none');
  });
}

test('hard load /: cinematic loader runs its lifecycle and leaves nothing behind', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const seen = new Set<string>();
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => document.documentElement.dataset.loader ?? 'boot');
    seen.add(state);
    if (state === 'complete') break;
    await page.waitForTimeout(40);
  }
  expect([...seen], `loader states seen: ${[...seen].join(', ')}`).toContain('complete');
  expect(seen.has('loading') || seen.has('ready'), `states: ${[...seen].join(', ')}`).toBe(true);
  await expect(page.locator('.loader')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-loading', 'true');
  // One canvas, one scene: no duplicate stage after the loader.
  await expect(page.locator('canvas.webgl-canvas')).toHaveCount(1);
});

test('hard load a product page: short loader, then the page', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/products/mango-fuego');
  await expect(page.locator('html')).toHaveAttribute('data-loader', 'complete', { timeout: 40_000 });
  await expect(page.getByRole('heading', { level: 1, name: /MANGO\s*FUEGO/i })).toBeVisible();
});

test('a product page whose 3D chunk fails still opens (no deadlock) and the shop works', async ({ page }) => {
  test.setTimeout(90_000);
  await page.route('**/assets/sceneManager-*.js', (r) => r.abort());
  await page.goto('/products/peach');
  await expect(page.locator('html')).toHaveAttribute('data-loader', 'complete', { timeout: 20_000 });
  await page.getByRole('button', { name: /add to bag/i }).first().click();
  await expect(page.getByRole('button', { name: /^Bag, 1 item/ })).toBeVisible();
});

test('navigating between routes never brings the loader back or doubles the canvas', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-loader', 'complete', { timeout: 40_000 });
  await page.locator('#profile').getByRole('link', { name: /View details and order/ }).click();
  await expect(page).toHaveURL(/\/products\//);
  await expect(page.locator('.loader')).toHaveCount(0);
  await page.goBack();
  await expect(page.locator('.loader')).toHaveCount(0);
  await expect(page.locator('canvas.webgl-canvas')).toHaveCount(1);
});
