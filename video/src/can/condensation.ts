import * as THREE from 'three';
import { CAN } from './canDimensions';

/**
 * Cold condensation on the label shell, as a layer of the can's own surface shader (canModel.ts injects these chunks
 * into its onBeforeCompile). Water is shaded by the can's real lighting rather than painted on: each bead bends the
 * label seen through it (the albedo, metal and roughness maps are read at refracted UVs, so the print magnifies
 * inside the drop and darkens toward its rim), its surface normal replaces the varnish normal (the clear coat and the
 * metal reflect the studio as a tiny curved mirror), and a water term adds the fresnel reflection of the studio
 * environment, a pin-sharp glint of every directional light and the caustic that light focuses onto the far side.
 *
 * The drop field is procedural, in the label's UV space measured in world units (so beads stay round on the
 * cylinder): a fine mist of small beads in loose patches, fewer bigger beads, and a few heavy drops that start to
 * slide, leave a thin wet trail wiped clean of the mist, and the whole layer then dries out bead by bead.
 *
 * Trigger: CanSplash sets the uniforms of the opened can only. Persists: nothing. Time-driven (uWetTime: seconds since
 * the crack; WET_LIFE in all). WebGL: no extra draw call; every can shares the one program and skips the layer behind
 * a uniform branch while its uWet is 0. Optional: never shown under reduced motion. Fallback: a dry can.
 */

/** Seconds from the crack until the last bead has dried. */
export const WET_LIFE = 5.8;

/** Shader controls of the condensation layer (part of the can's surface uniforms). */
export interface CanWetUniforms {
  /** Master amount: 0 = dry (the layer is skipped), 1 = full. */
  uWet: { value: number };
  /** Seconds since the crack (the whole timeline runs off this). */
  uWetTime: { value: number };
  /** Shifts the bead pattern, so every opening condenses differently. */
  uWetSeed: { value: number };
  /** The faint flavor tint of the light focused through the beads. */
  uWetTint: { value: THREE.Color };
}

export function createWetUniforms(): CanWetUniforms {
  return { uWet: { value: 0 }, uWetTime: { value: 0 }, uWetSeed: { value: 0 }, uWetTint: { value: new THREE.Color(1, 1, 1) } };
}

const CIRCUMFERENCE = (Math.PI * 2 * CAN.radius).toFixed(4);
const HEIGHT = CAN.shellHeight.toFixed(4);

