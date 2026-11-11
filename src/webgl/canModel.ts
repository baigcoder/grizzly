import * as THREE from 'three';
import { CAN, LID_Y, TAB_PIVOT, getCanGeometry } from './canGeometry';
import { SCENE_COLOR } from './palette';

/**
 * Grizzly can asset and material pipeline.
 *
 * 1. Geometry is modelled in code (canGeometry.ts): shell, neck/seam/lid, tab, domed base.
 * 2. Body material: satin black lacquer over metal with a clear coat; the label surface
 *    map (G roughness, B metalness) turns the wordmark into brushed silver, and the
 *    normal map embosses it. The benefit spotlight is a shader extension.
 * 3. Ends: machined aluminium.
 * Label textures arrive asynchronously (labelTextures.ts); until then a neutral dark
 * placeholder is shown, never another brand's artwork.
 */

/** Solid-colour 4×4 placeholder used until the real label art has been transcoded. */
export function createSolidTexture(r: number, g: number, b: number, srgb: boolean): THREE.DataTexture {
  const data = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < 16; i += 1) data.set([r, g, b, 255], i * 4);
  const texture = new THREE.DataTexture(data, 4, 4, THREE.RGBAFormat);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** Near-black label used before the artwork loads. */
export const createPlaceholderLabel = () => createSolidTexture(10, 11, 14, true);

/** Flat normal (128,128,255) used until the emboss map loads. */
export const createFlatNormalTexture = (): THREE.Texture => createSolidTexture(128, 128, 255, false);

/** Satin-black surface (G roughness, B metalness) used until the real map loads. */
export const createNeutralSurfaceTexture = (): THREE.Texture => createSolidTexture(255, 110, 90, false);

/**
 * Machined rings for the can ends: a thin strip of roughness values along the lathe profile (uv.y runs along the
 * profile, so every row is one concentric ring of the lid or base). Polished bands alternate with slightly duller
 * tooling marks, so the ends mirror the studio in crisp rings instead of one uniform white band. Generated once.
 *
 * Smooth on purpose, and mip-mapped: a random value per row (plus a spike every third row), read without filtering,
 * turned the small ends of the hero cans into grainy, sparkling noise as each pixel jumped between rows.
 */
let cachedRingTexture: THREE.Texture | null = null;

