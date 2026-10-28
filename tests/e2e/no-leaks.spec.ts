import { expect, test } from '@playwright/test';

/** No placeholder, other-brand or broken-value text reaches any page a visitor can open. */
const ROUTES = ['/', '/shop', '/mix', '/halal-zamzam', '/about', '/stores', '/privacy', '/cart', '/checkout', '/products/peach', '/products/blackout-berry', '/nope'];
const BAD = /\bTODO\b|lorem|ipsum|ciao|\bundefined\b|\bNaN\b|\[object |\bnull\b|\{\{|Placeholder text/i;

test('no placeholder, other-brand or broken text on any route (text, alt, aria-label, title)', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    window.localStorage.setItem('grizzly_notice_v1', '1');
  });
  for (const route of ROUTES) {
    await page.goto(route);
    await expect(page.getByRole('progressbar', { name: 'Loading Grizzly Energy' })).toBeHidden({ timeout: 40_000 });
    await page.waitForTimeout(500);
    const text = await page.evaluate(() => {
      const parts: string[] = [document.title, document.body.innerText, document.body.textContent ?? ''];
      document.querySelectorAll('[alt],[aria-label],[title],[placeholder]').forEach((el) => {
        for (const name of ['alt', 'aria-label', 'title', 'placeholder']) {
          const value = el.getAttribute(name);
          if (value) parts.push(value);
        }
      });
      return parts.join('\n');
    });
    const match = text.match(BAD);
    expect(match, `${route} contains "${match?.[0]}" near: ${match ? text.slice(Math.max(0, match.index! - 40), match.index! + 60).replace(/\s+/g, ' ') : ''}`).toBeNull();
  }
});
