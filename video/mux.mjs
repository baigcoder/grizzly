/**
 * Joins a silent render with the score: loudness-normalised to -14 LUFS / -1 dBTP (streaming targets), AAC 320 kbps.
 *   node mux.mjs out/grizzly-16x9.silent.mp4 out/grizzly-16x9.mp4
 */
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
const [video, out, audio = 'audio/grizzly-mix.wav'] = process.argv.slice(2);
const r = spawnSync(ffmpeg, [
  '-y', '-loglevel', 'error', '-i', video, '-i', audio,
  '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
  '-af', 'loudnorm=I=-14:TP=-1:LRA=11,aresample=48000', '-c:a', 'aac', '-b:a', '320k',
  '-shortest', '-movflags', '+faststart', out,
], { stdio: 'inherit' });
process.exit(r.status ?? 1);
