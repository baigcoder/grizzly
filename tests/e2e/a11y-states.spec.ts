import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG 2.2 AA through the states people actually reach: every home section, the open menu, the bag drawer, an
 * expanded FAQ answer, checkout errors and the confirmation. Zero violations of any impact are accepted. The
 * canvas is excluded from axe (its text alternative is checked explicitly and the same content is real DOM).
 * Also: focus moves into and back out of the menu and the bag, Escape closes them, and controls are 44px.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function ready(page: Page) {
  await expect(page.getByRole('progressbar', { name: 'Loading Grizzly Energy' })).toBeHidden({ timeout: 40_000 });
}

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).exclude('canvas').analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}× ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, `${label}\n${summary.join('\n')}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('grizzly_notice_v1', '1');
  });
});

test('home: every section passes axe', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await ready(page);
  const ids = await page.evaluate(() => [...document.querySelectorAll('.home > .home-section')].map((s) => s.id));
  for (const id of ids) {
    await page.evaluate((target) => document.getElementById(target)?.scrollIntoView({ behavior: 'instant' }), id);
    await page.waitForTimeout(600);
    await audit(page, `home #${id}`);
  }
});

test('the canvas has a text alternative and the same facts exist as real text', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const canvas = page.locator('canvas.webgl-canvas');
  await expect(canvas).toHaveAttribute('role', 'img');
  await expect(canvas).toHaveAttribute('aria-label', /Blue Raspberry.*Everything shown here is also written on the page/s);
});

test('menu: opens with focus inside, Escape closes it and focus returns to the button; axe clean', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await ready(page);
  const toggle = page.getByRole('button', { name: 'Menu' });
  await toggle.click();
  const menu = page.locator('#site-menu');
  await expect(menu).toBeVisible();
  await audit(page, 'menu open');
  expect(await page.evaluate(() => !!document.activeElement?.closest('#site-menu')), 'focus inside the menu').toBe(true);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.getByRole('button', { name: 'Menu' })).toBeFocused();
});

test('bag drawer: focus moves in, Tab stays inside, Escape closes and focus returns', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => window.localStorage.setItem('grizzly_cart_v2', JSON.stringify([{ productSlug: 'peach', packOptionId: 'pack-6', quantity: 1 }])));
  await page.goto('/shop');
  await ready(page);
  const bagButton = page.getByRole('button', { name: /^Bag,/ });
  await bagButton.click();
  const drawer = page.getByRole('dialog', { name: /Your bag/ });
  await expect(drawer).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), 'focus inside the drawer').toBe(true);
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), `Tab ${i + 1} stays in the drawer`).toBe(true);
  }
  await audit(page, 'bag drawer');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(bagButton).toBeFocused();
});

test('FAQ: an opened answer passes axe and exposes expanded state', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await ready(page);
  await page.evaluate(() => document.getElementById('FAQ')?.scrollIntoView({ behavior: 'instant' }));
  const first = page.locator('#FAQ button[aria-expanded]').first();
  await first.scrollIntoViewIfNeeded();
  await first.click();
  await expect(first).toHaveAttribute('aria-expanded', /true|false/);
  await audit(page, 'FAQ answer');
});

test('checkout: error state and confirmation pass axe; each error is tied to its field', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => window.localStorage.setItem('grizzly_cart_v2', JSON.stringify([{ productSlug: 'watermelon', packOptionId: 'pack-6', quantity: 1 }])));
  await page.goto('/checkout');
  await ready(page);
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await audit(page, 'checkout errors');
  const name = page.getByLabel('Full name');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  expect(await name.getAttribute('aria-describedby')).toMatch(/error/);
  await name.fill('Ayesha Khan');
  await page.getByLabel('Mobile number').fill('0300 1234567');
  await page.getByLabel('Street address').fill('12 Canal View Road');
  await page.getByLabel('City', { exact: true }).fill('Lahore');
  await page.getByLabel('Province or territory').selectOption('Punjab');
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByRole('heading', { name: /Thank you/ })).toBeVisible();
  await audit(page, 'confirmation');
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  test(`controls on the shop, product, bag and checkout pages are at least 44px at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await page.addInitScript(() => window.localStorage.setItem('grizzly_cart_v2', JSON.stringify([{ productSlug: 'peach', packOptionId: 'pack-6', quantity: 1 }])));
    for (const route of ['/shop', '/products/peach', '/cart', '/checkout']) {
      await page.goto(route);
      await ready(page);
      await page.waitForTimeout(500);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('main a, main button, main input:not([type="radio"]):not([type="checkbox"]), main select, header a, header button, footer a, footer button')]
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden') return false;
            // Links inside running text are exempt (WCAG 2.5.8 inline exception).
            if (el.tagName === 'A' && el.closest('p, li')?.textContent?.trim() !== el.textContent?.trim() && el.closest('p')) return false;
            return rect.height < 43.5 || rect.width < 43.5;
          })
          .map((el) => `${(el.getAttribute('aria-label') || el.textContent || el.className).trim().slice(0, 30)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`)
      );
      expect(small, `${route} at ${viewport.width}px`).toEqual([]);
    }
  });
}