/** Declarations and the drop field; goes after `#include <common>`. */
export const WET_PARS = /* glsl */ `
  uniform float uWet;
  uniform float uWetTime;
  uniform float uWetSeed;
  uniform vec3 uWetTint;
  const vec2 GZ_WET_SIZE = vec2(${CIRCUMFERENCE}, ${HEIGHT});
  const float GZ_WET_DRY = 3.9; // the beads start to dry out (each at its own moment over the next ~1.5 s)
  float gzWetCover = 0.0;        // how much of this pixel lies under water (0..1)
  vec3 gzWetN = vec3(0.0, 0.0, 1.0); // the water surface normal, x round the can, y up the can
  vec2 gzWetQ = vec2(0.0);       // where in its bead the pixel lies, in bead radii
  float gzWetR = 0.0;            // that bead's radius (world units; 0 on a trail)

  vec3 gzWetHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yzz) * p3.zyx);
  }

  float gzWetNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = gzWetHash(i).x;
    float b = gzWetHash(i + vec2(1.0, 0.0)).x;
    float c = gzWetHash(i + vec2(0.0, 1.0)).x;
    float d = gzWetHash(i + vec2(1.0, 1.0)).x;
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // One bead per cell, always inside its cell (no neighbour search: three hashes per layer). Keeps the tallest bead
  // found so far in best (q.xy, height, radius). Beads condense at a random moment in born, and dry out from dryAt.
  void gzWetBeads(vec2 p, float cell, vec2 radius, float chance, vec2 born, float dryAt, float layer, float px, inout vec4 best) {
    vec2 id = floor(p / cell);
    vec3 h = gzWetHash(id + vec2(layer * 37.0 + uWetSeed, layer * 11.0));
    if (h.z > chance) return;
    float r = mix(radius.x, radius.y, h.x * h.x) * cell;
    float t0 = mix(born.x, born.y, h.y);
    float t1 = dryAt + fract(h.x * 13.7 + h.y * 3.1) * 1.1;
    r *= smoothstep(t0, t0 + 0.4, uWetTime) * (1.0 - smoothstep(t1, t1 + 0.45, uWetTime));
    if (r < px * 0.55) return; // a sub-pixel bead would only shimmer
    vec3 j = gzWetHash(id.yx * 1.3 + vec2(layer + 5.3, uWetSeed));
    vec2 c = (id + 0.5) * cell + (j.xy - 0.5) * (cell - 2.0 * r);
    vec2 q = (p - c) / r;
    q.x *= 0.88 + 0.24 * j.z;              // never perfectly round
    q.y *= q.y > 0.0 ? 1.08 : 0.94;        // a little heavier at the bottom
    float d2 = dot(q, q);
    if (d2 >= 1.0) return;
    float height = sqrt(1.0 - d2) * r;
    if (height > best.z) best = vec4(q, height, r);
  }

  // Fills gzWetCover / gzWetN / gzWetQ / gzWetR for the label point p (world units round and up the shell).
  void gzWetField(vec2 p, float px) {
    vec4 best = vec4(0.0);
    float trail = 0.0;
    float trailX = 0.0;
    float wiped = 0.0;
    float dryAll = 1.0 - smoothstep(GZ_WET_DRY + 0.5, GZ_WET_DRY + 1.6, uWetTime);

    // heavy drops: at most one per column; some of them start to slide and leave a trail
    const float COLUMN = 0.46;
    float col = floor(p.x / COLUMN);
    vec3 rh = gzWetHash(vec2(col * 1.7 + uWetSeed, 93.1));
    if (rh.x < 0.45) {
      float r0 = mix(0.05, 0.072, rh.y);
      float y0 = mix(1.6, 3.4, rh.z);
      float slideAt = mix(1.1, 2.7, fract(rh.y * 7.13 + rh.z));
      float speed = mix(0.55, 1.25, fract(rh.z * 5.71 + rh.x));
      float tau = max(uWetTime - slideAt, 0.0);
      // it hangs, gives way, and runs faster as it gathers the beads below it
      float s = speed * (tau - (1.0 - exp(-2.2 * tau)) / 2.2);
      float cy = y0 - s;
      float r = r0 * smoothstep(0.3, 0.95, uWetTime) * dryAll * (1.0 - 0.3 * smoothstep(0.0, 2.6, s));
      float x0 = (col + 0.5 + (rh.y - 0.5) * 0.4) * COLUMN;
      float dx = p.x - x0 - 0.018 * sin(p.y * 4.3 + rh.z * 31.0) - 0.008 * sin(p.y * 13.0 + rh.x * 17.0);
      if (r > 0.0 && cy > -0.1) {
        vec2 q = vec2(dx, p.y - cy) / r;
        float moving = smoothstep(0.0, 0.3, tau);
        if (q.y > 0.0) q.y /= 1.0 + 0.9 * moving; // the tail draws out behind a running drop
        float d2 = dot(q, q);
        if (d2 < 1.0) best = vec4(q, sqrt(1.0 - d2) * r * 2.0, r);
      }
      // the trail: a thin water film from where it hung down to the drop, wiped clean of the mist
      if (tau > 0.0 && p.y > cy && p.y < y0 + r0 * 0.5) {
        float along = clamp((p.y - cy) / max(y0 - cy, 1e-3), 0.0, 1.0);
        float w = r0 * 0.24 * mix(1.0, 0.5, along) * dryAll;
        w *= 0.7 + 0.3 * sin(p.y * 64.0 + rh.x * 20.0); // the film already pulls into a line of tiny beads
        trailX = dx / max(w, 1e-4);
        trail = max(0.0, 1.0 - trailX * trailX) * smoothstep(0.0, 0.25, tau);
        wiped = 1.0 - smoothstep(2.2, 3.2, abs(dx) / max(r0 * 0.24, 1e-4));
      }
    }

    // the fine beads and the bigger ones, in loose patches; none on a freshly wiped trail
    if (wiped < 0.5) {
      float clump = gzWetNoise(p * 1.4 + uWetSeed);
      gzWetBeads(p, 0.03, vec2(0.2, 0.42), 0.4 + 0.6 * clump, vec2(0.0, 0.45), GZ_WET_DRY - 0.3, 1.0, px, best);
      gzWetBeads(p, 0.065, vec2(0.18, 0.42), 0.55 + 0.4 * clump, vec2(0.08, 0.7), GZ_WET_DRY, 2.0, px, best);
      gzWetBeads(p, 0.14, vec2(0.16, 0.4), 0.7, vec2(0.2, 0.85), GZ_WET_DRY + 0.3, 3.0, px, best);
    }

    if (best.z > 0.0) {
      float d2 = dot(best.xy, best.xy);
      // antialiased edge, about one pixel wide
      gzWetCover = clamp((1.0 - sqrt(d2)) * best.w / px * 1.3, 0.0, 1.0);
      gzWetN = normalize(vec3(best.xy, sqrt(1.0 - d2) + 0.08));
      gzWetQ = best.xy;
      gzWetR = best.w;
    } else if (trail > 0.0) {
      gzWetCover = clamp(trail * 2.5, 0.0, 1.0) * 0.85;
      gzWetN = normalize(vec3(trailX * 0.6, 0.0, 1.0));
    }
    gzWetCover *= uWet;
  }
`;

/**
 * The drop field and the refracted label UV; goes right before `#include <map_fragment>`. Redirects the albedo,
 * metalness and roughness lookups (and the existing label code that reads vMapUv) to gzWetUv for the rest of main.
 */
