/** Contact sheet of rendered stills: node sheet.mjs <prefix> <out.png> [cols] — review aid only. */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
const [prefix = '1920x1080', out = 'out/sheet.png', colsArg = '4'] = process.argv.slice(2);
const files = readdirSync('out/stills').filter((f) => f.startsWith(prefix) && f.endsWith('.png')).sort();
const cols = Number(colsArg);
const tw = prefix.startsWith('1080x1920') ? 270 : 640;
const inputs = files.flatMap((f) => ['-i', `out/stills/${f}`]);
const scaled = files.map((_, i) => `[${i}]scale=${tw}:-1[s${i}]`).join(';');
const layout = files.map((_, i) => `${(i % cols) * (tw + 4)}_${Math.floor(i / cols)}*H`).map((s) => s);
// rows need the tile height: compute from aspect
const th = prefix.startsWith('1080x1920') ? 480 : 360;
const lay = files.map((_, i) => `${(i % cols) * (tw + 4)}_${Math.floor(i / cols) * (th + 4)}`).join('|');
void layout;
const graph = `${scaled};${files.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${files.length}:layout=${lay}:fill=black`;
const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-frames:v', '1', out], { stdio: 'inherit' });
process.exit(r.status ?? 1);
