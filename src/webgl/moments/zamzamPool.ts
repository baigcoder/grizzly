import * as THREE from 'three';
import type { SceneManager } from '../sceneManager';
import type { SceneMoment } from './types';
import { audioManager } from '../../audio/audioManager';
import { CAN } from '../canDimensions';

/**
 * Zamzam: the source, from the well in Makkah. The pace slows and the frame turns reverent: the night gives way to the
 * first light of dawn (fajr), a warm band low over a deep, still pool. Light falls through a carved lattice screen
 * (mashrabiya: interlaced eight-point stars) onto the can. Behind it a gold geometric rosette (sixteen points of
 * interlaced squares, in the tradition of Islamic tilework) catches a slow sweep of light, and the water mirrors it.
 * The whole can stands on the water line with calm rings spreading from its base; every few seconds a single drop
 * falls beside it. Abstract and quiet: no sacred buildings or text are depicted, no sparkle bursts, no bounce.
 *
 * Trigger: scroll position at the Zamzam chapter (the last benefit). Scroll-driven in/out, then time-driven (the drop,
 * the rings, the light sweep). WebGL: one full-screen quad behind the cans, centred on the can each frame; the rosette
 * is drawn once into a canvas texture; the lattice is procedural. The can and its floor reflection are the regular
 * scene. DOM: the chapter copy, the Arabic word for Zamzam in calligraphy, and the halal seal. Optional: with reduced
 * motion the water and the light are still, with a few frozen rings.
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
  uniform vec3 uAccent;
  uniform sampler2D uRosette;
  uniform vec3 uRosetteAt;  // rosette centre (uv) and radius (in screen heights)
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
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

  // Mashrabiya: an eight-point star (two interlaced squares) in every cell, joined by the cell edges. Thin lines.
  float lattice(vec2 p) {
    vec2 a = abs(fract(p) - 0.5);
    float square = abs(max(a.x, a.y) - 0.29);
    float diamond = abs((a.x + a.y) * 0.7071 - 0.29);
    float edge = min(abs(a.x - 0.5), abs(a.y - 0.5));
    float d = min(min(square, diamond), edge);
    return smoothstep(0.035, 0.012, d);
  }

  // The gold rosette: line art from the canvas, lit by a slow sweep travelling round it.
  float rosette(vec2 uv) {
    vec2 q = (uv - uRosetteAt.xy) * vec2(uAspect, 1.0) / (2.0 * uRosetteAt.z);
    if (length(q) > 0.5) return 0.0;
    // it turns, very slowly (one revolution in about three and a half minutes)
    float turn = uTime * 0.03;
    q = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * q;
    float art = texture2D(uRosette, q + 0.5).r;
    float sweep = pow(0.5 + 0.5 * cos(atan(q.y, q.x) - uTime * 0.18), 10.0);
    return art * (0.5 + 1.1 * sweep);
  }

  void main() {
    vec2 uv = vUv;
    float x = (uv.x - uBase.x) * uAspect;
    // the far edge of the pool sits a little above the can's base (a camera just above the water)
    float shore = uBase.y + 0.13;
    vec3 gold = vec3(0.95, 0.75, 0.42);
    vec3 dawn = vec3(1.0, 0.86, 0.64);

    // the air: first light low over the water, deep teal above it, night at the top
    float up = clamp((uv.y - shore) / (1.0 - shore + 0.001), 0.0, 1.0);
    vec3 col = mix(vec3(0.085, 0.062, 0.042), vec3(0.016, 0.034, 0.056), smoothstep(0.0, 0.28, up));
    col = mix(col, vec3(0.003, 0.005, 0.014), smoothstep(0.25, 0.95, up));
    col += vec3(0.5, 0.3, 0.12) * exp(-up * 12.0) * 0.42; // the fajr band on the horizon, warm and wide

    // light from above, falling through the lattice onto the can: shafts you can see in the air
    float spread = 0.1 + 0.5 * (1.0 - uv.y);
    float s = x / spread;
    float cone = exp(-s * s);
    float shafts = 0.5 + 0.5 * sin(s * 7.0 + uTime * 0.22) * sin(s * 3.1 - uTime * 0.15);
    col += dawn * cone * (0.05 + 0.13 * shafts) * smoothstep(shore - 0.1, shore + 0.25, uv.y);
    vec2 hq = vec2(x, uv.y - uBase.y - 0.32) * vec2(1.0, 1.3);
    col += vec3(0.62, 0.46, 0.26) * exp(-dot(hq, hq) * 4.0) * 0.17; // a warm halo behind the can

    // the carved screen high in the frame, lit gold where the light passes through it
    float screen = lattice(vec2((uv.x - 0.5) * uAspect, uv.y) * 13.0);
    float screenMask = smoothstep(0.3, 0.62, up) * (1.0 - smoothstep(0.92, 1.0, uv.y));
    col += gold * screen * screenMask * (0.02 + 0.13 * cone);

    // the rosette behind the can: gold line art with a travelling gleam
    col += gold * rosette(uv) * 0.32 * smoothstep(shore - 0.01, shore + 0.04, uv.y);

    // the pool
    float water = smoothstep(shore + 0.012, shore - 0.012, uv.y);
    if (water > 0.0) {
      float depth = clamp((shore - uv.y) / max(shore, 0.05), 0.0, 1.0);
      vec3 pool = mix(vec3(0.02, 0.072, 0.088), vec3(0.002, 0.011, 0.017), pow(depth, 0.7)) + uAccent * 0.004;
      float swell = vnoise(vec2(uv.x * uAspect * 6.0 + uTime * 0.05, depth * 70.0 - uTime * 0.6));
      // the dawn band and the rosette mirrored in the still water, broken up by the swell
      pool += vec3(0.5, 0.3, 0.12) * exp(-depth * 10.0) * 0.24;
      vec2 mirrored = vec2(uv.x + (swell - 0.5) * 0.012, 2.0 * shore - uv.y);
      pool += gold * rosette(mirrored) * 0.15 * (1.0 - smoothstep(0.0, 0.5, depth));
      // the overhead light on the water: a broken vertical streak of gold under the can
      float streak = exp(-abs(x + (swell - 0.5) * 0.04) / (0.03 + 0.12 * depth));
      pool += dawn * 0.75 * streak * (0.06 + 0.14 * smoothstep(0.45, 0.85, swell)) * (1.0 - depth * 0.6);
      // calm rings from the can's base, one set every few seconds, and the drop's rings beside it
      float calm = rings(uv, uBase, mod(uTime, 4.0), 0.09, 2.0) * 0.5 + rings(uv, uBase, mod(uTime + 2.0, 4.0), 0.09, 1.0) * 0.35;
      vec2 dropAt = vec2(uBase.x - 0.2 / uAspect, uBase.y - 0.035);
      float drop = rings(uv, dropAt, uDrop - ${IMPACT.toFixed(2)}, 0.12, 3.0);
      float h = calm + drop;
      pool += mix(vec3(0.55, 0.85, 0.92), dawn, 0.45) * max(h, 0.0) * 0.15;
      pool -= vec3(0.01, 0.03, 0.035) * max(-h, 0.0) * 0.4;
      // the shore line catches a thin, warm highlight
      pool += vec3(0.5, 0.4, 0.26) * exp(-abs(uv.y - shore) * 220.0) * 0.22;
      col = mix(col, pool, water);
    }

    // dust motes rising slowly through the light, gold where the light catches them
    vec2 g = vec2(uv.x * uAspect, uv.y - uTime * 0.012) * 34.0;
    vec2 cell = floor(g);
    float m = hash(cell);
    vec2 local = fract(g) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6;
    float mote = step(0.965, m) * smoothstep(0.12, 0.0, length(local)) * (0.4 + 0.6 * sin(uTime * (0.5 + m * 2.0) + m * 30.0));
    col += dawn * max(mote, 0.0) * 0.2 * (0.3 + cone) * (1.0 - water);

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
    col *= 1.0 - 0.4 * smoothstep(0.35, 0.9, length(vq));
    gl_FragColor = vec4(col, uAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Sixteen-point rosette as line art (white on transparent, 1024²): an outer band with a ring of dots, four squares
 * interlaced into a sixteen-point star, almond petals inside, an eight-point star at the heart. Drawn once.
 */
