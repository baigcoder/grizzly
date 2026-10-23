/**
 * Final renders: the four Remotion compositions (full film and brag cut, landscape and vertical), each followed by the
 * delivery pass (finalize.mjs: poster as frame 0, -14 LUFS). Run after plates.mjs.
 *   node finals.mjs                 all four
 *   node finals.mjs GrizzlyBrag     just one
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = resolve(here, '.cache/tmp');
mkdirSync(tmp, { recursive: true });
const env = { ...process.env, TEMP: tmp, TMP: tmp };

// composition → [raw render, final file, poster, poster time (a settled lock-up frame)]
const JOBS = {
  GrizzlyFilm: ['out/remotion-film-16x9.mp4', 'brag-output/grizzly-film-16x9.mp4', 'brag-output/film-poster.jpg', 48.8],
  GrizzlyFilmVertical: ['out/remotion-film-9x16.mp4', 'brag-output/grizzly-film-9x16.mp4', 'brag-output/film-poster-vertical.jpg', 48.8],
  GrizzlyBrag: ['out/remotion-brag-16x9.mp4', 'brag-output/brag.mp4', 'brag-output/brag.jpg', 19.0],
  GrizzlyBragVertical: ['out/remotion-brag-9x16.mp4', 'brag-output/brag-vertical.mp4', 'brag-output/brag-vertical.jpg', 19.0],
};

const pick = process.argv.slice(2);
for (const [id, [raw, final, poster, at]] of Object.entries(JOBS)) {
  if (pick.length && !pick.includes(id)) continue;
  console.log(`[${id}] rendering`);
  const shell = process.platform === 'win32';
  let r = spawnSync('npx', ['remotion', 'render', id, resolve(here, raw), '--concurrency=4', '--log=error', '--port=3291'], { cwd: resolve(here, 'film'), stdio: 'inherit', env, shell });
  if (r.status !== 0) process.exit(r.status ?? 1);
  r = spawnSync('node', ['finalize.mjs', raw, final, poster, String(at)], { cwd: here, stdio: 'inherit', env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log('FINALS_DONE');
