import { expect, test, type Page } from '@playwright/test';

/**
 * Mobile product page: the buying decision is visible on the first screen (flavor, price, a trust
 * signal, an Add to bag control) and nothing important sits under the sticky bar.
 * Baseline from the audit: Add to bag at y≈1284 on an 844px screen.
 */
async function ready(page: Page) {
  await expect(page.getByRole('progressbar', { name: 'Loading Grizzly Energy' })).toBeHidden({ timeout: 30_000 });
}

for (const size of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 430, height: 932 }]) {
  test(`phone ${size.width}x${size.height}: price, trust and Add to bag in the first screen`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => window.localStorage.setItem('grizzly_notice_v1', '1'));
    await page.setViewportSize(size);
    await page.goto('/products/peach');
    await ready(page);

    const inFirstScreen = async (locator: ReturnType<Page['locator']>, label: string) => {
      const box = await locator.boundingBox();
      expect(box, `${label} has a box`).not.toBeNull();
      expect(box!.y + box!.height, `${label} bottom ${box!.y + box!.height} within ${size.height}`).toBeLessThanOrEqual(size.height);
      expect(box!.y, `${label} top`).toBeGreaterThanOrEqual(0);
    };
    await inFirstScreen(page.getByRole('heading', { level: 1 }), 'flavor name');
    await inFirstScreen(page.locator('.pdp-price__total'), 'price');
    await inFirstScreen(page.locator('.trust-badges'), 'trust badges');
    const bar = page.locator('.pdp-buybar.is-visible');
    await expect(bar).toBeVisible();
    await inFirstScreen(bar.getByRole('button', { name: /add to bag/i }), 'sticky Add to bag');
    const barBox = (await bar.boundingBox())!;
    expect(barBox.height).toBeGreaterThanOrEqual(44);
  });
}

test('phone: sticky Add to bag adds the selected pack, shows success and the bag count', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => window.localStorage.setItem('grizzly_notice_v1', '1'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/products/peach');
  await ready(page);
  await page.locator('.pack-option', { hasText: '12 cans' }).click();
  // With the main Add to bag button in view the bar steps aside; back at the top it is there again.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  const bar = page.locator('.pdp-buybar.is-visible');
  await expect(bar).toContainText('12 cans × 1');
  await bar.getByRole('button', { name: /add to bag/i }).click();
  await expect(page.getByRole('button', { name: /^Bag, 1 item/ })).toBeVisible();
  await expect(page.locator('#pdp-status')).toContainText('Peach, 12 cans × 1 added to your bag.');
});

test('phone: keyboard order stays back, pack, quantity, add', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => window.localStorage.setItem('grizzly_notice_v1', '1'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/products/peach');
  await ready(page);
  const tops = await page.evaluate(() => {
    const y = (s: string) => document.querySelector(s)?.getBoundingClientRect().top ?? -1;
    return [y('.pdp-panel .back-link'), y('.pack-picker'), y('.pdp-buy')];
  });
  const sorted = [...tops].sort((a, b) => a - b);
  expect(tops, 'visual order matches DOM/keyboard order').toEqual(sorted);
});

test('phone 360x740: even the limited edition shows its price and Add to bag in the first screen', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => window.localStorage.setItem('grizzly_notice_v1', '1'));
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/products/blackout-berry');
  await ready(page);
  const bar = page.locator('.pdp-buybar.is-visible');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText(/Rs\s?1,400/);
  const box = (await bar.getByRole('button', { name: /add to bag/i }).boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(740);
});
