import * as THREE from 'three';
import type { SceneManager } from '../sceneManager';
import type { SceneMoment } from './types';
import { audioManager } from '../../audio/audioManager';
import { CAN } from '../canDimensions';

/**
 * Zamzam: the source, a well. The pace slows and the frame turns to water and light. Behind the can opens the well,
 * a great disc of deep teal water lit from within: the moving net of light that sunlight draws on the floor of clear
 * water (caustics, in gold and white) shimmers across it, fine bubbles of light rise through it, and its gold rim
 * catches one slow sweep of light. Shafts of dawn fall from above into the dark, and the still pool at the foot of the
 * frame mirrors the well, with calm rings spreading from the can's base and, every few seconds, a single drop.
 * Abstract and quiet: no sacred buildings or text are depicted, no sparkle bursts, no bounce.
 *
 * Trigger: scroll position at the Zamzam chapter (the last benefit). Scroll-driven in/out, then time-driven (the
 * caustics, the bubbles, the drop, the rim sweep). WebGL: one full-screen quad behind the cans, the well centred on
 * the can each frame; everything is procedural (no textures). The can and its floor reflection are the regular scene.
 * DOM: the chapter copy, the Arabic word for Zamzam in calligraphy, and the halal seal. Optional: with reduced motion
 * the water and the light are still.
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
  uniform vec3 uWell;       // well centre (uv) and radius (in screen heights)

  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  float hash(vec2 p) { return hash2(p).x; }

  // Caustics: the bright seams between drifting cells of light (a moving Voronoi), as sunlight draws on a pool floor.
  float seams(vec2 p, float t) {
    vec2 g = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 b = vec2(float(x), float(y));
        vec2 o = 0.5 + 0.42 * sin(t + 6.2831 * hash2(g + b));
        vec2 r = b + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
    }
    return sqrt(d2) - sqrt(d1);
  }
  float caustics(vec2 p, float t) {
    // the water bends the net: a slow warp keeps the lines wavering and organic (unwarped it read as cracked glass)
    p += 0.18 * vec2(sin(p.y * 2.3 + t * 0.6), cos(p.x * 2.1 - t * 0.5));
    float a = pow(1.0 - smoothstep(0.0, 0.22, seams(p * 4.2, t * 0.7)), 5.0);
    float b = pow(1.0 - smoothstep(0.0, 0.18, seams(p * 6.1 + 3.7, -t * 0.55)), 5.0);
    return a * 0.55 + b * 0.4 + a * b * 1.6; // where two nets cross, the light gathers
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

  const vec3 GOLD = vec3(0.98, 0.78, 0.44);
  const vec3 DAWN = vec3(1.0, 0.88, 0.68);
  const vec3 TEAL = vec3(0.02, 0.16, 0.19);

  // The well: light seen through deep water, its gold rim, the glow it throws round it. q in well radii.
  vec3 well(vec2 q, float t) {
    float r = length(q);
    float inside = 1.0 - smoothstep(0.96, 1.0, r);
    // deeper toward the rim, a lit heart toward the centre
    vec3 water = mix(TEAL * 1.25, TEAL * 0.3, smoothstep(0.0, 1.0, r));
    // the caustic net, gently swirling, brightest in the heart
    float a = t * 0.05;
    vec2 cq = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
    float light = caustics(cq * 1.6, t) * (1.0 - smoothstep(0.2, 1.0, r) * 0.75);
    water += mix(vec3(0.55, 0.95, 0.9), GOLD, 0.55) * light * 0.55;
    // bubbles of light rising through the water
    vec2 bg = vec2(q.x * 7.0, q.y * 7.0 - t * 0.35);
    vec2 cell = floor(bg);
    vec2 bl = fract(bg) - 0.5 - (hash2(cell + 2.3) - 0.5) * 0.5;
    float bubble = step(0.86, hash(cell)) * smoothstep(0.09, 0.0, abs(length(bl) - 0.06));
    water += vec3(0.75, 0.95, 1.0) * bubble * 0.35 * (1.0 - r);
    vec3 col = water * inside;
    // the gold rim: a fine bright line with a sweep of light travelling round it
    float sweep = pow(0.5 + 0.5 * cos(atan(q.y, q.x) - t * 0.35), 14.0);
    float rim = exp(-pow((r - 1.0) * 60.0, 2.0));
    col += GOLD * rim * (0.35 + 1.4 * sweep);
    // its glow on the dark round it
    col += GOLD * exp(-max(r - 1.0, 0.0) * 5.5) * (1.0 - inside) * (0.05 + 0.08 * sweep);
    return col;
  }

  void main() {
    vec2 uv = vUv;
    float x = (uv.x - uBase.x) * uAspect;
    // the far edge of the pool sits a little above the can's base (a camera just above the water)
    float shore = uBase.y + 0.13;
    float up = clamp((uv.y - shore) / (1.0 - shore + 0.001), 0.0, 1.0);

    // the night: deep teal low down, near black above
    vec3 col = mix(vec3(0.012, 0.05, 0.06), vec3(0.003, 0.006, 0.012), smoothstep(0.0, 0.9, up));
    col += vec3(0.5, 0.34, 0.16) * exp(-up * 14.0) * 0.18; // a thread of dawn on the horizon

    // shafts of dawn falling from above, slowly moving
    float spread = 0.12 + 0.55 * (1.0 - uv.y);
    float s = x / spread;
    float cone = exp(-s * s * 0.6);
    float shafts = 0.5 + 0.5 * sin(s * 6.0 + uTime * 0.2) * sin(s * 2.7 - uTime * 0.13);
    col += DAWN * cone * (0.03 + 0.09 * shafts) * smoothstep(shore - 0.05, shore + 0.35, uv.y);

    // the well behind the can
    vec2 wq = (uv - uWell.xy) * vec2(uAspect, 1.0) / uWell.z;
    col += well(wq, uTime) * smoothstep(shore - 0.01, shore + 0.03, uv.y);

    // the pool
    float water = smoothstep(shore + 0.012, shore - 0.012, uv.y);
    if (water > 0.0) {
      float depth = clamp((shore - uv.y) / max(shore, 0.05), 0.0, 1.0);
      vec3 pool = mix(vec3(0.016, 0.07, 0.08), vec3(0.002, 0.01, 0.015), pow(depth, 0.7));
      float swell = fract(sin(dot(floor(vec2(uv.x * uAspect * 40.0, depth * 90.0 - uTime * 0.8)), vec2(12.9898, 78.233))) * 43758.5453);
      // the well mirrored in the water, broken up by the swell
      vec2 mirrored = vec2(uv.x + (swell - 0.5) * 0.006, 2.0 * shore - uv.y);
      vec2 mq = (mirrored - uWell.xy) * vec2(uAspect, 1.0) / uWell.z;
      pool += well(mq, uTime) * 0.32 * (1.0 - smoothstep(0.0, 0.55, depth));
      // the overhead light on the water: a broken streak under the can
      float streak = exp(-abs(x + (swell - 0.5) * 0.03) / (0.03 + 0.1 * depth));
      pool += DAWN * 0.6 * streak * (0.05 + 0.1 * swell) * (1.0 - depth * 0.6);
      // calm rings from the can's base, and the drop's rings beside it
      float calm = rings(uv, uBase, mod(uTime, 4.0), 0.09, 2.0) * 0.5 + rings(uv, uBase, mod(uTime + 2.0, 4.0), 0.09, 1.0) * 0.35;
      vec2 dropAt = vec2(uBase.x - 0.2 / uAspect, uBase.y - 0.035);
      float h = calm + rings(uv, dropAt, uDrop - ${IMPACT.toFixed(2)}, 0.12, 3.0);
      pool += mix(vec3(0.55, 0.9, 0.92), GOLD, 0.4) * max(h, 0.0) * 0.16;
      pool -= vec3(0.01, 0.03, 0.035) * max(-h, 0.0) * 0.4;
      // the shore line catches a thin gold highlight
      pool += GOLD * exp(-abs(uv.y - shore) * 220.0) * 0.18;
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
      col += vec3(0.8, 0.94, 1.0) * (smoothstep(0.012, 0.0, d) * 0.9 + smoothstep(0.06, 0.0, d) * 0.12);
    }

    // a soft vignette keeps the eye on the can and the copy
    vec2 vq = (uv - 0.5) * vec2(1.0, 1.2);
    col *= 1.0 - 0.45 * smoothstep(0.35, 0.95, length(vq));
    gl_FragColor = vec4(col, uAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class ZamzamPool implements SceneMoment {
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly base = new THREE.Vector3();
  private readonly top = new THREE.Vector3();
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
        uWell: { value: new THREE.Vector3(0.68, 0.5, 0.36) },
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
      // the well opens behind the can's body, wide enough to show round both sides of it (and never off a phone's
      // narrow frame: its radius is capped by the frame width)
      this.top.set(0, CAN.shellHeight / 2 + CAN.topHeight, 0).applyMatrix4(can.matrixWorld).project(scene.camera);
      const height = Math.max(0.1, (this.top.y - this.base.y) * 0.5);
      const radius = Math.min(height * 0.62, 0.46 * scene.camera.aspect);
      u.uWell.value.set(this.base.x * 0.5 + 0.5, this.base.y * 0.5 + 0.5 + height * 0.58, radius);
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
