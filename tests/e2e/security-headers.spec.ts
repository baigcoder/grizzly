import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * public/_headers is the single source of the security headers. This applies its Content-Security-Policy and the
 * other headers to every response, then checks the site still works under them: WebGL renders, KTX2 textures
 * decode in their workers, fonts load, the shop runs, and the browser reports no policy violation.
 */
const headersFile = readFileSync('public/_headers', 'utf8').replace(/\r\n/g, '\n'); // CRLF checkouts on Windows
const globalBlock = headersFile.split(/\n\/\*\n/)[1].split(/\n\n/)[0];
const headers: Record<string, string> = {};
for (const line of globalBlock.split('\n')) {
  const match = line.match(/^\s+([A-Za-z-]+):\s*(.+)$/);
  if (match) headers[match[1].toLowerCase()] = match[2];
}

test('_headers defines the expected security headers', () => {
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['permissions-policy']).toContain('camera=()');
  const csp = headers['content-security-policy'];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp, 'no wildcard sources').not.toMatch(/\*/);
  // Scripts only from this origin. 'unsafe-eval' is there for one reason: the Basis (KTX2) transcoder is Emscripten
  // code that builds functions from strings in its worker, which inherits this policy. Without it the compressed
  // labels never decode (src/webgl/labelTextures.ts then falls back to the full-size images). No inline scripts.
  expect(csp).toContain("script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval';");
  expect(csp, 'no inline scripts').not.toMatch(/script-src[^;]*'unsafe-inline'/);
});

async function underHeaders(page: Page) {
  // Only the site's own responses get the headers (an external request is the CSP's to block, not ours to fetch).
  await page.route((url) => url.hostname === 'localhost', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), ...headers } });
  });
  const violations: string[] = [];
  await page.exposeFunction('__csp', (message: string) => violations.push(message));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { __csp: (message: string) => void }).__csp(`${event.violatedDirective} blocked ${event.blockedURI}`);
    });
    window.localStorage.setItem('grizzly_notice_v1', '1');
  });
  return violations;
}

test('under the CSP: home renders WebGL, decodes KTX2 textures, loads fonts, with no violation', async ({ page }) => {
  test.setTimeout(120_000);
  const violations = await underHeaders(page);
  const failedRequests: string[] = [];
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByRole('progressbar', { name: 'Loading Grizzly Energy' })).toBeHidden({ timeout: 60_000 });
  // The scene is up: a WebGL context exists and every flavor's 1k label decoded through the KTX2 worker into a
  // GPU-compressed texture (counting textures was not enough: the dark placeholders count too).
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __GRIZZLY_SCENE__?: unknown }).__GRIZZLY_SCENE__), { timeout: 30_000 }).toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          type Maps = { lod: number; albedo: { isCompressedTexture?: boolean } };
          const labels = (window as unknown as { __GRIZZLY_SCENE__: { labels: { maps: Maps[] } } }).__GRIZZLY_SCENE__.labels;
          return labels.maps.every((maps) => maps.lod >= 0 && maps.albedo.isCompressedTexture === true);
        }),
      { timeout: 30_000 }
    )
    .toBe(true);
  expect(await page.evaluate(() => document.fonts.check("italic 900 20px 'Libre Franklin'"))).toBe(true);
  expect(violations, 'CSP violations').toEqual([]);
  expect(failedRequests, 'failed requests').toEqual([]);
  expect(errors.filter((text) => /Content Security Policy|Refused to/i.test(text)), 'CSP console errors').toEqual([]);
});

test('under the CSP: the shop works (add to bag, checkout confirmation) and the poster fetch is allowed', async ({ page }) => {
  test.setTimeout(120_000);
  const violations = await underHeaders(page);
  await page.goto('/products/peach');
  await expect(page.getByRole('progressbar', { name: 'Loading Grizzly Energy' })).toBeHidden({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Add to bag' }).first().click();
  await expect(page.getByRole('button', { name: /^Bag, 1 item/ })).toBeVisible();
  await page.getByRole('button', { name: 'Share poster' }).click();
  await expect(page.locator('.pdp-share__status')).toContainText(/saved|Thanks/, { timeout: 20_000 });
  expect(violations, 'CSP violations').toEqual([]);
});

test('every page can be framed by nobody and sniffed by nobody (headers present on the response)', async ({ request }) => {
  // The preview server does not apply _headers, so this checks the file maps every route: one global block.
  expect(headersFile).toMatch(/^\/\*$/m);
  expect(headersFile).toContain('/assets/*\n  Cache-Control: public, max-age=31536000, immutable');
  expect(headersFile).toMatch(/\/\*\.html\n  Cache-Control: public, max-age=0, must-revalidate/);
  expect((await request.get('/')).status()).toBe(200);
});

test('negative control: the policy is really enforced (an external script and image are blocked)', async ({ page }) => {
  test.setTimeout(60_000);
  const violations = await underHeaders(page);
  await page.goto('/privacy');
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.src = 'https://example.com/tracker.js';
    document.head.appendChild(script);
    const image = new Image();
    image.src = 'https://example.com/pixel.png';
  });
  await expect.poll(() => violations.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  expect(violations.join(' | ')).toMatch(/script-src/);
  expect(violations.join(' | ')).toMatch(/img-src/);
});
