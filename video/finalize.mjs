/**
 * Delivery pass (brag-slim §4) for a Remotion render: pulls the poster from a settled frame, bakes it in as frame 0
 * (replaced, not added, so duration and sync stay the same), normalises the audio to -14 LUFS / -1 dBTP and writes
 * the final H.264 + AAC file.
 *   node finalize.mjs <remotion.mp4> <final.mp4> <poster.jpg> <poster time in s>
 */
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const [src, out, poster, at] = process.argv.slice(2);
const run = (args) => {
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run(['-ss', String(at), '-i', src, '-frames:v', '1', '-q:v', '2', poster]);
run([
  '-i', src, '-i', poster,
  '-filter_complex', "[1:v]scale=iw:ih,format=yuv420p[p];[0:v][p]overlay=0:0:enable='eq(n,0)'[v]",
  '-map', '[v]', '-map', '0:a',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
  '-af', 'loudnorm=I=-14:TP=-1:LRA=11,aresample=48000', '-c:a', 'aac', '-b:a', '320k',
  '-movflags', '+faststart', out,
]);
console.log('wrote', out, 'and', poster);