function getRingTexture(): THREE.Texture {
  if (cachedRingTexture) return cachedRingTexture;
  const rows = 256;
  const data = new Uint8Array(4 * rows * 4);
  for (let y = 0; y < rows; y += 1) {
    // a few broad polished / satin bands, with faint fine rings riding on them
    const band = 0.5 + 0.5 * Math.sin(y * 0.21);
    const fine = 0.5 + 0.5 * Math.sin(y * 1.3);
    const value = Math.round(255 * (0.5 + 0.3 * band + 0.06 * fine));
    for (let x = 0; x < 4; x += 1) {
      const k = (y * 4 + x) * 4;
      data[k] = value;
      data[k + 1] = value; // G: roughness
      data[k + 2] = value;
      data[k + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, 4, rows, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  cachedRingTexture = texture;
  return texture;
}

// Shared brushed-aluminium grain (horizontal streaks), generated once. One texture for every can.
let cachedBrushTexture: THREE.Texture | null = null;

function getBrushTexture(): THREE.Texture {
  if (cachedBrushTexture) return cachedBrushTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    let seed = 11;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    ctx.fillStyle = 'rgb(128,128,128)';
    ctx.fillRect(0, 0, size, size);
    // Long, thin streaks that wrap horizontally so the grain tiles around the can.
    for (let i = 0; i < 1400; i += 1) {
      const y = rand() * size;
      const x = rand() * size;
      const length = 40 + rand() * 180;
      const tone = 70 + rand() * 120;
      ctx.fillStyle = `rgba(${tone},${tone},${tone},${0.1 + rand() * 0.25})`;
      for (const ox of [-size, 0, size]) ctx.fillRect(x + ox, y, length, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  cachedBrushTexture = tex;
  return tex;
}

// Fine spun-metal grain for the ends: the brushed streaks again, tiled round the lid and base (u runs round the can).
// Used as a bump, it breaks the smooth studio reflections into the micro-streaks real aluminium has. One shared texture.
let cachedGrainTexture: THREE.Texture | null = null;

function getGrainTexture(): THREE.Texture {
  if (cachedGrainTexture) return cachedGrainTexture;
  const grain = getBrushTexture().clone();
  grain.repeat.set(16, 8);
  grain.anisotropy = 4;
  grain.needsUpdate = true;
  cachedGrainTexture = grain;
  return grain;
}

/**
 * Per-can shader controls, mutated from the render loop (never re-created).
 * - focus: 1 = lit hero can, 0 = background can that falls almost to black.
 * - glowRect: UV rect (u0, v0, u1, v1) of the label block that glows during benefits.
 * - glowStrength: emissive gain of that block (0 = off).
 * - labelDim: extra darkening of the printed label (benefit chapters turn the can dark).
 */
export interface CanSurfaceUniforms {
  uFocus: { value: number };
  uLabelDim: { value: number };
  uGlowRect: { value: THREE.Vector4 };
  uGlowColor: { value: THREE.Color };
  uGlowStrength: { value: number };
  uBrushMap: { value: THREE.Texture };
  /** Thin fresnel rim in the can's own flavor accent. */
  uRimColor: { value: THREE.Color };
  uRimStrength: { value: number };
  /** Light off moving water (the Zamzam chapter): a shifting gold web on the can's lower body. 0 = off. */
  uCaustic: { value: number };
  uCausticTime: { value: number };
  /** The flavor's finish (see CAN_FINISH): brightness curve, saturation, ink metalness, ink gloss. */
  uInkGamma: { value: number };
  uInkSat: { value: number };
  uInkMetal: { value: number };
  uInkRough: { value: number };
}

/**
 * Brushed aluminium + printed ink, derived from one label texture:
 * - near-white artwork (the logo) is bare brushed metal: metalness 1, silver albedo;
 * - coloured artwork is lacquered ink on metal: deep, slightly desaturated, still metallic;
 * - the shared grain map modulates roughness so the brushing reads in highlights.
 */
function applyCanSurfaceShader(material: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial) {
  const uniforms: CanSurfaceUniforms = {
    uFocus: { value: 1 },
    uLabelDim: { value: 0 },
    uGlowRect: { value: new THREE.Vector4(0, 0, 0, 0) },
    uGlowColor: { value: new THREE.Color(1, 1, 1) },
    uGlowStrength: { value: 0 },
    uBrushMap: { value: getBrushTexture() },
    uRimColor: { value: new THREE.Color(1, 1, 1) },
    uRimStrength: { value: 0 },
    uCaustic: { value: 0 },
    uCausticTime: { value: 0 },
    uInkGamma: { value: 1 },
    uInkSat: { value: 1 },
    uInkMetal: { value: 0 },
    uInkRough: { value: 1 },
  };
  material.userData.surface = uniforms;
  material.customProgramCacheKey = () => 'gz-can-surface';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFocus;
        uniform float uLabelDim;
        uniform vec4 uGlowRect;
        uniform vec3 uGlowColor;
        uniform float uGlowStrength;
        uniform sampler2D uBrushMap;
        uniform vec3 uRimColor;
        uniform float uRimStrength;
        uniform float uCaustic;
        uniform float uCausticTime;
        uniform float uInkGamma;
        uniform float uInkSat;
        uniform float uInkMetal;
        uniform float uInkRough;
        float gzMetal = 0.0;
        float gzBrush = 0.5;
        float gzRect(vec2 p, vec4 r, float soft) {
          vec2 lo = smoothstep(r.xy - soft, r.xy + soft, p);
          vec2 hi = 1.0 - smoothstep(r.zw - soft, r.zw + soft, p);
          return lo.x * lo.y * hi.x * hi.y;
        }`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        #ifdef USE_MAP
          vec3 gzInk = diffuseColor.rgb;
          #ifdef USE_METALNESSMAP
            gzMetal = smoothstep(0.6, 0.95, texture2D(metalnessMap, vMapUv).b);
          #else
            gzMetal = smoothstep(0.42, 0.78, min(gzInk.r, min(gzInk.g, gzInk.b)));
          #endif
          gzBrush = texture2D(uBrushMap, vMapUv * vec2(3.0, 2.4)).r;
          float gzLum = dot(gzInk, vec3(0.2126, 0.7152, 0.0722));
          #ifdef USE_METALNESSMAP
            vec3 deepInk = gzInk; // printed artwork keeps its own colour
          #else
            vec3 deepInk = mix(gzInk, vec3(gzLum), 0.18) * 0.78;
          #endif
          // the flavor's finish: a brightness curve (lifts the darkest inks) and saturation, on the printed ink only
          deepInk = pow(max(deepInk, vec3(0.0)), vec3(uInkGamma));
          deepInk = mix(vec3(dot(deepInk, vec3(0.2126, 0.7152, 0.0722))), deepInk, uInkSat);
          #ifdef USE_METALNESSMAP
            // bare metal keeps the label's own metal colour (silver, or the gold / copper of a limited edition),
            // brushed; lifting it toward a fixed silver turned every tinted metal white
            vec3 bare = gzInk * (0.88 + 0.24 * gzBrush);
          #else
            vec3 bare = max(deepInk, vec3(0.86, 0.87, 0.9) * (0.88 + 0.24 * gzBrush) * 0.92);
          #endif
          diffuseColor.rgb = mix(deepInk, bare, gzMetal);
          // Benefit spotlight, as in the reference: the can goes dark and a soft pool of light rests on the active
          // block (feathered well past its edges), lifting it a little rather than blowing it out. A hard 1.7× box
          // read as a pasted rectangle on the flat colour labels.
          float gzSpot = gzRect(vMapUv, uGlowRect + vec4(-0.012, -0.02, 0.012, 0.02), 0.03) * step(0.001, uGlowStrength);
          diffuseColor.rgb *= mix(1.0, 0.07, uLabelDim * (1.0 - gzSpot)) * (1.0 + 0.18 * uLabelDim * gzSpot);
        #endif
        // out-of-focus cans fall to near-black silhouettes; their chrome ends and edges stay lit
        diffuseColor.rgb *= mix(0.07, 1.0, uFocus * uFocus);
        #ifdef USE_MAP
          // studio falloff down the body: lit under the lid, a touch darker at the base (packshot light)
          diffuseColor.rgb *= mix(0.8, 1.04, smoothstep(0.03, 0.97, vMapUv.y));
        #endif`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#ifdef USE_ROUGHNESSMAP
          float roughnessFactor = roughness * texture2D(roughnessMap, vRoughnessMapUv).g * (0.85 + 0.3 * gzBrush) * mix(uInkRough, 1.0, gzMetal);
        #else
          float roughnessFactor = roughness * mix(0.46, 0.2, gzMetal) * (0.82 + 0.36 * gzBrush);
        #endif`
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#ifdef USE_METALNESSMAP
          float metalnessFactor = metalness * max(texture2D(metalnessMap, vMetalnessMapUv).b, uInkMetal * (1.0 - gzMetal));
        #else
          float metalnessFactor = metalness * mix(0.72, 1.0, gzMetal);
        #endif`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float rimFacing = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
          totalEmissiveRadiance += uRimColor * uRimStrength * pow(rimFacing, 4.0);
        }
        #ifdef USE_MAP
          if (uCaustic > 0.001) {
            // Light thrown up from moving water, as on the wall of a pool: a net of soft bright cells that drift and
            // merge (the classic iterated caustic field), strongest at the foot and gone by the shoulder. It tiles
            // three times round the can, so it has no seam, and it stays off the lit block so its text reads clean.
            // (It was two crossed sine waves: thin even lines that read as gold wire drawn on the label.)
            vec2 gzP = mod(vec2(vMapUv.x * 3.0, vMapUv.y * 2.4) * 6.2831853, 6.2831853) - 250.0;
            vec2 gzI = gzP;
            float gzC = 1.0;
            float gzT = uCausticTime * 0.45 + 23.0;
            for (int n = 0; n < 4; n++) {
              float tt = gzT * (1.0 - (3.5 / float(n + 1)));
              gzI = gzP + vec2(cos(tt - gzI.x) + sin(tt + gzI.y), sin(tt - gzI.y) + cos(tt + gzI.x));
              gzC += 1.0 / length(vec2(gzP.x / (sin(gzI.x + tt) / 0.005), gzP.y / (cos(gzI.y + tt) / 0.005)));
            }
            gzC = 1.17 - pow(gzC / 4.0, 1.4);
            float gzWeb = pow(abs(gzC), 8.0);
            float gzFoot = 1.0 - smoothstep(0.0, 0.72, vMapUv.y);
            totalEmissiveRadiance += vec3(1.0, 0.74, 0.4) * gzWeb * gzFoot * (0.2 + 0.8 * gzFoot) * (1.0 - 0.85 * gzSpot) * uCaustic * 0.5;
          }
          if (uGlowStrength > 0.001) {
            // only the white type glows (its weakest channel is high; a bright flavor field's is not), with a faint
            // tinted haze around the block
            vec3 gzTexel = texture2D(map, vMapUv).rgb;
            float gzWhite = smoothstep(0.55, 0.92, min(gzTexel.r, min(gzTexel.g, gzTexel.b)));
            float core = gzRect(vMapUv, uGlowRect, 0.012);
            float halo = gzRect(vMapUv, uGlowRect + vec4(-0.04, -0.05, 0.04, 0.05), 0.06);
            totalEmissiveRadiance += uGlowColor * uGlowStrength * (core * 1.6 * gzWhite + halo * 0.035);
          }
        #endif`
      );
  };
}

/**
 * Creates physical materials for can components: brushed-aluminium label shell and
 * machined aluminium ends. Low-power devices keep the same look on MeshStandardMaterial.
 */
export function createCanMaterials(
  texture: THREE.Texture,
  surface: THREE.Texture | null = null,
  isLowPower: boolean = false,
  normal: THREE.Texture | null = null,
  metalEnv: THREE.Texture | null = null
): { bodyMat: THREE.Material; aluminumMat: THREE.Material } {
  // Satin black body, brushed silver only where the surface map says so;
  // the normal map embosses the wordmark.
  const surfaceMaps = {
    ...(surface ? { metalnessMap: surface, roughnessMap: surface } : {}),
    ...(normal ? { normalMap: normal, normalScale: new THREE.Vector2(0.8, 0.8) } : {}),
  };
  const bodyMat = isLowPower
    ? new THREE.MeshStandardMaterial({
        map: texture,
        ...surfaceMaps,
        metalness: 1,
        roughness: 1,
        envMapIntensity: 1,
      })
    : new THREE.MeshPhysicalMaterial({
        map: texture,
        ...surfaceMaps,
        metalness: 1,
        roughness: 1,
        anisotropy: 0.3,
        anisotropyRotation: 0,
        // printed cans are varnished: a crisp clear coat gives the long vertical studio highlight
        clearcoat: 1,
        clearcoatRoughness: 0.16, // a glossy varnish with a soft streak (0.08 mirrored the key strip as a hard line)
        envMapIntensity: 1,
      });
  applyCanSurfaceShader(bodyMat);

  // Polished, machined aluminium: crisp reflections of the dark studio with thin bright rings (the ring map varies
  // the polish along the profile). At roughness 0.38 with a strong anisotropic smear the softbox spread into one
  // uniform white band, and the lid and base read as plastic.
  const aluminumMat = isLowPower
    ? new THREE.MeshStandardMaterial({
        color: SCENE_COLOR.lid,
        metalness: 1,
        roughness: 0.4,
        roughnessMap: getRingTexture(),
        envMapIntensity: 0.6,
      })
    : new THREE.MeshPhysicalMaterial({
        color: SCENE_COLOR.base,
        metalness: 1,
        // × the ring map (0.45–1): about 0.19–0.42 across the rings. A touch of satin so the rim light and the
        // overhead softbox give the neck and lid a soft sheen, not a white glare.
        roughness: 0.42,
        roughnessMap: getRingTexture(),
        anisotropy: 0.08,
        envMapIntensity: 0.85,
      });
  // the ends mirror their own sharper lightbox (studioEnv.createMetalEnvironment); the clones for the lid and base inherit it
  if (metalEnv) (aluminumMat as THREE.MeshStandardMaterial).envMap = metalEnv;
  return { bodyMat, aluminumMat };
}

/** The lid's and base's own geometry carries baked occlusion in its vertex colours; the grain roughens the reflections. */
function applyEndDetail(metal: THREE.MeshStandardMaterial) {
  metal.vertexColors = true;
  metal.bumpMap = getGrainTexture();
  metal.bumpScale = 0.45;
  // spun metal: highlights stretch across the turning marks, the arc-shaped sheen of a real lid and dome
  const physical = metal as THREE.MeshPhysicalMaterial;
  if (physical.isMeshPhysicalMaterial) {
    physical.anisotropy = 0.55;
    physical.anisotropyRotation = 0;
  }
}

const baseMaterials = new WeakMap<THREE.Material, THREE.Material>();
export function getBaseMaterial(aluminum: THREE.Material): THREE.Material {
  let base = baseMaterials.get(aluminum);
  if (!base) {
    base = aluminum.clone();
    const metal = base as THREE.MeshStandardMaterial;
    // The base faces the dark studio floor: as a plain mirror it reflected nothing and read as a black hole, the can
    // an open tube. Satin aluminium, a fuller reflection and a faint fill of its own keep the dome and stand ring
    // reading as metal (the fill dims with the can's focus, see setCanFocus).
    // Satin, as on the reference can: a smooth grey dome with one bright stand ring. At roughness 0.34 (0.17 to 0.29
    // after the ring map) with the full grain bump, the dome mirrored the lightbox as busy, wavy streaks, like glass.
    metal.roughness = 0.62;
    metal.color.setHex(SCENE_COLOR.baseRim);
    metal.envMapIntensity = 1.15;
    metal.emissive.setHex(SCENE_COLOR.baseFill).multiplyScalar(0.07);
    applyEndDetail(metal);
    metal.bumpScale = 0.15;
    // a lighter spun-metal stretch than the lid: enough to pull the lightbox strips onto the stand ring (at 0 the base
    // went flat dark grey), not enough to streak the dome
    if ((metal as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) (metal as THREE.MeshPhysicalMaterial).anisotropy = 0.2;
    baseMaterials.set(aluminum, base);
  }
  return base;
}

const topMaterials = new WeakMap<THREE.Material, THREE.Material>();
/**
 * The neck and lid face the big overhead softbox: in the shared light satin aluminium they mirrored it as one flat
 * white wash, like painted plastic. A darker, glossier metal reflects the studio as dark and bright bands instead
 * (the tab keeps the shared material).
 */
export function getTopMaterial(aluminum: THREE.Material): THREE.Material {
  let top = topMaterials.get(aluminum);
  if (!top) {
    top = aluminum.clone();
    const metal = top as THREE.MeshStandardMaterial;
    metal.color.setHex(SCENE_COLOR.lidMetal);
    metal.roughness = 0.3;
    metal.envMapIntensity = 0.78;
    applyEndDetail(metal);
    topMaterials.set(aluminum, top);
  }
  return top;
}

/** The label's default share of the studio reflection (see setCanFocus). */
export const SATIN_GLOSS = 0.55;

/** Dims the aluminium ends together with the label so out-of-focus cans go dark. */
export function setCanFocus(can: THREE.Object3D, focus: number) {
  const boost = (can.userData.rimBoost as number | undefined) ?? 0;
  // how much of the studio the label mirrors (1 = full). Every can is satin by default: at full strength the broad
  // softbox washed the ink pale and milky, where the reference can is deep colour with one sheen. The scene lowers it
  // further on the featured can in the benefit chapters.
  const gloss = (can.userData.gloss as number | undefined) ?? SATIN_GLOSS;
  if (can.userData.focus === focus && can.userData.appliedBoost === boost && can.userData.appliedGloss === gloss) return;
  can.userData.focus = focus;
  can.userData.appliedBoost = boost;
  can.userData.appliedGloss = gloss;
  can.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const surface = material.userData.surface as CanSurfaceUniforms | undefined;
    if (surface) {
      surface.uFocus.value = focus;
      // side cans lose their gloss with their light (bright streaks on a dark label read as glass tubes, not cans)
      const lit = focus * focus;
      material.envMapIntensity = (0.12 + 0.88 * lit) * gloss;
      // only a whisper of edge separation on dark side cans, none on lit ones (at 0.45 the flavor-coloured fresnel
      // read as a glow round every can in the ring and the line-up)
      surface.uRimStrength.value = 0.1 * (1 - focus) + boost;
      const physical = material as THREE.MeshPhysicalMaterial;
      if (physical.isMeshPhysicalMaterial) {
        // a satin can (gloss below 1), as on the reference: a thinner, softer varnish, so the
        // studio rolls across it as a quiet sheen and the print keeps its contrast (a glossy coat laid a milky haze
        // over the small text)
        const satin = Math.min(1, (1 - gloss) / 0.45);
        physical.clearcoat = (0.06 + 0.94 * lit) * (1 - 0.55 * satin); // never 0: avoids a shader recompile
        // side cans' varnish goes soft, so the key strip reads as a gentle sheen, not a sharp white line
        physical.clearcoatRoughness = 0.16 + 0.24 * (1 - focus) + 0.26 * satin;
      }
    } else if (material.color) {
      // machined aluminium: dim it with the label, relative to its authored colour and reflectance
      const base = (material.userData.base ??= {
        color: material.color.clone(),
        emissive: material.emissive?.clone(),
        env: material.envMapIntensity,
        roughness: material.roughness,
      }) as { color: THREE.Color; emissive?: THREE.Color; env: number; roughness: number };
      // the machined ends drop to a dark, satin metal grey on side cans, as in the reference (never blown white or
      // glinting): darker, and rougher so their rims stop catching crisp highlights
      const lit = focus * focus;
      material.color.copy(base.color).multiplyScalar(0.5 + 0.5 * lit);
      if (base.emissive) material.emissive.copy(base.emissive).multiplyScalar(lit);
      material.envMapIntensity = base.env * (0.4 + 0.6 * lit);
      material.roughness = base.roughness + 0.12 * (1 - focus);
    }
  });
}

/** Scales the reflectance of the can's metal ends (the opening holds the lid in a dark, cold light). */
export function setCanLidExposure(can: THREE.Object3D, exposure: number) {
  ['Top', 'Tab'].forEach((name) => {
    const material = (can.getObjectByName(name) as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined;
    if (!material) return;
    const base = (material.userData.base ??= { color: material.color.clone(), env: material.envMapIntensity, roughness: material.roughness }) as { env: number };
    material.envMapIntensity = base.env * exposure;
  });
}

/** Tints the can's rim light with its flavor accent (called once per can). */
export function setCanAccent(can: THREE.Object3D, hex: string) {
  const surface = getCanSurface(can);
  surface?.uRimColor.value.set(hex);
}

/**
 * Per-flavor finish, from measuring each label (mean brightness 0.18 to 0.63) and seeing it lit. Every flavor's ink was
 * printed at the same metalness (0.35), a satin paint; these lift the darkest inks, deepen the dull ones and let the colour
 * read as metal (more ink metalness, a little more gloss), so each can looks like coloured aluminium and not a painted tube.
 * gamma < 1 brightens darks; saturation > 1 deepens colour; rough < 1 is glossier.
 */
export const CAN_FINISH: Record<string, { gamma: number; saturation: number; metal: number; rough: number }> = {
  'blue-raspberry': { gamma: 0.95, saturation: 1.22, metal: 0.5, rough: 0.85 },
  'mango-fuego': { gamma: 0.95, saturation: 1.08, metal: 0.55, rough: 0.8 },
  watermelon: { gamma: 0.95, saturation: 1.08, metal: 0.5, rough: 0.85 },
  'strawberry-kiwi': { gamma: 0.88, saturation: 1.12, metal: 0.5, rough: 0.85 },
  peach: { gamma: 0.85, saturation: 1.28, metal: 0.5, rough: 0.85 },
  'blackout-berry': { gamma: 0.9, saturation: 1.4, metal: 0.5, rough: 0.85 },
  'falsa-frost': { gamma: 0.62, saturation: 1.45, metal: 0.45, rough: 0.8 },
  'cold-coffee': { gamma: 0.9, saturation: 1.12, metal: 0.55, rough: 0.85 },
};

/** Applies a flavor's finish to a label material (a can's shell, or a pack's instanced shell). */
export function setMaterialFinish(material: THREE.Material, flavorId: string) {
  const surface = material.userData.surface as CanSurfaceUniforms | undefined;
  const finish = CAN_FINISH[flavorId];
  if (!surface || !finish) return;
  surface.uInkGamma.value = finish.gamma;
  surface.uInkSat.value = finish.saturation;
  surface.uInkMetal.value = finish.metal;
  surface.uInkRough.value = finish.rough;
}

/** Applies a flavor's finish to a can (call when the can takes a flavor). */
export function setCanFinish(can: THREE.Object3D, flavorId: string) {
  const shell = can.getObjectByName('Shell') as THREE.Mesh | undefined;
  if (shell) setMaterialFinish(shell.material as THREE.Material, flavorId);
}

/** Returns the label-shell shader controls of a can (glow, label dimming). */
export function getCanSurface(can: THREE.Object3D): CanSurfaceUniforms | undefined {
  const shell = can.getObjectByName('Shell') as THREE.Mesh | undefined;
  return (shell?.material as THREE.Material | undefined)?.userData.surface as CanSurfaceUniforms | undefined;
}

export interface CanMaterials {
  bodyMat: THREE.Material;
  aluminumMat: THREE.Material;
}

/** Handles used by the opening moment and the roar: tab pivot, drinking hole. */
export interface CanParts {
  tabPivot: THREE.Group;
  opening: THREE.Mesh;
}

/** Builds one can from the shared geometry set. Child names: Shell, Top, Bottom, TabPivot > Tab, Opening. */
export function createCanMesh(
  texture: THREE.Texture,
  surface: THREE.Texture | null = null,
  isLowPower: boolean = false,
  normal: THREE.Texture | null = null,
  metalEnv: THREE.Texture | null = null
): THREE.Group {
  const materials = createCanMaterials(texture, surface, isLowPower, normal, metalEnv);
  const geometry = getCanGeometry();
  const group = new THREE.Group();

  const shell = new THREE.Mesh(geometry.shell, materials.bodyMat);
  shell.name = 'Shell';
  const top = new THREE.Mesh(geometry.top, getTopMaterial(materials.aluminumMat));
  top.name = 'Top';
  const bottom = new THREE.Mesh(geometry.bottom, getBaseMaterial(materials.aluminumMat));
  bottom.name = 'Bottom';

  const tabPivot = new THREE.Group();
  tabPivot.name = 'TabPivot';
  tabPivot.position.copy(TAB_PIVOT);
  const tab = new THREE.Mesh(geometry.tab, materials.aluminumMat);
  tab.name = 'Tab';
  tab.position.set(0, 0, -0.02);
  tabPivot.add(tab);

  const opening = new THREE.Mesh(geometry.opening, new THREE.MeshBasicMaterial({ color: SCENE_COLOR.canOpening }));
  opening.name = 'Opening';
  opening.position.set(0, LID_Y + 0.004, -0.2);
  opening.visible = false;

  group.add(shell, top, bottom, tabPivot, opening);
  group.userData.parts = { tabPivot, opening } satisfies CanParts;
  return group;
}

export const getCanParts = (can: THREE.Object3D): CanParts | undefined => can.userData.parts as CanParts | undefined;

/** Frees every material owned by a can (geometry is shared and disposed with the scene). */
export function disposeCanMaterials(can: THREE.Object3D) {
  can.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    (mesh.material as THREE.Material).dispose();
  });
}

export { CAN };
