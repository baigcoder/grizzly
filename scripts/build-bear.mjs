#!/usr/bin/env node
/**
 * Crops the bear from each flavor's label front (assets/label-front/<slug>-front.png) for the
 * "roar" moment, where it appears huge and faint behind the can.
 *   node scripts/build-bear.mjs
 * Output: public/textures/grizzly/bear/<slug>.webp (the bear and the ice around it on black).
 */
import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(resolve(root, 'src/data/grizzly.json'), 'utf8'));
const dir = resolve(root, 'public/textures/grizzly');
await mkdir(resolve(dir, 'bear'), { recursive: true });
for (const flavor of data.flavors) {
  const front = sharp(resolve(root, 'assets/label-front', `${flavor.slug}-front.png`));
  const { width, height } = await front.metadata();
  // The bear sits in the upper half of the front panel, under the flavor pill.
  const top = Math.round(height * 0.07);
  const crop = { left: 0, top, width, height: Math.round(height * 0.3) };
  await front.extract(crop).resize({ width: 1024 }).modulate({ brightness: 1.05, saturation: 1.1 }).webp({ quality: 82 }).toFile(resolve(dir, 'bear', `${flavor.slug}.webp`));
  console.log(flavor.slug, `${width}x${height}`);
}
