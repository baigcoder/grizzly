#!/usr/bin/env node
/**
 * Social preview images (1200×630) and share posters (1080×1350, the "Share poster"
 * button on the product page) per flavor: the label front on its accent
 * background with the wordmark and tagline. Re-run after build-labels.mjs.
 *   node scripts/build-social.mjs
 */
import { chromium } from 'playwright';
import { localFontCss } from './local-fonts.mjs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fontCss = await localFontCss();
const data = JSON.parse(await readFile(resolve(root, 'src/data/grizzly.json'), 'utf8'));
const outDir = resolve(root, 'public/social');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const flavor of data.flavors) {
  const front = await readFile(resolve(root, `assets/label-front/${flavor.slug}-front.png`));
  await page.setContent(`<!doctype html><html><head>
  ${fontCss}
  <style>
    body { margin: 0; width: 1200px; height: 630px; overflow: hidden; font-family: Geist, sans-serif; color: #fff;
      background: radial-gradient(60% 80% at 70% 60%, ${flavor.accent} 0%, ${flavor.accentDeep} 55%, #000 100%); }
    .can { position: absolute; right: 170px; top: 40px; height: 550px; border-radius: 22px; box-shadow: 0 30px 80px #0009; transform: rotate(6deg); }
    .copy { position: absolute; left: 80px; top: 150px; width: 520px; }
    .mark { font: italic 900 92px/0.85 'Libre Franklin'; text-transform: uppercase; }
    .mark span { display: block; color: ${flavor.accent}; margin-left: 40px; font-size: 66px; filter: brightness(1.25); }
    .flavor { margin-top: 36px; font: italic 900 44px/1 'Libre Franklin'; text-transform: uppercase; }
    .tag { margin-top: 14px; font-size: 22px; letter-spacing: 6px; text-transform: uppercase; opacity: .85; }
  </style></head><body>
  <img class="can" src="data:image/png;base64,${front.toString('base64')}">
  <div class="copy">
    <div class="mark">${data.brand.wordmark[0]}<span>${data.brand.wordmark[1]}</span></div>
    <div class="flavor">${flavor.name}</div>
    <div class="tag">${data.brand.tagline}</div>
  </div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(outDir, `${flavor.slug}.png`) });
  console.log(`✓ social/${flavor.slug}.png`);
}

const poster = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
for (const flavor of data.flavors) {
  const front = await readFile(resolve(root, `assets/label-front/${flavor.slug}-front.png`));
  await poster.setContent(`<!doctype html><html><head>
  ${fontCss}
  <style>
    body { margin: 0; width: 1080px; height: 1350px; overflow: hidden; font-family: Geist, sans-serif; color: #fff;
      background: radial-gradient(70% 55% at 50% 52%, ${flavor.accent} 0%, ${flavor.accentDeep} 52%, #000 100%); }
    .ghost { position: absolute; left: -40px; right: -40px; top: 420px; font: italic 900 330px/0.8 'Libre Franklin';
      text-transform: uppercase; text-align: center; color: #ffffff10; letter-spacing: -6px; }
    .can { position: absolute; left: 50%; top: 170px; height: 860px; transform: translateX(-50%) rotate(-7deg);
      border-radius: 30px; box-shadow: 0 50px 120px #000c, 0 0 160px ${flavor.accent}66; }
    .top { position: absolute; top: 64px; left: 0; right: 0; text-align: center; font: italic 900 64px/0.9 'Libre Franklin'; text-transform: uppercase; }
    .top span { color: ${flavor.accent}; filter: brightness(1.3); }
    .bottom { position: absolute; bottom: 70px; left: 0; right: 0; text-align: center; }
    .flavor { font: italic 900 92px/0.95 'Libre Franklin'; text-transform: uppercase; }
    .tag { margin-top: 18px; font-size: 26px; letter-spacing: 9px; text-transform: uppercase; opacity: .85; }
  </style></head><body>
  <div class="ghost">${data.brand.wordmark[0]}</div>
  <div class="top">${data.brand.wordmark[0]} <span>${data.brand.wordmark[1]}</span></div>
  <img class="can" src="data:image/png;base64,${front.toString('base64')}">
  <div class="bottom"><div class="flavor">${flavor.name}</div><div class="tag">${data.brand.tagline}</div></div>
  </body></html>`);
  await poster.evaluate(() => document.fonts.ready);
  await poster.screenshot({ path: resolve(outDir, `${flavor.slug}-poster.jpg`), type: 'jpeg', quality: 88 });
  console.log(`✓ social/${flavor.slug}-poster.jpg`);
}
await browser.close();
