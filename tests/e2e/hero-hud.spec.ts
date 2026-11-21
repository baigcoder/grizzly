import { expect, test, type Page } from '@playwright/test';

/**
 * The hero HUD (flavor title, slider, scroll hint) is anchored to the bottom edge and rises by the storage notice's
 * height, while the limited-edition card sits bottom-right. Regressions this guards: the notice height counted twice
 * (the hint was padded as well as the HUD lifted, so the title rode 2× too high and the 3D can ended up behind it), and
 * the card covering the right end of the slider on laptop widths.
 */
type Box = { top: number; bottom: number; left: number; right: number; height: number };
const box = (page: Page, selector: string) =>
  page.evaluate((query): Box => {
    const r = document.querySelector(query)!.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
  }, selector);
const overlaps = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

for (const size of [
  { width: 1915, height: 893 },
  { width: 1440, height: 900 },
]) {
  test(`hero HUD stays clear of the notice and the limited card at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-loader', 'complete', { timeout: 60_000 });
    await expect(page.locator('.cookie-notice')).toBeVisible();
    await expect(page.locator('.limited-teaser')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500); // the cards' entrance and the refits settle

    const [teaser, slider, title, hint, notice] = await Promise.all(
      ['.limited-teaser', '.flavor-slider', '.hero__title-wrap', '.hero__scroll-hint', '.cookie-notice'].map((selector) => box(page, selector))
    );
    // the notice height is counted once: the hint keeps its own line height instead of being padded by the bar
    expect(hint.height).toBeLessThan(40);
    for (const [name, part] of [['slider', slider], ['title', title], ['hint', hint]] as const) {
      expect(overlaps(part, teaser), `${name} under the limited card`).toBe(false);
      expect(overlaps(part, notice), `${name} under the storage notice`).toBe(false);
    }

    // dismissing the notice lowers the HUD by exactly the space the bar took (once), not twice
    const noticeSpace = Number.parseFloat(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--notice-h')));
    await page.getByRole('button', { name: /got it/i }).click();
    await expect(page.locator('.cookie-notice')).toHaveCount(0);
    await page.waitForTimeout(800);
    const after = await box(page, '.hero__title-wrap');
    expect(Math.abs(after.top - title.top - noticeSpace)).toBeLessThanOrEqual(2);
  });
}
