import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { FLAVORS } from '../data/flavors';
import { createFlatNormalTexture, createNeutralSurfaceTexture, createPlaceholderLabel } from './canModel';

/**
 * Label artwork streaming. Each flavor has GPU-compressed (KTX2/Basis) levels of detail:
 *   0 = 1k  (ETC1S, ~120 KB)  every can, from the first frame
 *   1 = 2k  (UASTC, ~1.2 MB)  the focused can and its neighbours; phones take the 2k ETC1S level (~340 KB)
 *   2 = 4k  (UASTC)           only the can being looked at up close (high tier)
 * plus a 2k surface map (roughness/metalness) and a 2k emboss normal map.
 * Compressed textures stay compressed in GPU memory (≈ 17 MB for a 4k label with mips,
 * against 70 MB uncompressed) and are transcoded in workers, not on the main thread.
 * If a .ktx2 file fails to load, the original WebP/PNG is used instead. The Basis transcoder is Emscripten code that
 * builds functions from strings, so a Content-Security-Policy without 'unsafe-eval' (vercel.json, public/_headers)
 * blocks it in its worker and the load never settles: when string evaluation is blocked here (the worker inherits
 * the page's policy) KTX2 is skipped from the start, and a stalled KTX2 load gives up after a few seconds.
 */
export type LabelMaps = { albedo: THREE.Texture; surface: THREE.Texture; normal: THREE.Texture; lod: number; surfaceReady: boolean };

const BASE = '/textures/grizzly';
const KTX2_TIMEOUT_MS = 6000;

/** False when the page's Content-Security-Policy blocks building functions from strings (no 'unsafe-eval'). */
function canEvaluateStrings() {
  try {
    return new Function('return true')() === true;
  } catch {
    return false;
  }
}

export class LabelTextures {
  private readonly loader: KTX2Loader;
  private readonly fallbackLoader = new THREE.TextureLoader();
  private readonly maps: LabelMaps[];
  private readonly requested = new Map<string, Promise<void>>();
  private readonly anisotropy: number;
  private disposed = false;
  /** KTX2 transcoding works here; set false for good once it is blocked or stalls, so later loads skip it. */
  private ktx2 = canEvaluateStrings();
  /** Called with the flavor index whenever one of its maps is replaced. */
  public onChange: ((flavorIndex: number) => void) | null = null;
  /** Highest level this device may use (mobile stays at 2k). */
  public maxLod = 2;
  /** Phones: level 1 is the 2k label as ETC1S ("2k-lite", a quarter of the download) and level 2 the full-quality 2k
   * UASTC (crisp small print in the benefit close-ups) instead of 4k. */
  public phoneLevels = false;
  /** Low-power cans have no normal map, so their emboss maps are never downloaded. */
  public loadNormals = true;

  constructor(renderer: THREE.WebGLRenderer) {
    this.loader = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
    this.anisotropy = renderer.capabilities.getMaxAnisotropy();
    this.maps = FLAVORS.map(() => ({
      albedo: createPlaceholderLabel(),
      surface: createNeutralSurfaceTexture(),
      normal: createFlatNormalTexture(),
      lod: -1,
      surfaceReady: false,
    }));
  }

  get(flavorIndex: number): LabelMaps {
    return this.maps[flavorIndex % this.maps.length];
  }

  /** Ensures the albedo of a flavor is at least `lod`; resolves when swapped in. */
  ensureAlbedo(flavorIndex: number, lod: number): Promise<void> {
    const index = flavorIndex % FLAVORS.length;
    const target = Math.min(lod, this.maxLod);
    if (this.maps[index].lod >= target) return Promise.resolve();
    const key = `a${index}-${target}`;
    const pending = this.requested.get(key);
    if (pending) return pending;
    const slug = FLAVORS[index].id;
    const size = (this.phoneLevels ? ['1k', '2k-lite', '2k'] : ['1k', '2k', '4k'])[target];
    const promise = this.loadTexture(`${BASE}/ktx2/${slug}-${size}.ktx2`, `${BASE}/${slug}.webp`, true)
      .then((texture) => {
        if (this.disposed) return texture.dispose();
        const maps = this.maps[index];
        if (target <= maps.lod) return texture.dispose();
        const previous = maps.albedo;
        maps.albedo = texture;
        maps.lod = target;
        this.onChange?.(index);
        previous.dispose();
      })
      .catch((error) => console.warn(`[Grizzly] label ${slug} ${size} failed`, error));
    this.requested.set(key, promise);
    return promise;
  }

  /** Surface (roughness/metalness) and emboss normal for a flavor. */
  ensureSurface(flavorIndex: number): Promise<void> {
    const index = flavorIndex % FLAVORS.length;
    if (this.maps[index].surfaceReady) return Promise.resolve();
    const key = `s${index}`;
    const pending = this.requested.get(key);
    if (pending) return pending;
    const slug = FLAVORS[index].id;
    const promise = Promise.all([
      this.loadTexture(`${BASE}/ktx2/${slug}-surface.ktx2`, `${BASE}/${slug}-surface.png`, false),
      this.loadNormals ? this.loadTexture(`${BASE}/ktx2/${slug}-normal.ktx2`, `${BASE}/${slug}-normal.png`, false) : Promise.resolve(null),
    ])
      .then(([surface, normal]) => {
        if (this.disposed) {
          surface.dispose();
          normal?.dispose();
          return;
        }
        const maps = this.maps[index];
        maps.surface.dispose();
        maps.surface = surface;
        if (normal) {
          maps.normal.dispose();
          maps.normal = normal;
        }
        maps.surfaceReady = true;
        this.onChange?.(index);
      })
      .catch((error) => console.warn(`[Grizzly] label surface ${slug} failed`, error));
    this.requested.set(key, promise);
    return promise;
  }

  /** Drops the 4k level of a flavor (keeps 2k) to bound GPU memory. */
  releaseHighDetail(flavorIndex: number) {
    const index = flavorIndex % FLAVORS.length;
    if (this.maps[index].lod < 2) return;
    this.requested.delete(`a${index}-2`);
    this.requested.delete(`a${index}-1`);
    this.maps[index].lod = 0; // the 2k level re-loads (from HTTP cache) and the 4k one is disposed on swap
    void this.ensureAlbedo(index, 1);
  }

  private async loadTexture(ktxUrl: string, fallbackUrl: string, srgb: boolean): Promise<THREE.Texture> {
    let texture: THREE.Texture;
    try {
      if (!this.ktx2) throw new Error('KTX2 transcoding unavailable');
      texture = await this.loadKtx2(ktxUrl);
    } catch {
      texture = await this.fallbackLoader.loadAsync(fallbackUrl);
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
    }
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = this.anisotropy;
    return texture;
  }

  /** A KTX2 load that settles: rejects if the transcoder has not answered within KTX2_TIMEOUT_MS. */
  private loadKtx2(url: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      let timedOut = false;
      const timer = window.setTimeout(() => {
        timedOut = true;
        this.ktx2 = false;
        reject(new Error(`KTX2 timed out: ${url}`));
      }, KTX2_TIMEOUT_MS);
      this.loader.loadAsync(url).then(
        (texture) => {
          window.clearTimeout(timer);
          // the fallback image has taken its place already
          if (timedOut) texture.dispose();
          else resolve(texture);
        },
        (error: unknown) => {
          window.clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  dispose() {
    this.disposed = true;
    this.maps.forEach((maps) => {
      maps.albedo.dispose();
      maps.surface.dispose();
      maps.normal.dispose();
    });
    this.loader.dispose();
  }
}
