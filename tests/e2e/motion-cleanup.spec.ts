import { expect, test, type Page } from '@playwright/test';

/**
 * Window and document listeners must not pile up as the visitor moves around: after one full pass through the
 * routes, further passes add nothing (route enter, route exit, scene reuse). The shop (a plain page) must hold no
 * scroll listener at all, and the home story keeps a small, bounded set.
 */
async function ready(page: Page) {
  await expect(page.getByRole('progressbar', { name: 'Loading Grizzly Energy' })).toBeHidden({ timeout: 40_000 });
}

const live = (page: Page) => page.evaluate(() => (window as unknown as { __live: () => Record<string, number> }).__live());

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('grizzly_notice_v1', '1');
    const live = new Map<string, Set<unknown>>();
    const name = (target: unknown) => (target === window ? 'window' : target === document ? 'document' : null);
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
      const owner = name(this);
      if (owner) {
        const key = `${owner}:${type}`;
        if (!live.has(key)) live.set(key, new Set());
        live.get(key)!.add(listener);
      }
      return add.call(this, type, listener as EventListener, options);
    } as typeof add;
    EventTarget.prototype.removeEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
      const owner = name(this);
      if (owner) live.get(`${owner}:${type}`)?.delete(listener);
      return remove.call(this, type, listener as EventListener, options);
    } as typeof remove;
    (window as unknown as { __live: () => Record<string, number> }).__live = () => Object.fromEntries([...live].map(([key, set]) => [key, set.size] as const).filter(([, count]) => count > 0));
  });
});

test('route cycles leave no extra window/document listeners; plain pages hold no scroll listener', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1100, height: 620 });
  await page.goto('/');
  await ready(page);

  const cycle = async () => {
    await page.locator('#profile').getByRole('link', { name: /View details and order/ }).click();
    await expect(page).toHaveURL(/\/products\//);
    await page.waitForTimeout(1500);
    await page.goBack();
    await expect(page.locator('.hero')).toBeVisible();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.locator('#site-menu').getByRole('link', { name: 'Range' }).click();
    await expect(page).toHaveURL(/\/shop$/);
    await page.waitForTimeout(1000);
    const onShop = await live(page);
    expect(onShop['window:scroll'] ?? 0, 'scroll listeners on the shop').toBe(0);
    await page.goBack();
    await expect(page.locator('.hero')).toBeVisible();
    await page.waitForTimeout(500);
  };

  await cycle(); // warm: everything created once
  const warm = await live(page);
  await cycle();
  await cycle();
  const after = await live(page);

  for (const key of new Set([...Object.keys(warm), ...Object.keys(after)])) {
    expect(after[key] ?? 0, `${key} grew from ${warm[key] ?? 0} to ${after[key] ?? 0}`).toBeLessThanOrEqual(warm[key] ?? 0);
  }
  // Bounded on the home story (measured: scroll 3, resize 6, wheel 2).
  expect(after['window:scroll'] ?? 0).toBeLessThanOrEqual(5);
  expect(after['window:resize'] ?? 0).toBeLessThanOrEqual(8);
});