export const WET_FIELD = /* glsl */ `
  vec2 gzWetP = vMapUv * GZ_WET_SIZE;
  float gzWetPx = max(length(fwidth(gzWetP)) * 0.7071, 1e-4);
  // the shell's tangent frame in view space (x round the can, y up), from screen derivatives: outside any branch
  vec3 gzWetT;
  vec3 gzWetB;
  {
    vec3 q0 = dFdx(-vViewPosition);
    vec3 q1 = dFdy(-vViewPosition);
    vec2 st0 = dFdx(gzWetP);
    vec2 st1 = dFdy(gzWetP);
    vec3 n0 = normalize(vNormal);
    vec3 q1perp = cross(q1, n0);
    vec3 q0perp = cross(n0, q0);
    gzWetT = normalize(q1perp * st0.x + q0perp * st1.x + 1e-6);
    gzWetB = normalize(q1perp * st0.y + q0perp * st1.y + 1e-6);
  }
  if (uWet > 0.0) gzWetField(gzWetP, gzWetPx);
  // the label seen through a bead is magnified toward its centre
  vec2 gzWetUv = vMapUv - gzWetQ * gzWetR * 0.5 * gzWetCover / GZ_WET_SIZE;
  #define vMapUv gzWetUv
  #ifdef USE_METALNESSMAP
    #define vMetalnessMapUv gzWetUv
  #endif
  #ifdef USE_ROUGHNESSMAP
    #define vRoughnessMapUv gzWetUv
  #endif
`;

/** Water over the print; goes after the label's albedo code. Dark refractive rim, a slightly deeper core. */
export const WET_ALBEDO = /* glsl */ `
  if (gzWetCover > 0.0) {
    float gzRim = smoothstep(0.45, 1.0, length(gzWetQ));
    diffuseColor.rgb *= 1.0 - gzWetCover * (0.12 + 0.5 * gzRim * step(0.001, gzWetR));
  }
`;

/** Water is smooth; goes after the roughness lookup. */
export const WET_ROUGHNESS = /* glsl */ `
  roughnessFactor = mix(roughnessFactor, 0.12, gzWetCover);
`;

/** The water surface normal; goes after `#include <normal_fragment_maps>`. */
export const WET_NORMAL = /* glsl */ `
  vec3 gzWetNormal = normalize(gzWetT * gzWetN.x + gzWetB * gzWetN.y + normal * gzWetN.z);
  normal = normalize(mix(normal, gzWetNormal, gzWetCover));
`;

/** The varnish under a bead reflects through the bead; goes after `#include <clearcoat_normal_fragment_maps>`. */
export const WET_CLEARCOAT = /* glsl */ `
  #ifdef USE_CLEARCOAT
    clearcoatNormal = normalize(mix(clearcoatNormal, gzWetNormal, gzWetCover));
  #endif
`;

/**
 * The water's own light; goes after `#include <emissivemap_fragment>`: the studio in the bead's fresnel reflection,
 * a pin-sharp glint of each directional light, and the caustic the light focuses on the far side of the bead.
 */
export const WET_LIGHT = /* glsl */ `
  if (gzWetCover > 0.0) {
    vec3 gzV = normalize(vViewPosition); // toward the eye
    vec3 gzWater = vec3(0.0);
    float gzFresnel = 0.02 + 0.98 * pow(1.0 - saturate(dot(gzWetNormal, gzV)), 5.0);
    // a bead's light scales with its size: pixel-sized mist must not glitter like stars
    float gzSize = smoothstep(1.2, 4.0, gzWetR / gzWetPx);
    float gzBead = step(0.001, gzWetR);
    #ifdef USE_ENVMAP
      gzWater += getIBLRadiance(gzV, gzWetNormal, 0.04) * gzFresnel * 0.9;
    #endif
    // the overhead softbox caught along the top edge of every bead (a thin catchlight crescent)
    vec3 gzR = reflect(-gzV, gzWetNormal);
    vec3 gzUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    float gzBox = smoothstep(0.62, 0.9, dot(gzR, gzUp)) * smoothstep(0.35, 0.85, length(gzWetQ));
    gzWater += vec3(0.55, 0.6, 0.66) * gzBox * (0.25 + gzFresnel) * gzSize * gzBead;
    #if NUM_DIR_LIGHTS > 0
      for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
        vec3 gzL = directionalLights[i].direction;
        float gzGlint = pow(saturate(dot(gzWetNormal, normalize(gzL + gzV))), 500.0) * (0.25 + 0.75 * gzSize);
        // light entering the bead leaves it focused in a crescent inside the rim, low and away from the light: the
        // flavor-tinted caustic
        vec2 gzLt = vec2(dot(gzL, gzWetT), dot(gzL, gzWetB));
        vec2 gzAway = normalize(vec2(0.0, -0.9) - gzLt);
        float gzQl = length(gzWetQ);
        float gzCaustic = smoothstep(0.2, 0.62, dot(gzWetQ, gzAway)) * (1.0 - smoothstep(0.7, 0.92, gzQl)) * gzBead * gzSize;
        float gzLit = saturate(dot(gzL, normal) + 0.5);
        gzWater += directionalLights[i].color * (gzGlint * 4.0 * mix(vec3(1.0), uWetTint, 0.25) + gzCaustic * 0.75 * uWetTint * gzLit);
      }
    #endif
    totalEmissiveRadiance += gzWater * gzWetCover;
  }
`;
