/** Reference captures of the current Grizzly site (this worktree), so the film matches its look. Review aid only. */
const { createServer } = await import('file:///F:/ciao-energy-antigravity-spec/node_modules/vite/dist/node/index.js');
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { port: 5199 }, cacheDir: resolve(here, '../out/.vite-site'), resolve: { alias: { '@fontsource/amiri': resolve(root, '../site-polish/node_modules/@fontsource/amiri') } } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: resolve(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1248/chrome-win64/chrome.exe'), args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://localhost:5199/', { waitUntil: 'load' });
await page.waitForTimeout(9000);
const out = resolve(here, '../out/site');
mkdirSync(out, { recursive: true });
const H = await page.evaluate(() => document.documentElement.scrollHeight);
const steps = 10;
for (let i = 0; i < steps; i++) {
  const y = Math.round((H - 900) * i / (steps - 1));
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: resolve(out, `site-${String(i).padStart(2, '0')}.png`) });
}
console.log('height', H);
await browser.close();
await server.close();
