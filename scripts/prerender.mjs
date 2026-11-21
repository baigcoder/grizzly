#!/usr/bin/env node
/**
 * Post-build: turns dist/index.html into one static page per route (title, description,
 * canonical, Open Graph, JSON-LD and real content in #root), and writes robots.txt, sitemap.xml
 * and llms.txt. Run automatically by `npm run build`.
 * The app still mounts over this markup: React replaces #root, so nothing is hydrated or duplicated.
 */
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const tmp = resolve(root, 'node_modules/.cache/prerender.mjs');

await build({
  stdin: {
    contents: `export * from './src/seo/meta.ts'; export * from './src/seo/staticPage.ts'; export * from './src/seo/files.ts';`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: tmp,
  logLevel: 'error',
  loader: { '.json': 'json' },
});
const seo = await import(`${pathToFileURL(tmp).href}?t=${Date.now()}`);

const template = await readFile(resolve(dist, 'index.html'), 'utf8');

// Preload the three fonts the first screen uses (body light and regular, display black italic).
const assets = await readdir(resolve(dist, 'assets'));
const preloads = ['geist-latin-300-normal', 'geist-latin-400-normal', 'libre-franklin-latin-900-italic']
  .map((name) => assets.find((file) => file.startsWith(name) && file.endsWith('.woff2')))
  .filter(Boolean)
  .map((file) => `<link rel="preload" href="/assets/${file}" as="font" type="font/woff2" crossorigin />`);

// Routes that build the 3D scene on every device (App.tsx → wantsScene). Their scene chunks are otherwise only
// requested after the main bundle has run: one extra round trip. Measured on a throttled phone (slow 4G, median of 5):
// the scene is created ~330 ms sooner for ~50 ms of first paint. The Basis transcoder and the first label texture are
// deliberately NOT hinted: at default priority they starve these chunks of bandwidth (no gain), at low priority they
// delay the hero can's own texture by seconds.
const sceneChunks = ['vendor-three-', 'sceneManager-', 'studioEnv-']
  .map((prefix) => assets.find((file) => file.startsWith(prefix) && file.endsWith('.js')))
  .filter(Boolean);
const sceneRoutes = new Set(['HOME', 'PRODUCT', 'MIX']);
const scenePreloads = (route) =>
  sceneRoutes.has(route.type) ? sceneChunks.map((file) => `<link rel="modulepreload" crossorigin href="/assets/${file}" fetchpriority="low" />`) : [];
const escapeAttr = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function render(route) {
  const meta = seo.pageMeta(route);
  // A link preview that 404s is silent in the browser; fail the build instead.
  const imageFile = resolve(dist, meta.image.replace(`${seo.SITE_URL}/`, ''));
  if (!existsSync(imageFile)) throw new Error(`Missing social image for ${meta.path}: ${meta.image}`);
  const canonical = seo.absoluteUrl(meta.path === '/404' ? '/' : meta.path);
  let html = template
    // drop the dev defaults; the real tags follow
    .replace(/\s*<title>[\s\S]*?<\/title>/, '')
    .replace(/\s*<meta[^>]*data-seo-default[^>]*>/g, '')
    .replace('<link rel="icon"', '<link rel="icon"');
  const head = [
    `<title>${escapeAttr(meta.title)}</title>`,
    `<meta name="description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="robots" content="${meta.noindex ? 'noindex, follow' : 'index, follow'}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeAttr(seo.SITE_NAME)}" />`,
    `<meta property="og:locale" content="en_PK" />`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${meta.image}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="${seo.SOCIAL_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${seo.SOCIAL_IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${escapeAttr(meta.title)}" />`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="twitter:image" content="${meta.image}" />`,
    `<meta name="twitter:image:alt" content="${escapeAttr(meta.title)}" />`,
    ...preloads,
    ...scenePreloads(route),
    `<style>${seo.STATIC_CSS}</style>`,
    `<noscript><style>${seo.NOSCRIPT_CSS}</style></noscript>`,
    meta.jsonLd.length ? `<script type="application/ld+json" data-seo="jsonld">${JSON.stringify({ '@context': 'https://schema.org', '@graph': meta.jsonLd })}</script>` : '',
  ].join('\n    ');
  html = html.replace('</head>', `    ${head}\n  </head>`);
  html = html.replace('<div id="root"></div>', `<div id="root">${seo.staticHtml(route)}</div>`);
  // The app stylesheet moves from <head> to just after the static markup. In <head> it blocks the first paint until
  // it has downloaded (about 5 s on a slow 3G link, behind the fonts and scripts it shares the connection with), so a
  // visitor saw nothing at all. Here the boot screen above paints from the HTML alone. Deferred module scripts still
  // wait for a pending stylesheet before they run, so the app never mounts unstyled.
  const sheet = html.match(/\s*<link rel="stylesheet"[^>]*href="\/assets\/index-[^"]+\.css"[^>]*>/);
  if (sheet) {
    html = html.replace(sheet[0], '');
    html = html.replace(/(<div id="root">[\s\S]*?<\/div>)(\s*<\/body>|\s*<script)/, `$1\n    ${sheet[0].trim()}$2`);
  }
  return { html, meta };
}

const routes = [...seo.indexableRoutes(), { type: 'CART' }, { type: 'CHECKOUT' }];
for (const route of routes) {
  const { html, meta } = render(route);
  const file = meta.path === '/' ? resolve(dist, 'index.html') : resolve(dist, meta.path.slice(1), 'index.html');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
}
const notFound = render({ type: 'NOT_FOUND' });
await writeFile(resolve(dist, '404.html'), notFound.html);
await writeFile(resolve(dist, 'robots.txt'), seo.robotsTxt());
await writeFile(resolve(dist, 'sitemap.xml'), seo.sitemapXml(new Date().toISOString().slice(0, 10)));
await writeFile(resolve(dist, 'llms.txt'), seo.llmsTxt());
console.log(`prerendered ${routes.length} routes + 404, robots.txt, sitemap.xml, llms.txt`);
