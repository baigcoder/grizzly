/**
 * Resumable plate rendering: renders the 3D plate in 5 s chunks (render.mjs --from/--to), skips chunks that are
 * already complete, then joins them losslessly (ffmpeg concat, stream copy) and merges the per-chunk anchors.
 * Safe to stop and restart at any time.
 *   node plates.mjs 16x9 9x16
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const here = dirname(fileURLToPath(import.meta.url));
const DURATION = 50;
const CHUNK = 5;
const SIZES = { '16x9': [1920, 1080], '9x16': [1080, 1920] };

for (const fmt of process.argv.slice(2)) {
  const [w, h] = SIZES[fmt];
  const dir = resolve(here, '.cache/chunks', fmt);
  mkdirSync(dir, { recursive: true });
  const parts = [];
  for (let from = 0, i = 0; from < DURATION; from += CHUNK, i += 1) {
    const to = Math.min(DURATION, from + CHUNK);
    const name = `part-${String(i).padStart(2, '0')}`;
    const mp4 = resolve(dir, `${name}.mp4`);
    const anchors = resolve(dir, `${name}.json`);
    parts.push({ mp4, anchors });
    if (existsSync(`${mp4}.done`)) continue;
    console.log(`[${fmt}] rendering ${from}–${to} s`);
    const r = spawnSync('node', ['render.mjs', '--w', String(w), '--h', String(h), '--from', String(from), '--to', String(to), '--out', mp4, '--anchors', anchors], {
      cwd: here,
      stdio: 'inherit',
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
    writeFileSync(`${mp4}.done`, '');
  }
  const list = resolve(dir, 'list.txt');
  writeFileSync(list, parts.map((p) => `file '${p.mp4.replace(/\\/g, '/')}'`).join('\n'));
  const out = resolve(here, `film/public/plate-${fmt}.mp4`);
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  const frames = parts.flatMap((p) => JSON.parse(readFileSync(p.anchors, 'utf8')).frames);
  writeFileSync(resolve(here, `film/public/anchors-${fmt}.json`), JSON.stringify({ fps: 30, width: w, height: h, frames }));
  console.log(`[${fmt}] wrote ${out} (${frames.length} frames)`);
}
console.log('PLATES_DONE');
