#!/usr/bin/env node
/**
 * Encodes the flat label art into GPU-compressed KTX2 (Basis Universal) with mipmaps.
 *
 *   node scripts/build-ktx2.mjs            # all flavors
 *   node scripts/build-ktx2.mjs peach      # one flavor
 *   node scripts/build-ktx2.mjs --lite     # only the phone 2k level (all flavors)
 *
 * Input  (from scripts/build-labels.mjs): public/textures/grizzly/<slug>.webp, <slug>-surface.png, <slug>-normal.png
 * Output: public/textures/grizzly/ktx2/<slug>-{1k,2k,4k}.ktx2  albedo (sRGB): 1k = ETC1S (small, for the ring),
 *                                                              2k/4k = UASTC (sharp, for the focused can)
 *         public/textures/grizzly/ktx2/<slug>-2k-lite.ktx2     2k ETC1S for phones: the focused can at full 2k
 *                                                              sharpness for about a third of the UASTC download
 *         public/textures/grizzly/ktx2/<slug>-surface.ktx2     G roughness / B metalness, 2k UASTC (linear)
 *         public/textures/grizzly/ktx2/<slug>-normal.ktx2      emboss normal map, 2k UASTC (normal mode)
 * Sizes are multiples of 4 (block-compression requirement) and images are pre-flipped,
 * because compressed textures cannot use flipY at upload time.
 */
import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(resolve(root, 'src/data/grizzly.json'), 'utf8'));
const liteOnly = process.argv.includes('--lite');
const only = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const dir = resolve(root, 'public/textures/grizzly');
const out = resolve(dir, 'ktx2');
await mkdir(out, { recursive: true });

const imageDecoder = async (buffer) => {
  const { data: raw, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(raw), width: info.width, height: info.height };
};

async function encode(srcPath, outPath, width, height, options) {
  const png = await sharp(srcPath)
    .resize(width, height, { kernel: 'lanczos3', fit: 'fill' })
    .flip()
    .png()
    .toBuffer();
  const ktx2 = await encodeToKTX2(new Uint8Array(png), { generateMipmap: true, imageDecoder, enableDebug: false, ...options });
  await writeFile(outPath, ktx2);
  console.log(`${outPath.split('/').pop()}  ${(ktx2.length / 1024).toFixed(0)} KB`);
}

for (const flavor of data.flavors) {
  if (only && flavor.slug !== only) continue;
  const albedo = resolve(dir, `${flavor.slug}.webp`);
  const base = { isSetKTX2SRGBTransferFunc: true, isPerceptual: true };
  await encode(albedo, resolve(out, `${flavor.slug}-2k-lite.ktx2`), 2048, 1600, { ...base, isUASTC: false, qualityLevel: 255, compressionLevel: 4 });
  if (liteOnly) continue;
  await encode(albedo, resolve(out, `${flavor.slug}-1k.ktx2`), 1024, 800, { ...base, isUASTC: false, qualityLevel: 230, compressionLevel: 4 });
  await encode(albedo, resolve(out, `${flavor.slug}-2k.ktx2`), 2048, 1600, { ...base, isUASTC: true, uastcLDRQualityLevel: 2, enableRDO: true, rdoQualityLevel: 1, needSupercompression: true });
  await encode(albedo, resolve(out, `${flavor.slug}-4k.ktx2`), 4096, 3072, { ...base, isUASTC: true, uastcLDRQualityLevel: 2, enableRDO: true, rdoQualityLevel: 1.5, needSupercompression: true });
  await encode(resolve(dir, `${flavor.slug}-surface.png`), resolve(out, `${flavor.slug}-surface.ktx2`), 2048, 1600, { isUASTC: true, uastcLDRQualityLevel: 2, needSupercompression: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false });
  await encode(resolve(dir, `${flavor.slug}-normal.png`), resolve(out, `${flavor.slug}-normal.ktx2`), 2048, 1600, { isUASTC: true, uastcLDRQualityLevel: 2, needSupercompression: true, isNormalMap: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false });
}
