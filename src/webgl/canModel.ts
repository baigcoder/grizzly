import * as THREE from 'three';
import { CAN, LID_Y, TAB_PIVOT, getCanGeometry } from './canGeometry';
import { SCENE_COLOR } from './palette';
import { type CanWetUniforms, createWetUniforms, WET_ALBEDO, WET_CLEARCOAT, WET_FIELD, WET_LIGHT, WET_NORMAL, WET_PARS, WET_ROUGHNESS } from './condensation';

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
 */
let cachedRingTexture: THREE.Texture | null = null;

function getRingTexture(): THREE.Texture {
  if (cachedRingTexture) return cachedRingTexture;
  const rows = 256;
  const data = new Uint8Array(4 * rows * 4);
  let seed = 23;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let y = 0; y < rows; y += 1) {
    // fine tooling marks over a few broader polished / satin bands
    const band = 0.5 + 0.5 * Math.sin(y * 0.21);
    const value = Math.round(255 * (0.45 + 0.35 * band * (0.7 + 0.3 * rand()) + 0.2 * rand() * (y % 3 === 0 ? 1 : 0)));
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

/**
 * Per-can shader controls, mutated from the render loop (never re-created).
 * - focus: 1 = lit hero can, 0 = background can that falls almost to black.
 * - glowRect: UV rect (u0, v0, u1, v1) of the label block that glows during benefits.
 * - glowStrength: emissive gain of that block (0 = off).
 * - labelDim: extra darkening of the printed label (benefit chapters turn the can dark).
 * - uWet*: cold condensation after the can is opened (condensation.ts; 0 = dry, the layer is skipped).
 */
export interface CanSurfaceUniforms extends CanWetUniforms {
  uFocus: { value: number };
  uLabelDim: { value: number };
  uGlowRect: { value: THREE.Vector4 };
  uGlowColor: { value: THREE.Color };
  uGlowStrength: { value: number };
  uBrushMap: { value: THREE.Texture };
  /** Thin fresnel rim in the can's own flavor accent. */
  uRimColor: { value: THREE.Color };
  uRimStrength: { value: number };
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
    ...createWetUniforms(),
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
        float gzMetal = 0.0;
        float gzBrush = 0.5;
        float gzRect(vec2 p, vec4 r, float soft) {
          vec2 lo = smoothstep(r.xy - soft, r.xy + soft, p);
          vec2 hi = 1.0 - smoothstep(r.zw - soft, r.zw + soft, p);
          return lo.x * lo.y * hi.x * hi.y;
        }
        ${WET_PARS}`
      )
      .replace(
        '#include <map_fragment>',
        `${WET_FIELD}
        #include <map_fragment>
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
          vec3 silver = vec3(0.86, 0.87, 0.9) * (0.88 + 0.24 * gzBrush);
          diffuseColor.rgb = mix(deepInk, max(deepInk, silver * 0.92), gzMetal);
          // Benefit spotlight: the rest of the label drops to ~25%, the active block stays at full brightness.
          float gzSpot = gzRect(vMapUv, uGlowRect, 0.008) * step(0.001, uGlowStrength);
          diffuseColor.rgb *= mix(1.0, 0.1, uLabelDim * (1.0 - gzSpot)) * (1.0 + 0.7 * uLabelDim * gzSpot);
        #endif
        // out-of-focus cans fall to near-black silhouettes; their chrome ends and edges stay lit
        diffuseColor.rgb *= mix(0.07, 1.0, uFocus * uFocus);
        #ifdef USE_MAP
          // studio falloff down the body: lit under the lid, a touch darker at the base (packshot light)
          diffuseColor.rgb *= mix(0.8, 1.04, smoothstep(0.03, 0.97, vMapUv.y));
        #endif
        ${WET_ALBEDO}`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#ifdef USE_ROUGHNESSMAP
          float roughnessFactor = roughness * texture2D(roughnessMap, vRoughnessMapUv).g * (0.85 + 0.3 * gzBrush);
        #else
          float roughnessFactor = roughness * mix(0.46, 0.2, gzMetal) * (0.82 + 0.36 * gzBrush);
        #endif
        ${WET_ROUGHNESS}`
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#ifdef USE_METALNESSMAP
          float metalnessFactor = metalness * texture2D(metalnessMap, vMetalnessMapUv).b;
        #else
          float metalnessFactor = metalness * mix(0.72, 1.0, gzMetal);
        #endif`
      )
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${WET_NORMAL}`)
      .replace('#include <clearcoat_normal_fragment_maps>', `#include <clearcoat_normal_fragment_maps>
        ${WET_CLEARCOAT}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        ${WET_LIGHT}
        {
          float rimFacing = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
          totalEmissiveRadiance += uRimColor * uRimStrength * pow(rimFacing, 4.0);
        }
        #ifdef USE_MAP
          if (uGlowStrength > 0.001) {
            vec3 gzTexel = texture2D(map, vMapUv).rgb;
            float gzText = max(gzTexel.r, max(gzTexel.g, gzTexel.b));
            float core = gzRect(vMapUv, uGlowRect, 0.006);
            float halo = gzRect(vMapUv, uGlowRect + vec4(-0.03, -0.04, 0.03, 0.04), 0.04);
            totalEmissiveRadiance += uGlowColor * uGlowStrength * (core * 4.5 * gzText * gzText * gzText + halo * 0.07);
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
  normal: THREE.Texture | null = null
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
        clearcoatRoughness: 0.08, // a glossy varnish: one crisp streak down the key side, as in the reference
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
        envMapIntensity: 0.6,
      });
  return { bodyMat, aluminumMat };
}

