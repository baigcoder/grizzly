/**
 * 3D plate renderer: serves the plate page with Vite, drives it in headless Chromium (GPU), seeks every frame (motion
 * blur is done in the page), screenshots it and pipes the PNGs into ffmpeg. Also writes the callout anchors per frame
 * for the Remotion type layer.
 *
 *   node render.mjs --w 1920 --h 1080 --out film/public/plate-16x9.mp4 --anchors film/public/anchors-16x9.json
 *   node render.mjs --stills 2,8,20 --w 1920 --h 1080          → out/stills/*.png
 *   options: --fps 30  --from 0  --to 50  --crf 12
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, token, i, all) => (token.startsWith('--') ? [...pairs, [token.slice(2), all[i + 1]]] : pairs), [])
);
const W = Number(args.w ?? 1920);
const H = Number(args.h ?? 1080);
const FPS = Number(args.fps ?? 30);

// drive C: is full on this machine: keep Chromium's temp files and profile on this drive
const tmp = resolve(here, '.cache/tmp');
mkdirSync(tmp, { recursive: true });
process.env.TEMP = tmp;
process.env.TMP = tmp;

const server = await createServer({ root: here, configFile: resolve(here, 'vite.config.ts'), logLevel: 'error', server: { port: 5191 + (W > H ? 0 : 1), watch: null } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/?render&w=${W}&h=${H}`;

// the full Chromium build already installed for the site's e2e tests (new headless mode keeps the real GPU path)
const chromeExe = resolve(process.env.LOCALAPPDATA ?? '', 'ms-playwright/chromium-1248/chrome-win64/chrome.exe');
const browser = await chromium.launchPersistentContext(resolve(tmp, `profile-${W}x${H}`), {
  headless: true,
  executablePath: chromeExe,
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--force-color-profile=srgb', `--disk-cache-dir=${resolve(tmp, 'disk-cache')}`],
});
const page = browser.pages()[0] ?? (await browser.newPage());
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.film !== undefined, null, { timeout: 60000 });
await page.evaluate(() => window.film.ready);
const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log('GPU:', gpu);
const duration = await page.evaluate(() => window.film.duration);
const frameEl = await page.$('#frame');

const seekAndShoot = async (t) => {
  const anchors = await page.evaluate((time) => {
    window.film.seek(time);
    return window.film.anchors();
  }, t);
  const png = await frameEl.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
  return { png, anchors };
};

if (args.stills) {
  const dir = resolve(here, 'out/stills');
  mkdirSync(dir, { recursive: true });
  for (const t of String(args.stills).split(',').map(Number)) {
    const { png } = await seekAndShoot(t);
    const file = resolve(dir, `${W}x${H}-${t.toFixed(2).padStart(5, '0')}.png`);
    writeFileSync(file, png);
    console.log('still', file);
  }
} else {
  const from = Number(args.from ?? 0);
  const to = Number(args.to ?? duration);
  const out = resolve(here, args.out ?? `film/public/plate-${W}x${H}.mp4`);
  mkdirSync(dirname(out), { recursive: true });
  const ff = spawn(ffmpegPath, [
    '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(args.crf ?? 12), '-tune', 'film',
    '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'ignore', 'inherit'] });
  const frames = Math.round((to - from) * FPS);
  const anchorLog = [];
  const started = Date.now();
  for (let i = 0; i < frames; i += 1) {
    const { png, anchors } = await seekAndShoot(from + i / FPS);
    anchorLog.push(anchors);
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) {
      const rate = (i + 1) / ((Date.now() - started) / 1000);
      console.log(`frame ${i}/${frames}  ${rate.toFixed(2)} fps  eta ${((frames - i) / rate / 60).toFixed(1)} min`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  if (args.anchors) writeFileSync(resolve(here, args.anchors), JSON.stringify({ fps: FPS, width: W, height: H, frames: anchorLog }));
  console.log('wrote', out);
}

await browser.close();
await server.close();