function drawRosette(): HTMLCanvasElement {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const c = size / 2;
  const R = size * 0.49;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineJoin = 'round';
  const circle = (r: number, width: number) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  const square = (r: number, angle: number, width: number) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let k = 0; k < 4; k += 1) {
      const a = angle + (k * Math.PI) / 2;
      const px = c + Math.cos(a) * r;
      const py = c + Math.sin(a) * r;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  };
  circle(R, 3);
  circle(R * 0.955, 1.5);
  for (let k = 0; k < 64; k += 1) {
    const a = (k / 64) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * R * 0.91, c + Math.sin(a) * R * 0.91, k % 4 === 0 ? 4 : 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // sixteen points: four squares, each turned a sixteenth of a turn from the last
  for (let k = 0; k < 4; k += 1) square(R * 0.86, (k * Math.PI) / 8, 2.6);
  circle(R * 0.6, 2.2);
  // almond petals between the inner circle and the star's waist
  ctx.lineWidth = 2;
  for (let k = 0; k < 16; k += 1) {
    const a = ((k + 0.5) / 16) * Math.PI * 2;
    const inner = R * 0.33;
    const outer = R * 0.6;
    const mid = (inner + outer) / 2;
    const side = 0.11;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
    ctx.quadraticCurveTo(c + Math.cos(a + side) * mid * 1.05, c + Math.sin(a + side) * mid * 1.05, c + Math.cos(a) * outer, c + Math.sin(a) * outer);
    ctx.quadraticCurveTo(c + Math.cos(a - side) * mid * 1.05, c + Math.sin(a - side) * mid * 1.05, c + Math.cos(a) * inner, c + Math.sin(a) * inner);
    ctx.stroke();
  }
  circle(R * 0.33, 2);
  square(R * 0.3, 0, 2);
  square(R * 0.3, Math.PI / 4, 2);
  circle(R * 0.14, 1.6);
  return canvas;
}