const baseMaterials = new WeakMap<THREE.Material, THREE.Material>();
function getBaseMaterial(aluminum: THREE.Material): THREE.Material {
  let base = baseMaterials.get(aluminum);
  if (!base) {
    base = aluminum.clone();
    (base as THREE.MeshStandardMaterial).roughness = 0.46;
    (base as THREE.MeshStandardMaterial).color.setHex(SCENE_COLOR.baseRim);
    baseMaterials.set(aluminum, base);
  }
  return base;
}

/** Dims the aluminium ends together with the label so out-of-focus cans go dark. */
export function setCanFocus(can: THREE.Object3D, focus: number) {
  const boost = (can.userData.rimBoost as number | undefined) ?? 0;
  if (can.userData.focus === focus && can.userData.appliedBoost === boost) return;
  can.userData.focus = focus;
  can.userData.appliedBoost = boost;
  can.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const surface = material.userData.surface as CanSurfaceUniforms | undefined;
    if (surface) {
      surface.uFocus.value = focus;
      // side cans lose their gloss with their light (bright streaks on a dark label read as glass tubes, not cans)
      const lit = focus * focus;
      material.envMapIntensity = 0.12 + 0.88 * lit;
      // only a whisper of edge separation on dark side cans, none on lit ones (at 0.45 the flavor-coloured fresnel
      // read as a glow round every can in the ring and the line-up)
      surface.uRimStrength.value = 0.1 * (1 - focus) + boost;
      const physical = material as THREE.MeshPhysicalMaterial;
      if (physical.isMeshPhysicalMaterial) {
        physical.clearcoat = 0.06 + 0.94 * lit; // never 0: avoids a shader recompile
        // side cans' varnish goes soft, so the key strip reads as a gentle sheen, not a sharp white line
        physical.clearcoatRoughness = 0.08 + 0.32 * (1 - focus);
      }
    } else if (material.color) {
      // machined aluminium: dim it with the label, relative to its authored colour and reflectance
      const base = (material.userData.base ??= { color: material.color.clone(), env: material.envMapIntensity, roughness: material.roughness }) as {
        color: THREE.Color;
        env: number;
        roughness: number;
      };
      // the machined ends drop to a dark, satin metal grey on side cans, as in the reference (never blown white or
      // glinting): darker, and rougher so their rims stop catching crisp highlights
      const lit = focus * focus;
      material.color.copy(base.color).multiplyScalar(0.16 + 0.84 * lit);
      material.envMapIntensity = base.env * (0.1 + 0.9 * lit);
      material.roughness = base.roughness + 0.3 * (1 - focus);
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
  normal: THREE.Texture | null = null
): THREE.Group {
  const materials = createCanMaterials(texture, surface, isLowPower, normal);
  const geometry = getCanGeometry();
  const group = new THREE.Group();

  const shell = new THREE.Mesh(geometry.shell, materials.bodyMat);
  shell.name = 'Shell';
  const top = new THREE.Mesh(geometry.top, materials.aluminumMat);
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
