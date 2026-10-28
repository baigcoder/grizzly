#!/usr/bin/env node
/**
 * Product thumbnails for the bag, shop cards, related flavors and the fly-to-bag animation:
 * WebP with alpha from the transparent PNG sources in assets_label-art/thumbs, which are renders of the 3D can
 * (scripts/thumb-studio.ts), at 3x. The WebP is 2x of the 187 × 491 card frame: sharp on retina, light on the wire.
 *   node scripts/build-thumbs.mjs
 */
import sharp from 'sharp';
import { mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'assets_label-art/thumbs');
const out = resolve(root, 'public/products/thumbs');
await mkdir(out, { recursive: true });
for (const file of (await readdir(src)).filter((name) => name.endsWith('.png'))) {
  const target = resolve(out, file.replace(/\.png$/, '.webp'));
  const info = await sharp(resolve(src, file)).resize({ width: 374 }).webp({ quality: 78, alphaQuality: 85, effort: 6 }).toFile(target);
  console.log(`${file} -> ${info.size} bytes`);
}
