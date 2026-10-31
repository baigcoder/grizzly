#!/usr/bin/env node
/**
 * Flat can labels (the Canva redesign, rebuilt as code so the type, metal and print details are exact).
 *
 *   node scripts/build-flat-labels.mjs              # all flavors, preview only (assets/label-flat/)
 *   node scripts/build-flat-labels.mjs --install    # also write the runtime maps into public/textures/grizzly/
 *   node scripts/build-flat-labels.mjs peach        # one flavor
 *
 * Same 4096×3206 UV layout as scripts/build-labels.mjs (panels and lit benefit bands from grizzly.json), so the
 * scene needs no change. Three colours per flavor (field, ink, white) plus one metal: the bear and the GRIZZLY
 * wordmark are left as bare aluminium (gold on the collector edition), which the surface map marks metallic and
 * the normal map embosses.
 *
 * Output per flavor:
 *   assets/label-flat/<slug>.png                       albedo preview (lossless)
 *   public/textures/grizzly/<slug>.webp                albedo            (--install)
 *   public/textures/grizzly/<slug>-surface.png         G roughness, B metalness
 *   public/textures/grizzly/<slug>-normal.png          emboss normal map (half size)
 * Then run scripts/build-ktx2.mjs for the GPU-compressed runtime copies.
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { localFontCss } from './local-fonts.mjs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(resolve(root, 'src/data/grizzly.json'), 'utf8'));
const install = process.argv.includes('--install');
const only = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const previewDir = resolve(root, 'assets/label-flat');
const runtimeDir = resolve(root, 'public/textures/grizzly');
await mkdir(previewDir, { recursive: true });

const [W, H] = data.label.size;
const px = (u) => Math.round(u * W);
const bandTop = (v) => Math.round((1 - v) * H); // UV v runs bottom → top
const P = data.label.panels;

// ---------- flavors: palette, plate icon, edition ----------
const SILVER = '#dfe3e8';
const GOLD = '#e6c47e';
const COPPER = '#ebbd93';
const FLAVORS = {
  'blue-raspberry': { field: '#1f9beb', ink: '#0b2c4a', metal: SILVER, icon: 'raspberry' },
  'mango-fuego': { field: '#f29a1d', ink: '#4a2a05', metal: SILVER, icon: 'mango' },
  watermelon: { field: '#e8433a', ink: '#4a1010', metal: SILVER, icon: 'watermelon' },
  'strawberry-kiwi': { field: '#e32b56', ink: '#4a0c1d', metal: SILVER, icon: 'strawberryKiwi' },
  peach: { field: '#f07e37', ink: '#4a2410', metal: SILVER, icon: 'peach' },
  'blackout-berry': { field: '#9b5de5', ink: '#2a1747', metal: SILVER, icon: 'berries', edition: 'LIMITED EDITION' },
  // the collector concept: a night can, falsa pink as the second colour, gold metal, a numbered batch
  'falsa-frost': {
    field: '#241029', ink: '#e8559c', metal: GOLD, icon: 'falsa', edition: 'LIMITED EDITION · BATCH 001',
    name: 'Falsa Frost',
    description: 'Limited edition falsa berry flavored energy drink, sweet-tart and ice cold, with natural caffeine from green coffee beans, B vitamins (B3, B6, B12, biotin, B5) and electrolytes from sea salt. Made with added Zamzam water.',
  },
  // café edition: caramel latte can, espresso ink, milk-white type, copper metal. A milk drink: allergen line, and
  // every nutrition value awaits its own analysis (the energy drink's figures do not apply)
  'cold-coffee': {
    field: '#9a6440', ink: '#22120a', metal: COPPER, icon: 'icedCoffee', edition: 'LIMITED EDITION · CAFÉ BATCH',
    name: 'Cold Coffee', sub: 'WITH MILK', allergen: 'Contains milk.', nutritionTbc: true,
    description: 'Limited edition cold coffee energy drink with milk, natural caffeine from green coffee beans, B vitamins (B3, B6, B12, biotin, B5) and electrolytes from sea salt. Made with added Zamzam water.',
  },
};

// ---------- glyphs (viewBox 0 0 100 100, drawn in currentColor; `cut` paints the plate colour back in) ----------
const FRUIT = {
  peach: `<path d="M50 24c-19 0-33 14-33 34s15 33 33 33 33-14 33-33-14-34-33-34z"/><path class="cut" d="M50 30c-4 9-5 19-3 30 2 10 6 18 3 26-1-9-6-16-7-26s2-21 7-30z"/><path d="M52 26c4-11 14-17 27-16-2 12-12 19-27 16z"/><path d="M50 26c-1-6 0-11 3-15" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`,
  raspberry: `${[[50, 40], [37, 46], [63, 46], [44, 56], [56, 56], [33, 59], [67, 59], [50, 68], [40, 70], [60, 70], [50, 82], [45, 45], [55, 45]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9"/>`).join('')}<path d="M50 34c-8-9-20-11-28-6 9 6 19 8 28 6zm0 0c8-9 20-11 28-6-9 6-19 8-28 6zm0 0V18"/><path d="M50 34V16" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`,
  mango: `<path d="M64 22c15 9 20 29 12 47S48 93 32 86 14 60 26 43s26-28 38-21z"/><path class="cut" d="M40 40c-6 8-8 18-5 27" fill="none" stroke-width="5" stroke-linecap="round"/><path d="M62 22c3-9 11-14 22-13-3 10-11 15-22 13z"/><path d="M80 52c4 4 6 9 4 15 6-3 9-10 7-17-1 5-5 6-7 2-1 4-3 3-4 0z"/>`,
  watermelon: `<path d="M8 38h84c0 26-19 44-42 44S8 64 8 38z"/><path class="cut" d="M17 42h66c-2 19-16 32-33 32S19 61 17 42z"/><path d="M22 42h56c-2 15-13 26-28 26S24 57 22 42z"/>${[[38, 50], [50, 55], [62, 50], [44, 60], [56, 60]].map(([x, y]) => `<ellipse class="cut" cx="${x}" cy="${y}" rx="2.6" ry="4.2"/>`).join('')}`,
  strawberryKiwi: `<circle cx="66" cy="58" r="26"/><circle class="cut" cx="66" cy="58" r="20"/><circle cx="66" cy="58" r="7"/>${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<ellipse cx="${(66 + Math.cos(a) * 13).toFixed(1)}" cy="${(58 + Math.sin(a) * 13).toFixed(1)}" rx="1.8" ry="3.4" transform="rotate(${(a * 180 / Math.PI + 90).toFixed(0)} ${(66 + Math.cos(a) * 13).toFixed(1)} ${(58 + Math.sin(a) * 13).toFixed(1)})"/>`; }).join('')}<path d="M38 30c13 0 22 8 22 21 0 16-12 29-22 37C28 80 16 67 16 51c0-13 9-21 22-21z"/>${[[30, 45], [42, 43], [35, 56], [47, 55], [29, 66], [41, 67], [36, 77]].map(([x, y]) => `<ellipse class="cut" cx="${x}" cy="${y}" rx="1.8" ry="2.8"/>`).join('')}<path d="M38 32c-6-6-15-7-21-3 7 5 14 6 21 3zm0 0c6-6 15-7 21-3-7 5-14 6-21 3zm0 0V18"/><path d="M38 32V17" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`,
  berries: `<circle cx="35" cy="60" r="17"/><circle cx="64" cy="64" r="17"/><circle cx="50" cy="38" r="15"/><circle class="cut" cx="31" cy="55" r="3.5"/><circle class="cut" cx="60" cy="59" r="3.5"/><circle class="cut" cx="46" cy="34" r="3"/><path d="M50 23c3-8 10-12 19-11-2 8-9 12-19 11z"/>`,
  icedCoffee: `<path d="M26 26h48l-6 64H32z"/><path class="cut" d="M31 44h38l-4 40H35z"/><path d="M33 58h34l-3 26H36z"/><rect class="cut" x="38" y="47" width="11" height="11" rx="2" transform="rotate(-12 43 52)"/><rect class="cut" x="52" y="49" width="10" height="10" rx="2" transform="rotate(10 57 54)"/><path d="M58 26 70 6" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M22 20h56v8H22z"/>`,
  falsa: `<path d="M50 10v18M50 28 30 42M50 28l20 14M50 28v22" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>${[[30, 50, 11], [70, 50, 11], [50, 58, 12], [38, 70, 10], [62, 70, 10], [50, 82, 9]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/><circle class="cut" cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${(r * 0.22).toFixed(1)}"/>`).join('')}<path d="M80 12v20M70 17l20 10M90 17 70 27" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
};

const BENEFIT = {
  caffeine: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M13.5 2 5 13.5h5.5L9 22l9.5-12.5H13L14.5 2z"/></svg>`,
  electrolytes: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.5S5.5 10.2 5.5 15a6.5 6.5 0 0 0 13 0C18.5 10.2 12 2.5 12 2.5z"/></svg>`,
  vitamins: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 3.5h6.2c3 0 4.8 1.5 4.8 3.9 0 1.6-.9 2.7-2.3 3.2 1.9.4 3.1 1.8 3.1 3.7 0 2.7-2.1 4.2-5.4 4.2H7zm3.6 3v3.6h2.2c1.2 0 1.9-.7 1.9-1.8s-.7-1.8-1.9-1.8zm0 6.4v4h2.6c1.4 0 2.2-.7 2.2-2s-.8-2-2.2-2z"/></svg>`,
  zamzam: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5S5.5 10.2 5.5 15a6.5 6.5 0 0 0 13 0C18.5 10.2 12 2.5 12 2.5z"/><path d="M8.5 15.5c1.2-1.2 2.3-1.2 3.5 0s2.3 1.2 3.5 0"/></svg>`,
};

// the halal seal from the site (src/components/HalalSeal.tsx), as a static mark
const halalSrc = await readFile(resolve(root, 'src/components/halalMark.ts'), 'utf8');
const HALAL_PATH = halalSrc.match(/HALAL_WORD_PATH =\s*'([^']+)'/)[1];
const [hx, hy, hw, hh] = halalSrc.match(/HALAL_WORD_VIEWBOX = '([^']+)'/)[1].split(' ').map(Number);
const ticks = Array.from({ length: 36 }, (_, i) => {
  const a = (i / 36) * Math.PI * 2;
  const r2 = i % 3 === 0 ? 42.5 : 44.5;
  return `M${(Math.cos(a) * 46.5).toFixed(2)} ${(Math.sin(a) * 46.5).toFixed(2)}L${(Math.cos(a) * r2).toFixed(2)} ${(Math.sin(a) * r2).toFixed(2)}`;
}).join('');
const HALAL_SEAL = `<svg viewBox="-60 -60 120 120" fill="none" stroke="currentColor"><circle r="56" stroke-width="3"/><circle r="50" stroke-width="1.6"/><path d="${ticks}" stroke-width="1.6"/><path d="${HALAL_PATH}" fill="currentColor" stroke="none" transform="translate(${(-(hx + hw / 2) * 0.3).toFixed(2)} ${(-(hy + hh / 2) * 0.3 - 4).toFixed(2)}) scale(0.3)"/><text x="0" y="30" text-anchor="middle" fill="currentColor" stroke="none" style="font:700 14px Geist;letter-spacing:2px">HALAL</text></svg>`;

const RECYCLE = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M50 14a36 36 0 0 1 33 22"/><path d="m86 22-3 15-15-4"/><path d="M80 66a36 36 0 0 1-37 19"/><path d="m51 93-9-12 11-10"/><path d="M19 70a36 36 0 0 1 3-41"/><path d="m11 37 12-8 8 14"/><text x="50" y="58" text-anchor="middle" fill="currentColor" stroke="none" style="font:700 17px Geist;letter-spacing:1px">ALU</text></svg>`;

// a mountain ridge along the foot of the wrap (the old art's peaks, as one tone-on-tone shape)
const ridge = (() => {
  let d = `M0 ${H}`;
  let x = 0;
  let i = 0;
  while (x < W) {
    const peak = 120 + ((i * 97) % 170);
    const step = 180 + ((i * 53) % 140);
    d += ` L${x + step / 2} ${H - peak} L${x + step} ${H - 40 - ((i * 31) % 50)}`;
    x += step;
    i += 1;
  }
  return `${d} L${W} ${H} Z`;
})();

// barcode placeholder: the real EAN-13 replaces it (grizzly.json unconfirmed.barcode)
const barcode = (() => {
  let bars = '';
  let x = 0;
  for (let i = 0; i < 59; i += 1) {
    const w = 2 + ((i * 7) % 3) * 2;
    if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="${i < 3 || i > 55 || (i > 27 && i < 31) ? 100 : 90}"/>`;
    x += w;
  }
  return `<svg viewBox="0 0 ${x} 100" preserveAspectRatio="none">${bars}</svg>`;
})();

const shown = (value) => (typeof value === 'string' && value.startsWith('TODO') ? 'TBC' : value);

function html(slug, flavor, spec) {
  const name = (spec.name ?? flavor?.name ?? slug).toUpperCase();
  const description = spec.description ?? `${(flavor?.name ?? slug)} flavored energy drink with natural caffeine from green coffee beans, B vitamins (B3, B6, B12, biotin, B5) and electrolytes from sea salt. Made with added Zamzam water.`;
  const benefits = data.benefits;
  const rows = data.nutrition.rows;
  const bands = data.label.benefitBlocks.map(([, , , v1]) => bandTop(v1));
  const front = { x: px(P.front[0]), w: px(P.front[1]) - px(P.front[0]) };
  const left = { x: px(P.left[0]) + 40, w: px(P.left[1]) - px(P.left[0]) - 80 };
  const right = { x: px(P.right[0]) + 40, w: px(P.right[1]) - px(P.right[0]) - 80 };
  const strips = [Math.round((px(P.left[1]) + front.x) / 2), Math.round((front.x + front.w + px(P.right[0])) / 2)];
  return `<!doctype html><html><head>${FONTS}<style>
  :root{--field:${spec.field};--ink:${spec.ink};--metal:${spec.metal};--white:#fff}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{position:relative;background:var(--field);color:var(--white);font-family:Geist;-webkit-font-smoothing:antialiased}
  .abs{position:absolute}
  .display{font-family:'Libre Franklin';font-weight:900;font-style:italic;line-height:.88;letter-spacing:-.01em}
  .label{font-weight:700;letter-spacing:.22em;text-transform:uppercase}
  .ink{color:var(--ink)}
  .metal{color:var(--metal)}
  .tone{color:var(--ink);opacity:.14}
  .balance{text-wrap:balance}
  svg{display:block;width:100%;height:100%}
  .cut{fill:var(--ink);stroke:var(--ink)}
  /* metal pass: only the bare-aluminium parts, white on black */
  body.mask{background:#000}
  body.mask *{visibility:hidden}
  body.mask .metal,body.mask .metal *{visibility:visible;color:#fff!important}
  .bear{background:currentColor;-webkit-mask:url(${BEAR}) center/contain no-repeat;mask:url(${BEAR}) center/contain no-repeat}
  </style></head><body>

  <!-- tone-on-tone: three claw slashes behind the front, the ridge along the foot -->
  <svg class="abs tone" style="left:${front.x - 120}px;top:120px;width:${front.w + 240}px;height:1900px" viewBox="0 0 100 140" preserveAspectRatio="none">
    <path fill="currentColor" d="M18 4c4 0 6 2 5 6L8 136c-1 3-5 3-5-1L13 9c0-3 2-5 5-5zm32 0c4 0 6 2 5 6L40 136c-1 3-5 3-5-1L45 9c0-3 2-5 5-5zm32 0c4 0 6 2 5 6L72 136c-1 3-5 3-5-1L77 9c0-3 2-5 5-5z" transform="skewX(-12) translate(18 0)"/>
  </svg>
  <svg class="abs tone" style="left:0;top:0;width:${W}px;height:${H}px" viewBox="0 0 ${W} ${H}"><path fill="currentColor" d="${ridge}"/></svg>

  <!-- ===== FRONT ===== -->
  <div class="abs label" style="left:${front.x}px;width:${front.w}px;top:70px;text-align:center;font-size:46px">
    <span style="display:inline-block;padding:14px 34px;${spec.edition ? 'background:var(--ink);color:var(--white)' : 'color:var(--white)'}">${spec.edition ?? 'ORIGINAL SERIES'}</span>
  </div>
  <div class="abs metal bear" style="left:${front.x + (front.w - 1060) / 2}px;top:200px;width:1060px;height:944px"></div>
  <div class="abs display metal fit" data-w="1150" style="left:${front.x}px;width:${front.w}px;top:1205px;text-align:center;font-size:300px">GRIZZLY</div>
  <div class="abs display ink fit" data-w="930" style="left:${front.x}px;width:${front.w}px;top:1515px;text-align:center;font-size:220px">ENERGY</div>
  <div class="abs label" style="left:${front.x}px;width:${front.w}px;top:1760px;text-align:center;font-size:58px;letter-spacing:.3em">FUEL YOUR WILD SIDE</div>
  <div class="abs" style="left:${front.x + (front.w - 1160) / 2}px;width:1160px;top:1900px;height:250px;background:var(--ink);display:flex;align-items:center;gap:34px;padding:0 44px">
    <div style="width:170px;height:170px;flex:none;color:var(--white)"><svg viewBox="0 0 100 100" fill="currentColor">${FRUIT[spec.icon]}</svg></div>
    <div class="display fit" data-w="830" data-max="150" style="font-size:150px;white-space:nowrap;color:var(--white)">${name}</div>
  </div>
  <div class="abs label ink" style="left:${front.x}px;width:${front.w}px;top:2190px;text-align:center;font-size:50px">${spec.sub ?? 'NATURALLY FLAVORED'}</div>
  <div class="abs" style="left:${front.x + 70}px;width:${front.w - 140}px;top:2380px;display:flex;align-items:center;justify-content:space-between">
    <div style="width:250px;height:250px">${HALAL_SEAL}</div>
    <div style="text-align:center">
      <div class="display" style="font-size:190px">250<span style="font-size:110px"> ML</span></div>
      <div class="label ink" style="font-size:44px;margin-top:18px">ENERGY DRINK</div>
    </div>
    <div style="width:300px;text-align:center">
      <div class="label" style="font-size:40px;line-height:1.25">MADE IN<br>PAKISTAN</div>
      <div class="ink" style="font:700 48px Amiri;margin-top:8px;white-space:nowrap" dir="rtl" lang="ur">پاکستان میں تیار</div>
    </div>
  </div>

  <!-- side strips between the panels -->
  <div class="abs label ink" style="left:${strips[0] - 900}px;top:${1500 - 26}px;width:1800px;text-align:center;font-size:40px;letter-spacing:.32em;transform:rotate(-90deg)">NATURAL CAFFEINE · B VITAMINS · ELECTROLYTES</div>
  <div class="abs ink" style="left:${strips[1] - 900}px;top:${1500 - 30}px;width:1800px;text-align:center;transform:rotate(90deg);font-size:40px;display:flex;justify-content:center;gap:40px;align-items:center"><span class="label" style="letter-spacing:.32em">GRIZZLY ENERGY</span><span style="font:700 46px Amiri" dir="rtl" lang="ur">گرزلی انرجی</span></div>

  <!-- ===== RIGHT: claim, four benefits in the lit bands, marks ===== -->
  <div class="abs display" style="left:${right.x}px;width:${right.w}px;top:170px;font-size:118px">PURE FOCUS.<br>NATURAL<br>ENERGY.</div>
  ${benefits.map((b, i) => `
  <div class="abs" style="left:${right.x}px;width:${right.w}px;top:${bands[i] + 30}px;display:flex;gap:40px">
    <div style="width:130px;height:130px;flex:none;background:var(--ink);color:var(--white);padding:26px">${BENEFIT[b.icon]}</div>
    <div>
      <div class="display fit" data-w="770" data-max="66" style="font-size:66px;white-space:nowrap">${b.title.toUpperCase()}</div>
      <div class="label ink" style="font-size:38px;letter-spacing:.12em;margin-top:16px">${(b.icon === 'zamzam' ? 'In every can' : b.spec).toUpperCase()}</div>
      <div class="ink balance" style="font-size:44px;line-height:1.25;margin-top:12px;max-width:760px">${b.labelDetail}</div>
    </div>
  </div>`).join('')}
  <div class="abs" style="left:${right.x}px;width:${right.w}px;top:2170px;height:8px;background:var(--ink)"></div>
  <div class="abs" style="left:${right.x}px;width:${right.w}px;top:2230px;display:flex;align-items:center;gap:40px">
    <div>
      <div class="label" style="font-size:44px;line-height:1.3">HALAL CERTIFIED</div>
      <div class="label ink" style="font-size:36px;line-height:1.5;letter-spacing:.12em">NO ARTIFICIAL COLORS<br>NO PRESERVATIVES</div>
    </div>
  </div>
  <div class="abs" style="left:${right.x}px;width:${right.w}px;top:2500px;display:flex;gap:36px;align-items:stretch">
    <div style="background:#fff;padding:26px 30px 18px;width:520px;color:#111">
      <div style="height:220px">${barcode}</div>
      <div style="font:700 34px Geist;letter-spacing:.3em;text-align:center;margin-top:12px">EAN-13 · TBC</div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;gap:26px">
      <div style="border:6px solid var(--ink);padding:22px 24px" class="label ink"><div style="font-size:34px;letter-spacing:.14em;line-height:1.35">BEST BEFORE<br>&amp; BATCH:<br>SEE BASE</div></div>
      <div style="display:flex;align-items:center;gap:20px"><div style="width:130px;height:130px;flex:none" class="ink">${RECYCLE}</div><div class="label" style="font-size:34px;line-height:1.3;letter-spacing:.12em">PLEASE<br>RECYCLE</div></div>
    </div>
  </div>

  <!-- ===== LEFT: product, ingredients, caffeine, nutrition, maker ===== -->
  <div class="abs" style="left:${left.x}px;width:${left.w}px;top:170px;display:flex;justify-content:space-between;align-items:baseline">
    <div class="display" style="font-size:96px">GRIZZLY ENERGY</div>
    <div style="font:700 86px Amiri" dir="rtl" lang="ur">گرزلی انرجی</div>
  </div>
  <div class="abs display ink" style="left:${left.x}px;top:290px;font-size:66px">${name}</div>
  <div class="abs ink balance" style="left:${left.x}px;width:${left.w}px;top:400px;font-size:44px;line-height:1.35">${description}</div>
  <div class="abs" style="left:${left.x}px;width:${left.w}px;top:700px">
    <div class="label" style="font-size:42px;letter-spacing:.16em">INGREDIENTS</div>
    <div class="ink" style="font-size:44px;line-height:1.35;margin-top:10px">${data.label.neutral.ingredients}${spec.allergen ? ` <b>${spec.allergen}</b>` : ''}</div>
    <div class="label" style="font-size:42px;letter-spacing:.16em;margin-top:40px">CAFFEINE · TBC MG / 100 ML</div>
    <div class="ink balance" style="font-size:44px;line-height:1.35;margin-top:10px">Contains caffeine from green coffee beans. Not recommended for children, pregnant or breastfeeding women.</div>
  </div>
  <div class="abs" style="left:${left.x}px;width:${left.w}px;top:1170px">
    <div style="background:var(--ink);padding:20px 26px;display:flex;justify-content:space-between;align-items:baseline">
      <span class="display" style="font-size:60px">NUTRITION</span><span class="label" style="font-size:36px;letter-spacing:.14em">PER CAN · 250 ML</span>
    </div>
    ${rows.map(([label, value], i) => `<div class="ink" style="display:flex;justify-content:space-between;font-size:44px;padding:14px 26px 12px ${label.startsWith('of ') ? 70 : 26}px;border-bottom:${i === rows.length - 1 ? 8 : 3}px solid color-mix(in srgb, var(--ink) ${i === rows.length - 1 ? 100 : 35}%, transparent)"><span>${label}</span><b>${spec.nutritionTbc ? 'TBC' : shown(value)}</b></div>`).join('')}
  </div>
  <div class="abs" style="left:${left.x}px;width:${left.w}px;top:2400px">
    <div class="ink" style="font-size:40px;line-height:1.4">Best consumed chilled. Keep refrigerated after opening.</div>
    <div class="label" style="font-size:40px;letter-spacing:.14em;margin-top:28px">GRIZZLY ENERGY BEVERAGE LABS</div>
    <div class="ink" style="font-size:40px;line-height:1.4;margin-top:6px">Address TBC · Pakistan · www.grizzlyenergy.pk</div>
  </div>
  </body></html>`;
}

// ---------- assets ----------
const FONTS = `${await localFontCss()}<style>@font-face{font-family:'Amiri';font-weight:700;src:url(data:font/woff2;base64,${(await readFile(resolve(root, 'node_modules/@fontsource/amiri/files/amiri-arabic-700-normal.woff2'))).toString('base64')}) format('woff2')}</style>`;
const BEAR = `data:image/png;base64,${(await readFile(resolve(root, 'assets/label-flat/bear-mark.png'))).toString('base64')}`;

// ---------- render ----------
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const BODY_SURFACE = [255, 110, 90]; // satin print
const METAL_SURFACE = [255, 64, 255]; // brushed aluminium

for (const [slug, spec] of Object.entries(FLAVORS)) {
  if (only && slug !== only) continue;
  const flavor = data.flavors.find((f) => f.slug === slug);
  await page.setContent(html(slug, flavor, spec), { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    // fit display lines to their target width (the wordmark grows to it, long names shrink); data-max caps it
    for (const el of document.querySelectorAll('.fit')) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const size = parseFloat(getComputedStyle(el).fontSize);
      const fitted = size * (Number(el.dataset.w) / range.getBoundingClientRect().width);
      el.style.fontSize = `${Math.min(fitted, Number(el.dataset.max ?? Infinity))}px`;
    }
  });
  const albedo = await page.screenshot({ type: 'png' });
  await page.evaluate(() => document.body.classList.add('mask'));
  const maskPng = await page.screenshot({ type: 'png' });

  await sharp(albedo).png().toFile(resolve(previewDir, `${slug}.png`));
  if (install && flavor) {
    const mask = await sharp(maskPng).greyscale().raw().toBuffer();
    const surface = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i += 1) {
      const t = mask[i] / 255;
      for (let c = 0; c < 3; c += 1) surface[i * 3 + c] = Math.round(BODY_SURFACE[c] + (METAL_SURFACE[c] - BODY_SURFACE[c]) * t);
    }
    await sharp(albedo).webp({ quality: 92 }).toFile(resolve(runtimeDir, `${slug}.webp`));
    await sharp(surface, { raw: { width: W, height: H, channels: 3 } }).png().toFile(resolve(runtimeDir, `${slug}-surface.png`));
    // emboss: the metal sits slightly raised (half-size normal map from the blurred mask)
    const NW = W / 2;
    const NH = Math.round(H / 2);
    const height = await sharp(maskPng).greyscale().resize(NW, NH).blur(2).raw().toBuffer();
    const normal = Buffer.alloc(NW * NH * 3);
    const h = (x, y) => height[Math.min(NH - 1, Math.max(0, y)) * NW + Math.min(NW - 1, Math.max(0, x))] / 255;
    for (let y = 0; y < NH; y += 1) {
      for (let x = 0; x < NW; x += 1) {
        const dx = (h(x + 1, y) - h(x - 1, y)) * 2.2;
        const dy = (h(x, y + 1) - h(x, y - 1)) * 2.2;
        const len = Math.hypot(dx, dy, 1);
        const k = (y * NW + x) * 3;
        normal[k] = Math.round((-dx / len * 0.5 + 0.5) * 255);
        normal[k + 1] = Math.round((dy / len * 0.5 + 0.5) * 255);
        normal[k + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      }
    }
    await sharp(normal, { raw: { width: NW, height: NH, channels: 3 } }).png().toFile(resolve(runtimeDir, `${slug}-normal.png`));
  }
  console.log(`✓ ${slug}${install && flavor ? ' (installed)' : ''}`);
}
await browser.close();