export class ZamzamPool implements SceneMoment {
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly base = new THREE.Vector3();
  private readonly top = new THREE.Vector3();
  private readonly rosette: THREE.CanvasTexture;
  private amount = 0;
  private dropStart = -1;
  private dropSounded = false;

  constructor(host: SceneManager) {
    this.rosette = new THREE.CanvasTexture(drawRosette());
    this.rosette.colorSpace = THREE.NoColorSpace;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        uDrop: { value: 0 },
        uAspect: { value: 1 },
        uBase: { value: new THREE.Vector2(0.68, 0.2) },
        uAccent: { value: new THREE.Color() },
        uRosette: { value: this.rosette },
        uRosetteAt: { value: new THREE.Vector3(0.68, 0.45, 0.3) },
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
    u.uAccent.value.copy(scene.stageParams.accent);

    // The water line runs through the featured can's base (last frame's pose: one frame of lag is invisible here).
    const can = scene.cans[scene.featuredCanIndex()];
    if (can?.visible && can.position.y > -100) {
      this.base.set(0, -(CAN.shellHeight / 2 + CAN.bottomHeight), 0).applyMatrix4(can.matrixWorld).project(scene.camera);
      u.uBase.value.set(this.base.x * 0.5 + 0.5, THREE.MathUtils.clamp(this.base.y * 0.5 + 0.5, 0.05, 0.6));
      // the rosette rides behind the can's upper body, wide enough to show round both sides of it
      this.top.set(0, CAN.shellHeight / 2 + CAN.topHeight, 0).applyMatrix4(can.matrixWorld).project(scene.camera);
      const height = Math.max(0.1, (this.top.y - this.base.y) * 0.5);
      u.uRosetteAt.value.set(this.base.x * 0.5 + 0.5, this.base.y * 0.5 + 0.5 + height * 0.6, height * 0.78);
    }

    // the night behind the pool rests, and the flavor's colour field and grey studio give way to the dawn (left on,
    // they washed the chapter flat blue and the gold barely showed)
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
    this.rosette.dispose();
  }
}
