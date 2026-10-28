import { expect, test, type Page } from '@playwright/test';

/**
 * Navigating around must not leak: one canvas, one scene, and GPU resource counts (geometries, textures) that
 * stop growing once every route has been visited. Reads three.js' own renderer.info through the debug hook.
 */
async function ready(page: Page) {
  await expect(page.getByRole('progressbar', { name: 'Loading Grizzly Energy' })).toBeHidden({ timeout: 40_000 });
}

const resources = (page: Page) =>
  page.evaluate(() => {
    const scene = (window as unknown as { __GRIZZLY_SCENE__?: { renderer: { info: { memory: { geometries: number; textures: number } } } } }).__GRIZZLY_SCENE__;
    return scene ? { geometries: scene.renderer.info.memory.geometries, textures: scene.renderer.info.memory.textures } : null;
  });

test('route cycles do not leak canvases, geometries or textures', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    window.localStorage.setItem('grizzly_notice_v1', '1');
  });
  await page.goto('/');
  await ready(page);

  const cycle = async () => {
    await page.locator('#profile').getByRole('link', { name: /View product/ }).click();
    await expect(page).toHaveURL(/\/products\//);
    await page.waitForTimeout(1500);
    await page.goBack();
    await expect(page.locator('.hero')).toBeVisible();
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.locator('#site-menu').getByRole('link', { name: 'Range' }).click();
    await expect(page).toHaveURL(/\/shop$/);
    await page.waitForTimeout(1000);
    await page.goBack();
    await expect(page.locator('.hero')).toBeVisible();
  };

  await cycle(); // visit everything once so lazily created resources exist
  const warm = await resources(page);
  expect(warm, 'debug hook present').not.toBeNull();
  await cycle();
  await cycle();
  const after = await resources(page);
  await expect(page.locator('canvas.webgl-canvas')).toHaveCount(1);
  expect(after!.geometries, `geometries ${warm!.geometries} -> ${after!.geometries}`).toBeLessThanOrEqual(warm!.geometries + 2);
  expect(after!.textures, `textures ${warm!.textures} -> ${after!.textures}`).toBeLessThanOrEqual(warm!.textures + 4);
});
