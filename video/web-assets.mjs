/**
 * Web assets for the site's film page (/film), from the masters in brag-output/: streaming-friendly H.264 encodes
 * (fast start, capped bitrate), WebP posters and one WebP thumbnail per chapter. Writes to ../public/film/.
 *   node web-assets.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../public/film');
mkdirSync(resolve(out, 'chapters'), { recursive: true });
const run = (args) => {
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const VIDEOS = [
  ['grizzly-film-16x9.mp4', 'film-16x9.mp4', 7],
  ['grizzly-film-9x16.mp4', 'film-9x16.mp4', 7],
  ['brag.mp4', 'teaser-16x9.mp4', 7],
  ['brag-vertical.mp4', 'teaser-9x16.mp4', 7],
];
for (const [src, dst, mbps] of VIDEOS) {
  run([
    '-i', resolve(here, 'brag-output', src),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-maxrate', `${mbps}M`, '-bufsize', `${mbps * 2}M`,
    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', resolve(out, dst),
  ]);
  console.log(dst, (statSync(resolve(out, dst)).size / 1e6).toFixed(1), 'MB');
}

// posters: the settled lock-up frames
const POSTERS = [
  ['film-poster.jpg', 'poster-16x9.webp'],
  ['film-poster-vertical.jpg', 'poster-9x16.webp'],
  ['brag-vertical.jpg', 'teaser-poster-9x16.webp'],
];
for (const [src, dst] of POSTERS) run(['-i', resolve(here, 'brag-output', src), '-c:v', 'libwebp', '-quality', '82', resolve(out, dst)]);

// one thumbnail per chapter, from the landscape film (seconds into the film; keep in step with src/data/film.ts)
const CHAPTERS = [
  ['hook', 2.2], ['reveal', 4.8], ['build', 10.6], ['flavors', 19.6], ['inside', 31.0],
  ['zamzam', 37.8], ['halal', 40.3], ['crack', 43.0], ['finale', 48.8],
];
for (const [id, at] of CHAPTERS) {
  run(['-ss', String(at), '-i', resolve(here, 'brag-output/grizzly-film-16x9.mp4'), '-frames:v', '1', '-vf', 'scale=640:-2', '-c:v', 'libwebp', '-quality', '78', resolve(out, 'chapters', `${id}.webp`)]);
}
console.log('wrote public/film/');
