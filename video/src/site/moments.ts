import * as THREE from 'three';

/**
 * Two of the site's scene moments, ported verbatim from src/webgl/moments (roar.ts, zamzamPool.ts) and driven here by
 * film time instead of scroll: the roaring bear that rises behind the can, and the Zamzam pool at first light with the
 * gold rosette. Shader code and the rosette drawing are the site's own; only the host wiring is new.
 */
const IMPACT = 1.6; // seconds from release to the drop hitting the water (as on the site)

export const BEAR_FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform float uOpacity;
  uniform float uReveal;   // 0..1: the brightness threshold falls, so detail appears highlights-first
  uniform float uSweep;    // 0..1: a soft band of key light travelling left to right
  uniform vec3 uTint;      // the flavor's accent
  varying vec2 vUv;
  void main() {
    vec4 tex = texture2D(map, vUv);
    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    // keep the bear and the ice, drop the label's black; fade the edges into the night
    vec2 d = (vUv - 0.5) * vec2(1.0, 1.15);
    float edge = smoothstep(0.55, 0.22, length(d));
    // The bear is the warm part of the art (brown fur, tan muzzle); the blue ice behind it stays a quiet backdrop.
    float warm = smoothstep(0.0, 0.14, tex.r - tex.b);
    // progressive reveal: first only the brightest detail (teeth, eyes, fur highlights), then the mid tones
    float threshold = mix(0.6, 0.04, uReveal);
    float body = smoothstep(threshold, threshold + 0.25, lum);
    // the label's own wordmark sits along the bottom of the art: keep it out
    float noWordmark = smoothstep(0.12, 0.3, vUv.y);
    float a = (warm * body + (1.0 - warm) * body * 0.28) * edge * noWordmark * uOpacity;
    // moonlit: cold light on the fur (it keeps some of its own warmth), cold blue-white ice
    vec3 fur = mix(vec3(lum) * vec3(0.85, 0.9, 1.0), tex.rgb, 0.5);
    vec3 ice = vec3(lum) * vec3(0.7, 0.82, 1.0);
    vec3 cold = mix(ice, fur, warm);
    // additive light on the night: the dark brown fur needs lifting to read as a bear, the ice stays quiet
    cold *= mix(1.0, 2.3, warm);
    // directional light: brighter toward the upper left (the key), darker on the lower right
    float facing = dot(normalize(d + 0.0001), normalize(vec2(-0.6, 0.8))) * 0.5 + 0.5;
    cold *= mix(0.55, 1.2, facing);
    // the sweep: a soft band of key light crossing the fur, tinted by the flavor
    float band = exp(-pow((vUv.x - (uSweep * 1.5 - 0.25)) * 3.4, 2.0));
    cold += band * lum * 0.55 * mix(vec3(1.0), uTint, 0.55);
    gl_FragColor = vec4(cold * a, a);
  }
