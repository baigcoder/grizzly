import * as THREE from 'three';
import type { SceneManager } from '../sceneManager';
import type { SceneMoment } from './types';
import { audioManager } from '../../audio/audioManager';
import { CAN } from '../canDimensions';

/**
 * Zamzam: the source. The pace slows and the frame turns to golden hour over still water: night above, then teal,
 * then a warm amber glow low on the horizon where the sun rises behind the can; thin cloud bands lit from below,
 * faint rays, haze on the water line. The water mirrors the sky, a path of gold glints runs from the sun toward the
 * viewer, calm rings spread from the can's base and, every few seconds, a single drop falls. Abstract and quiet: no
 * sacred buildings or text are depicted, no patterns, no bursts.
 *
 * Trigger: scroll position at the Zamzam chapter (the last benefit). Scroll-driven in/out, then time-driven (the
 * clouds, the glints, the drop). WebGL: one full-screen quad behind the cans, the horizon set by the can's base each
 * frame; procedural (no textures). DOM: the chapter copy, the Arabic word for Zamzam in calligraphy, the halal seal.
 * Optional: with reduced motion the sky and the water are still.
 */
const CHAPTER = 5; // section position of the Zamzam chapter (benefits-4)
const IMPACT = 1.6; // seconds from release to the drop hitting the water
const CYCLE = 8;

const FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uAlpha;
  uniform float uTime;
  uniform float uDrop;
  uniform float uAspect;
  uniform vec2 uBase;       // the can's base on screen (uv): the water line runs through it

  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; }
    return v;
  }

  // Rings on the water seen at a low angle: circles flattened into ellipses. Returns the surface height.
  float rings(vec2 uv, vec2 c, float age, float speed, float count) {
    vec2 q = (uv - c) * vec2(uAspect, 1.0 / 0.22);
    float r = length(q);
    float h = 0.0;
    for (int i = 0; i < 3; i++) {
      if (float(i) >= count) break;
      float ti = age - float(i) * 0.5;
      if (ti > 0.0) {
        float w = (r - ti * speed) * 26.0;
        h += sin(w * 2.0) * exp(-w * w * 0.08) * exp(-ti * 0.45) / (1.0 + float(i) * 0.6);
      }
    }
    return h;
  }

  const vec3 SUN = vec3(1.0, 0.74, 0.42);
  const vec3 GOLD = vec3(0.98, 0.78, 0.44);

  // The sky at golden hour: night above, teal, then a warm amber glow low over the water, the sun rising behind the
  // can, thin cloud bands lit from below, faint rays. up is the height above the horizon (0..1).
  vec3 sky(vec2 uv, float up, vec2 sun, float t) {
    vec3 col = mix(vec3(0.62, 0.34, 0.15), vec3(0.05, 0.1, 0.13), smoothstep(0.0, 0.4, up));
    col = mix(col, vec3(0.006, 0.012, 0.024), smoothstep(0.32, 1.0, up));
    vec2 sq = (uv - sun) * vec2(uAspect, 1.0);
    float d = length(sq);
    // the sun's warmth spreading along the horizon, then its glow, then its core
    col += SUN * exp(-abs(sq.y) * 9.0 - abs(sq.x) * 1.4) * 0.22;
    col += SUN * exp(-d * 5.5) * 0.45;
    col += vec3(1.0, 0.9, 0.72) * exp(-d * 26.0) * 0.9;
    // thin cloud bands near the horizon, lit warm from below where the sun reaches them
    float band = smoothstep(0.03, 0.12, up) * (1.0 - smoothstep(0.3, 0.55, up));
    float cloud = fbm(vec2(uv.x * uAspect * 1.6 + t * 0.006, up * 16.0));
    cloud = smoothstep(0.52, 0.78, cloud) * band;
    col = mix(col, mix(vec3(0.08, 0.06, 0.07), SUN * 0.9, exp(-d * 2.2)), cloud * 0.55);
    // faint rays fanning from the sun
    float a = atan(sq.y, sq.x);
    float rays = pow(0.5 + 0.5 * sin(a * 22.0 + fbm(vec2(a * 3.0, t * 0.05)) * 3.0), 6.0);
    col += SUN * rays * exp(-d * 2.4) * 0.05 * step(0.0, sq.y);
    // haze where sky meets water
    col += vec3(0.75, 0.52, 0.32) * exp(-up * 34.0) * 0.16;
    return col;
  }

  void main() {
    vec2 uv = vUv;
    float x = (uv.x - uBase.x) * uAspect;
    // the horizon sits a little above the can's base (a camera just above the water)
    float shore = uBase.y + 0.13;
    vec2 sun = vec2(uBase.x, shore + 0.07);
    float up = clamp((uv.y - shore) / (1.0 - shore + 0.001), 0.0, 1.0);

    vec3 col = sky(uv, up, sun, uTime);

    // dust in the light, a few motes drifting up
    vec2 g = vec2(uv.x * uAspect, uv.y - uTime * 0.01) * 30.0;
    vec2 cell = floor(g);
    float m = hash(cell);
    vec2 local = fract(g) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6;
    float mote = step(0.975, m) * smoothstep(0.1, 0.0, length(local)) * (0.5 + 0.5 * sin(uTime * (0.6 + m * 2.0) + m * 30.0));
    col += SUN * max(mote, 0.0) * 0.12 * exp(-length((uv - sun) * vec2(uAspect, 1.0)) * 1.5);

    // the water: the sky mirrored, darker and cooler, with a path of glints under the sun
    float water = smoothstep(shore + 0.008, shore - 0.008, uv.y);
    if (water > 0.0) {
      float depth = clamp((shore - uv.y) / max(shore, 0.05), 0.0, 1.0);
      // gentle horizontal ripples break the reflection
      float ripple = fbm(vec2(uv.x * uAspect * 3.0, depth * 60.0 - uTime * 0.35));
      vec2 mirrored = vec2(uv.x + (ripple - 0.5) * 0.02 * (0.3 + depth), 2.0 * shore - uv.y);
      float mup = clamp((mirrored.y - shore) / (1.0 - shore + 0.001), 0.0, 1.0);
      vec3 pool = sky(mirrored, mup, sun, uTime) * mix(0.62, 0.22, depth) * vec3(0.86, 0.95, 1.0);
      pool = mix(pool, vec3(0.004, 0.012, 0.018), smoothstep(0.35, 1.0, depth) * 0.6);
      // the glitter path: sparkles that live in a widening column under the sun
      float width = 0.05 + 0.32 * depth;
      float path = exp(-abs(x) / width);
      vec2 sg = vec2(uv.x * uAspect * 90.0, depth * 260.0 + floor(uTime * 6.0) * 1.7);
      float spark = step(0.86, hash(floor(sg))) * smoothstep(0.42, 0.0, length(fract(sg) - 0.5));
      pool += GOLD * path * (0.08 + spark * 0.9) * (1.0 - depth * 0.5);
      // calm rings from the can's base, and the drop's rings beside it
      float calm = rings(uv, uBase, mod(uTime, 4.0), 0.09, 2.0) * 0.5 + rings(uv, uBase, mod(uTime + 2.0, 4.0), 0.09, 1.0) * 0.35;
      vec2 dropAt = vec2(uBase.x - 0.2 / uAspect, uBase.y - 0.035);
      float h = calm + rings(uv, dropAt, uDrop - ${IMPACT.toFixed(2)}, 0.12, 3.0);
      pool += mix(vec3(0.6, 0.85, 0.9), GOLD, 0.5) * max(h, 0.0) * 0.14;
      pool -= vec3(0.01, 0.025, 0.03) * max(-h, 0.0) * 0.4;
      // the horizon line catches the light
      pool += SUN * exp(-abs(uv.y - shore) * 260.0) * 0.25;
      col = mix(col, pool, water);
    }

    // the drop: a small teardrop of light falling from the top to the water beside the can
    if (uDrop < ${IMPACT.toFixed(2)} && uDrop > 0.0) {
      float k = uDrop / ${IMPACT.toFixed(2)};
      vec2 dropAt = vec2(uBase.x - 0.2 / uAspect, uBase.y - 0.035);
      float y = mix(1.1, dropAt.y, k * k);
      vec2 dq = (uv - vec2(dropAt.x, y)) * vec2(uAspect, 1.0);
      float stretch = mix(2.2, 1.0, k);
      float d = length(vec2(dq.x * 1.6, dq.y / stretch));
      col += vec3(1.0, 0.9, 0.75) * (smoothstep(0.012, 0.0, d) * 0.9 + smoothstep(0.06, 0.0, d) * 0.12);
    }

    // a soft vignette keeps the eye on the can and the copy
    vec2 vq = (uv - 0.5) * vec2(1.0, 1.2);
    col *= 1.0 - 0.42 * smoothstep(0.35, 0.95, length(vq));
    gl_FragColor = vec4(col, uAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class ZamzamPool implements SceneMoment {
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly base = new THREE.Vector3();
  private amount = 0;
  private dropStart = -1;
  private dropSounded = false;

  constructor(host: SceneManager) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        uDrop: { value: 0 },
        uAspect: { value: 1 },
        uBase: { value: new THREE.Vector2(0.68, 0.2) },
      },
      // Drawn at the far plane with the depth test on: as a transparent material it renders after the opaque can, so
      // only depth (not renderOrder) keeps it behind the can and its reflection.
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
      fragmentShader: FRAGMENT,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -900;
    this.mesh.visible = false;
    host.scene.add(this.mesh);
  }

  update(seconds: number, scene: SceneManager) {
    const p = scene.sectionPosition;
    const target = THREE.MathUtils.smoothstep(p, CHAPTER - 0.6, CHAPTER - 0.15) * (1 - THREE.MathUtils.smoothstep(p, CHAPTER + 0.15, CHAPTER + 0.6));
    // the pace slows: the pool follows the scroll lazily
    this.amount += (target - this.amount) * 0.08;
    const a = this.amount;
    this.mesh.visible = a > 0.003;
    scene.zamzamLight = a;
    if (!this.mesh.visible) {
      this.dropStart = -1;
      return;
    }
    const u = this.material.uniforms;
    if (this.dropStart < 0 || seconds - this.dropStart > CYCLE) {
      this.dropStart = seconds;
      this.dropSounded = false;
    }
    if (!this.dropSounded && seconds - this.dropStart > IMPACT && !scene.reducedMotion) {
      this.dropSounded = true;
      audioManager.play('drop');
    }
    u.uAlpha.value = a;
    u.uTime.value = scene.reducedMotion ? 1.3 : seconds;
    u.uDrop.value = scene.reducedMotion ? IMPACT + 3.2 : seconds - this.dropStart;
    u.uAspect.value = scene.camera.aspect;

    // The water line runs through the featured can's base (last frame's pose: one frame of lag is invisible here).
    const can = scene.cans[scene.featuredCanIndex()];
    if (can?.visible && can.position.y > -100) {
      this.base.set(0, -(CAN.shellHeight / 2 + CAN.bottomHeight), 0).applyMatrix4(can.matrixWorld).project(scene.camera);
      u.uBase.value.set(this.base.x * 0.5 + 0.5, THREE.MathUtils.clamp(this.base.y * 0.5 + 0.5, 0.05, 0.6));
    }

    // the night behind the pool rests, and the flavor's colour field and grey studio give way to the well (left on,
    // they washed the chapter flat in the flavor colour)
    const d = scene.data;
    d.field *= 1 - a;
    d.studio *= 1 - a;
    d.mountains *= 1 - a;
    d.moon *= 1 - a;
    d.stars *= 1 - a;
    d.mistFg *= 1 - 0.9 * a;
    d.glow *= 1 - a;
    if (a > 0.97) scene.canOverride.index = -1;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
