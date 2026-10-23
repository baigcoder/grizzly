/**
 * Review aid for the site's /film page: serves this worktree with Vite, opens /film in headless Chromium at desktop and
 * phone sizes, exercises the player (play, chapter jump, scrub) and writes screenshots + console errors to out/film-page/.
 *   node tools/film-page-review.mjs
 */
// the site's own Vite (the worktree root), not the plate page's
const { createServer } = await import(new URL('../../node_modules/vite/dist/node/index.js', import.meta.url).href);
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = resolve(here, '../out/film-page');
mkdirSync(out, { recursive: true });
const tmp = resolve(here, '../.cache/tmp');
process.env.TEMP = tmp;
process.env.TMP = tmp;

const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { port: 5193, watch: null }, cacheDir: resolve(here, '../.cache/vite-site') });
await server.listen();
const base = 'http://localhost:5193';
const browser = await chromium.launch({
  headless: true,
  executablePath: resolve(process.env.LOCALAPPDATA ?? '', 'ms-playwright/chromium-1248/chrome-win64/chrome.exe'),
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];

for (const [name, viewport, mobile] of [
  ['desktop', { width: 1440, height: 900 }, false],
  ['phone', { width: 390, height: 844 }, true],
]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${name}] ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message}`));
  await page.goto(`${base}/film`, { waitUntil: 'load' });
  await page.waitForSelector('.film-player', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: resolve(out, `${name}-1-top.png`) });
  await page.screenshot({ path: resolve(out, `${name}-0-full.png`), fullPage: true });
  // play: the start button, then let it run
  await page.click('.film-player__start');
  await page.waitForTimeout(3500);
  await page.locator('.film-player').screenshot({ path: resolve(out, `${name}-2-playing.png`) });
  // jump to a chapter from the rail
  await page.locator('.film-rail__button').nth(5).scrollIntoViewIfNeeded();
  await page.locator('.film-rail__button').nth(5).click();
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => {
    const v = document.querySelector('.film-player__video');
    return { time: v.currentTime.toFixed(2), paused: v.paused, current: document.querySelector('.film-rail__item.is-current .film-rail__title')?.textContent, src: v.currentSrc.split('/').pop() };
  });
  console.log(name, 'after chapter jump', JSON.stringify(state));
  await page.locator('.film-page__chapters').screenshot({ path: resolve(out, `${name}-3-chapters.png`) });
  await page.locator('.film-player').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.locator('.film-player').screenshot({ path: resolve(out, `${name}-4-zamzam.png`) });
  // wake the controls (they fade while the pointer rests) and capture the bar
  const box = await page.locator('.film-player').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 10);
  await page.waitForTimeout(500);
  await page.locator('.film-player').screenshot({ path: resolve(out, `${name}-4b-controls.png`) });
  // the teaser phone and the press kit
  await page.locator('.film-page__formats').scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  await page.locator('.film-page__formats').screenshot({ path: resolve(out, `${name}-5-formats.png`) });
  await page.locator('.film-page__press').screenshot({ path: resolve(out, `${name}-6-press.png`) });
  await context.close();
}
writeFileSync(resolve(out, 'console-errors.txt'), errors.join('\n'));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
await server.close();