`;

const ZAMZAM_FRAGMENT = /* glsl */ `
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
    if (abs(q.x) > 0.5 || abs(q.y) > 0.5) return 0.0;
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
    col += vec3(0.42, 0.26, 0.11) * exp(-up * 16.0) * 0.22; // the fajr band on the horizon

    // light from above, falling through the lattice onto the can
    float spread = 0.1 + 0.5 * (1.0 - uv.y);
    float s = x / spread;
    float cone = exp(-s * s);
    float shafts = 0.5 + 0.5 * sin(s * 7.0 + uTime * 0.22) * sin(s * 3.1 - uTime * 0.15);
    col += dawn * cone * (0.04 + 0.075 * shafts) * smoothstep(shore - 0.1, shore + 0.25, uv.y);
    vec2 hq = vec2(x, uv.y - uBase.y - 0.32) * vec2(1.0, 1.3);
    col += vec3(0.5, 0.42, 0.3) * exp(-dot(hq, hq) * 5.0) * 0.09; // a soft halo behind the can

    // the carved screen high in the frame: barely there, lit where the light passes through it
    float screen = lattice(vec2((uv.x - 0.5) * uAspect, uv.y) * 13.0);
    float screenMask = smoothstep(0.3, 0.62, up) * (1.0 - smoothstep(0.92, 1.0, uv.y));
    col += gold * screen * screenMask * (0.014 + 0.07 * cone);

    // the rosette behind the can
    col += gold * rosette(uv) * 0.13 * smoothstep(shore - 0.01, shore + 0.04, uv.y);

    // the pool
    float water = smoothstep(shore + 0.012, shore - 0.012, uv.y);
    if (water > 0.0) {
      float depth = clamp((shore - uv.y) / max(shore, 0.05), 0.0, 1.0);
      vec3 pool = mix(vec3(0.02, 0.072, 0.088), vec3(0.002, 0.011, 0.017), pow(depth, 0.7)) + uAccent * 0.004;
      float swell = vnoise(vec2(uv.x * uAspect * 6.0 + uTime * 0.05, depth * 70.0 - uTime * 0.6));
      // the dawn band and the rosette mirrored in the still water, broken up by the swell
      pool += vec3(0.42, 0.26, 0.11) * exp(-depth * 12.0) * 0.12;
      vec2 mirrored = vec2(uv.x + (swell - 0.5) * 0.012, 2.0 * shore - uv.y);
      pool += gold * rosette(mirrored) * 0.07 * (1.0 - smoothstep(0.0, 0.5, depth));
      // the overhead light on the water: a broken vertical streak under the can
      float streak = exp(-abs(x + (swell - 0.5) * 0.04) / (0.03 + 0.12 * depth));
      pool += dawn * 0.55 * streak * (0.04 + 0.1 * smoothstep(0.45, 0.85, swell)) * (1.0 - depth * 0.6);
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

/**
 * Film grade of the same bear (not on the site): the whole head as a cold, graded image blended normally, so the fur
 * and the snarl read on screen; the site's additive ghost only shows the ice in a lit frame. Same uniforms.
 */
const FILM_BEAR_FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform float uOpacity;
  uniform float uReveal;
  uniform float uSweep;
  uniform vec3 uTint;
  varying vec2 vUv;
  void main() {
    vec4 tex = texture2D(map, vUv);
    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    vec2 d = (vUv - vec2(0.52, 0.55)) * vec2(1.0, 1.2);
    float edge = smoothstep(0.62, 0.3, length(d));
    float noWordmark = smoothstep(0.16, 0.34, vUv.y);
    // the reveal rises from the jaw to the ears
    float reveal = smoothstep(1.0 - uReveal * 1.3, 1.2 - uReveal * 1.3, 1.0 - vUv.y);
    float warm = smoothstep(0.0, 0.14, tex.r - tex.b);
    vec3 fur = mix(vec3(lum) * vec3(0.85, 0.92, 1.0), tex.rgb, 0.55) * 1.05;
    vec3 ice = mix(vec3(lum), uTint, 0.35) * 0.9;
    vec3 c = mix(ice, fur, warm);
    float band = exp(-pow((vUv.x - (uSweep * 1.6 - 0.3)) * 3.0, 2.0));
    c += band * lum * mix(vec3(1.0), uTint, 0.5) * 0.8;
    // moonlit from the upper left; the lower half sinks into the night
    float facing = dot(normalize(d + 0.0001), normalize(vec2(-0.6, 0.8))) * 0.5 + 0.5;
    c *= mix(0.5, 1.1, facing) * mix(0.55, 1.0, smoothstep(0.2, 0.6, vUv.y));
    float a = smoothstep(0.02, 0.16, lum) * edge * noWordmark * reveal * uOpacity;
    gl_FragColor = vec4(c, a);
  }
`;

/** The bear from a flavor's label, rising behind the can. */
export class BearGhost {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly textures = new Map<string, THREE.Texture>();
  private aspect = 1.39;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, uOpacity: { value: 0 }, uReveal: { value: 0 }, uSweep: { value: 0 }, uTint: { value: new THREE.Color() } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: FILM_BEAR_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.renderOrder = -500;
    this.mesh.visible = false;
  }

  async load(slugs: string[]) {
    const loader = new THREE.TextureLoader();
    await Promise.all(
      slugs.map(async (slug) => {
        const texture = await loader.loadAsync(`/textures/grizzly/bear/${slug}.webp`);
        texture.colorSpace = THREE.SRGBColorSpace;
        this.aspect = texture.image.width / texture.image.height;
        this.textures.set(slug, texture);
      })
    );
  }

  /** opacity 0 hides it; reveal/sweep 0..1 as on the site; height in world units. */
  set(slug: string, tint: THREE.ColorRepresentation, opacity: number, reveal: number, sweep: number, height: number) {
    this.mesh.visible = opacity > 0.002;
    if (!this.mesh.visible) return;
    const u = this.material.uniforms;
    u.map.value = this.textures.get(slug) ?? null;
    u.uOpacity.value = opacity;
    u.uReveal.value = reveal;
    u.uSweep.value = sweep;
    (u.uTint.value as THREE.Color).set(tint);
    this.mesh.scale.set(height * this.aspect, height, 1);
  }
}

/** The Zamzam pool: dawn over still water, the carved lattice, the gold rosette, rings and a falling drop. */
export class ZamzamPool {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor() {
    const rosette = new THREE.CanvasTexture(drawRosette());
    rosette.colorSpace = THREE.NoColorSpace;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        uDrop: { value: 0 },
        uAspect: { value: 1 },
        uBase: { value: new THREE.Vector2(0.68, 0.2) },
        uAccent: { value: new THREE.Color() },
        uRosette: { value: rosette },
        uRosetteAt: { value: new THREE.Vector3(0.68, 0.45, 0.3) },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
      fragmentShader: ZAMZAM_FRAGMENT,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -900;
    this.mesh.visible = false;
  }
}

export { IMPACT as ZAMZAM_DROP_IMPACT };
