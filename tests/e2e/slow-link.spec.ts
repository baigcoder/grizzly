import { expect, test } from '@playwright/test';

/**
 * A thin link (the Network Information API reports 3g, 2g or data saver): the loader must not hold the page behind a
 * black screen until the 3D scene has downloaded. It gives up after a few seconds, the page opens on the same static
 * stage the no-WebGL page uses, and the scene joins when it arrives. The 3D chunk is delayed here to stand in for a slow
 * download; the connection type is faked because Playwright's own throttling does not change navigator.connection.
 */
const SCENE_DELAY_MS = 11_000;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('grizzly_notice_v1', '1');
    Object.defineProperty(navigator, 'connection', { value: { effectiveType: '3g', saveData: false }, configurable: true });
  });
});

test('3g: the loader gives up waiting, the page opens on the static stage, then the scene joins', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/assets/sceneManager-*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SCENE_DELAY_MS));
    await route.continue();
  });
  const started = Date.now();
  await page.goto('/');

  // the loader leaves on its own long before the delayed scene arrives
  await expect(page.locator('html')).toHaveAttribute('data-loader', 'complete', { timeout: 25_000 });
  const waited = Date.now() - started;
  expect(waited, `the loader held the page for ${waited} ms`).toBeLessThan(SCENE_DELAY_MS + 6_000);

  // the page is usable and shows the static stand-in, not an empty black frame
  await expect(page.locator('.hero__title, h1').first()).toBeVisible();
  await expect(page.locator('.fallback-stage')).toHaveCount(1);
  await expect(page.locator('.fallback-stage img')).toBeVisible();

  // the scene arrives: the stand-in goes, one canvas remains, nothing threw
  await expect(page.locator('.fallback-stage')).toHaveCount(0, { timeout: 120_000 });
  await expect(page.locator('canvas.webgl-canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a fast link keeps the cinematic loader and never shows the stand-in', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { value: { effectiveType: '4g', saveData: false }, configurable: true });
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-loader', 'complete', { timeout: 40_000 });
  await expect(page.locator('.fallback-stage')).toHaveCount(0);
  await expect(page.locator('canvas.webgl-canvas')).toHaveCount(1);
});

test('the boot screen is in the HTML before any script runs', async ({ page }) => {
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('.boot')).toBeVisible();
  await expect(page.locator('.boot__top')).toHaveText('GRIZZLY');
});
