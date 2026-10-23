import * as THREE from 'three';
import type { SceneManager } from '../sceneManager';
import type { SceneMoment } from './types';
import { LID_Y } from '../canGeometry';
import { getCanSurface, type CanSurfaceUniforms } from '../canModel';
import { WET_LIFE } from '../condensation';

/**
 * The drink breathing out when a can is cracked open (CanCrack calls `play`), shot like a drink commercial: a short
 * spritz of fine carbonation sparkles out of the opening and falls back, a thin cold vapour wisp curls up out of it
 * and dissolves, and cold condensation forms on the label, beads and runs, then dries off (condensation.ts, part of
 * the can's own surface shader). The flavor colour (the accent passed to play) is carried by light only: the fizz,
 * the vapour's heart and the caustics focused through the beads; the can keeps its own dark colours throughout.
 *
 * Trigger: CanCrack, at the moment the tab cracks. Persists: nothing. Time-driven (WET_LIFE, ~5.8 s; the fizz and the
 * vapour are gone after ~2.4 s). WebGL: the fizz is one Points draw (the whole flight is computed in its vertex
 * shader from per-sparkle seeds: no per-frame buffer upload), the vapour one quad with a noise shader, both parented
 * to the can so they leave with it and drawn only while they play; the condensation adds no draw call (uniforms on
 * the opened can's surface material). Optional: skipped under reduced motion. Fallback: nothing essential lives in it.
 */
const FIZZ_LIFE = 1.7;
const VAPOUR_LIFE = 2.6;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** The opening in can-local units (CanModel: the Opening mesh sits at LID_Y + 0.004, z -0.2). */
const MOUTH = new THREE.Vector3(0, LID_Y + 0.02, -0.2);

/**
 * Carbonation: fine bright droplets and bubbles that jump out of the opening, slow in the air and drop back. Each is
 * soft round sprite: a white-hot pinpoint in a glow of the flavor colour (the fuller drops keep a faint meniscus
 * edge), with a faint twinkle.
 * Additive, so it only ever adds light. Flight from seeds: aSeed = (launch delay, life, speed, size), aDir = launch
 * direction in a frame where y is up and z is toward the viewer.
 */
function createFizzMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uMouth: { value: MOUTH.clone() },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uToward: { value: new THREE.Vector3(0, 0, 1) },
      uSide: { value: new THREE.Vector3(1, 0, 0) },
      uScale: { value: 1 },
      uTint: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      attribute vec3 aDir;
      uniform float uTime;
      uniform vec3 uMouth;
      uniform vec3 uUp;
      uniform vec3 uToward;
      uniform vec3 uSide;
      uniform float uScale;
      varying float vAlpha;
      varying float vTwinkle;
      varying float vSize;
      void main() {
        float age = uTime - aSeed.x;
        float life = aSeed.y;
        if (age < 0.0 || age > life) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          gl_PointSize = 0.0;
          vAlpha = 0.0;
          vTwinkle = 0.0;
          vSize = 0.0;
          return;
        }
        vec3 dir = uSide * aDir.x + uUp * aDir.y + uToward * aDir.z;
        // air drag on a tiny drop: it slows quickly, then gravity takes it back down
        float drag = 3.2;
        float travel = (1.0 - exp(-drag * age)) / drag;
        vec3 p = uMouth + dir * aSeed.z * travel - uUp * 2.4 * age * age;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float k = age / life;
        gl_PointSize = clamp(aSeed.w * uScale / -mv.z, 2.0, 14.0);
        vSize = gl_PointSize;
        // pops in, glitters, and evaporates
        vAlpha = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.55, 1.0, k));
        vTwinkle = 0.65 + 0.35 * sin(age * 38.0 + aSeed.x * 91.0 + aSeed.w * 17.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      varying float vAlpha;
      varying float vTwinkle;
      varying float vSize;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(c, c);
        if (r2 > 1.0) discard;
        // a glitter of light, not a ball: a white-hot pinpoint inside a soft glow in the drink's colour
        float core = exp(-r2 * 22.0);
        float glow = exp(-r2 * 4.0) * (1.0 - r2);
        // the fuller drops (many pixels wide) keep a faint meniscus edge
        float ring = smoothstep(9.0, 14.0, vSize) * smoothstep(0.5, 0.85, r2) * (1.0 - smoothstep(0.85, 1.0, r2));
        vec3 color = uTint * (glow * 0.7 + ring * 0.25) + mix(uTint, vec3(1.0), 0.55) * core * 1.6 * vTwinkle;
        gl_FragColor = vec4(color * vAlpha, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * The cold breath: a thin translucent wisp curling up out of the opening and dissolving. A camera-facing quad (built
 * in the vertex shader, anchored at the mouth, its "up" the world's up) with a few octaves of warped value noise,
 * premultiplied so it only lifts the dark behind it a little; its dense heart glows faintly in the flavor colour.
 */
function createVapourMaterial(octaves: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    blending: THREE.NormalBlending,
    defines: { OCTAVES: octaves },
    uniforms: {
      uTime: { value: 0 },
      uMouth: { value: MOUTH.clone() },
      uSize: { value: new THREE.Vector2(1.1, 1.9) },
      uTint: { value: new THREE.Color() },
      uSeed: { value: 0 },
      uOpacity: { value: 0.2 },
    },
    vertexShader: /* glsl */ `
      uniform vec3 uMouth;
      uniform vec2 uSize;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 centre = modelViewMatrix * vec4(uMouth, 1.0);
        vec3 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        vec3 right = normalize(cross(up, vec3(0.0, 0.0, 1.0)));
        // the quad's bottom edge sits just inside the mouth; scale comes with the can
        float scale = length(modelMatrix[0].xyz);
        vec3 p = centre.xyz + (right * (uv.x - 0.5) * uSize.x + up * (uv.y - 0.06) * uSize.y) * scale;
        gl_Position = projectionMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uTint;
      uniform float uSeed;
      uniform float uOpacity;
      varying vec2 vUv;
      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float sum = 0.0;
        float amp = 0.5;
        for (int i = 0; i < OCTAVES; i++) {
          sum += amp * noise(p);
          p = p * 2.03 + vec2(1.7, -0.9);
          amp *= 0.5;
        }
        return sum;
      }
      void main() {
        float t = uTime;
        float y = vUv.y;
        float x = vUv.x - 0.5;
        // the wisp leans and curls as it climbs: a slow sway that grows with height
        float sway = (0.06 * sin(y * 5.0 - t * 2.3 + uSeed) + 0.04 * sin(y * 9.0 + t * 1.3)) * y;
        vec2 p = vec2((x - sway) * 3.2, y * 2.6 - t * 1.25) + uSeed;
        float warp = fbm(p * 1.1 + vec2(0.0, -t * 0.4));
        float d = fbm(p * 1.5 + vec2(warp * 1.6, warp * 0.8));
        // narrow at the mouth, spreading as it rises
        float width = mix(0.1, 0.34, smoothstep(0.0, 1.0, y));
        float column = exp(-pow((x - sway) / width, 2.0) * 1.6);
        // one breath: the head rises, the tail lets go of the mouth, everything thins out
        float head = 0.25 + t * 0.95;
        float tail = max(0.0, t - 0.45) * 0.75;
        float body = smoothstep(head, head - 0.35, y) * smoothstep(tail - 0.02, tail + 0.25, y);
        float life = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.9, 2.2, t));
        float density = smoothstep(0.42, 0.85, d) * column * body * life * smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.75, 1.0, y));
        float a = clamp(density * uOpacity, 0.0, 1.0);
        // cold, cool-white vapour; its dense heart near the mouth glows in the flavor colour (added light only, so the
        // colour stays luminous instead of muddying the breath)
        float heart = column * smoothstep(0.45, 0.85, d) * (1.0 - smoothstep(0.1, 0.6, y)) * body * life;
        vec3 color = vec3(0.8, 0.85, 0.92);
        gl_FragColor = vec4(color * a + uTint * heart * 0.5, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

export class CanSplash implements SceneMoment {
  private readonly fizz: THREE.Points;
  private readonly fizzMaterial: THREE.ShaderMaterial;
  private readonly vapour: THREE.Mesh;
  private readonly vapourMaterial: THREE.ShaderMaterial;

  private start = -1;
  private warming = 0;
  private pending: { can: THREE.Group; color: THREE.Color } | null = null;
  private can: THREE.Group | null = null;
  private surface: CanSurfaceUniforms | null = null;
  private readonly inverse = new THREE.Matrix4();
  private readonly local = new THREE.Vector3();
  private readonly buffer = new THREE.Vector2();

  constructor(scene: SceneManager) {
    const count = scene.isLowPower ? 110 : 220;
    const seeds = new Float32Array(count * 4);
    const dirs = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      // a pop: most of it in the first 0.2 s, a fizzing tail over the next second
      const delay = Math.random() < 0.65 ? rand(0, 0.2) : rand(0.2, 1.0);
      const high = Math.random() < 0.3;
      // fine glitter, a few fuller droplets (world units: a can is 4.5 tall)
      const size = Math.random() < 0.1 ? rand(0.03, 0.042) : rand(0.01, 0.022);
      seeds.set([delay, rand(0.35, 0.7), high ? rand(3.0, 4.6) : rand(1.4, 2.8), size], i * 4);
      // up out of the mouth in a cone, spreading a little sideways and toward the viewer
      const spread = high ? 0.25 : 0.55;
      const x = rand(-spread, spread);
      const z = rand(-0.1, spread * 0.8);
      const length = Math.hypot(x, 1, z);
      dirs.set([x / length, 1 / length, z / length], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    // positions are computed in the shader; the attribute only sets the vertex count
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    geometry.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));
    this.fizzMaterial = createFizzMaterial();
    this.fizz = new THREE.Points(geometry, this.fizzMaterial);
    this.fizz.frustumCulled = false;
    this.fizz.visible = false;
    this.fizz.renderOrder = 2;

    this.vapourMaterial = createVapourMaterial(scene.isLowPower ? 3 : 4);
    this.vapour = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.vapourMaterial);
    this.vapour.frustumCulled = false;
    this.vapour.visible = false;
    this.vapour.renderOrder = 1;

    // warm-up: drawn for one frame while empty (uTime -1: every sparkle unborn, no breath yet), so their programs are
    // compiled before the first crack instead of stalling it
    this.fizzMaterial.uniforms.uTime.value = -1;
    this.vapourMaterial.uniforms.uTime.value = -1;
    this.fizz.visible = true;
    this.vapour.visible = true;
    scene.scene.add(this.fizz, this.vapour);
    this.warming = 2; // (moments update before the render: the second update removes them after one drawn frame)
  }

  /** Starts the fizz, the vapour and the condensation on this can, tinted by the flavor (the next frame picks it up). */
  play(can: THREE.Group, color: THREE.Color) {
    this.pending = { can, color };
  }

  update(seconds: number, scene: SceneManager) {
    if (this.warming > 0) {
      this.warming -= 1;
      if (this.warming === 0 && this.start < 0 && !this.pending) this.stop();
    }
    if (this.pending) this.begin(seconds, scene);
    if (this.start < 0 || !this.can || !this.surface) return;
    const t = seconds - this.start;
    if (t > WET_LIFE || !this.can.visible) {
      this.stop();
      return;
    }
    this.surface.uWetTime.value = t;

    const flying = t < FIZZ_LIFE;
    const breathing = t < VAPOUR_LIFE;
    this.fizz.visible = flying;
    this.vapour.visible = breathing;
    if (!flying && !breathing) return;
    this.fizzMaterial.uniforms.uTime.value = t;
    this.vapourMaterial.uniforms.uTime.value = t;
    if (!flying) return;

    // the fizz flies in the world, not in the tilted can: world up and the viewer's direction in the can's frame
    const can = this.can;
    can.updateMatrixWorld();
    this.inverse.copy(can.matrixWorld).invert();
    const u = this.fizzMaterial.uniforms;
    const up = (u.uUp.value as THREE.Vector3).set(0, 1, 0).transformDirection(this.inverse);
    this.local.copy(scene.camera.position).applyMatrix4(this.inverse).sub(MOUTH);
    const toward = (u.uToward.value as THREE.Vector3).copy(this.local).addScaledVector(up, -this.local.dot(up)).normalize();
    (u.uSide.value as THREE.Vector3).crossVectors(up, toward).normalize();
    // pixels per world unit at distance 1, so the sprites keep their size in the world (and on any screen)
    scene.renderer.getDrawingBufferSize(this.buffer);
    u.uScale.value = (this.buffer.y / (2 * Math.tan(THREE.MathUtils.degToRad(scene.camera.fov) / 2))) * can.scale.x;
  }

  private begin(seconds: number, scene: SceneManager) {
    const { can, color } = this.pending!;
    this.pending = null;
    if (scene.reducedMotion) return;
    this.stop();
    const surface = getCanSurface(can);
    if (!surface) return;
    this.can = can;
    this.surface = surface;
    this.start = seconds;

    // the flavor lives in the light, never on the can: the fizz, the vapour's heart, the caustics through the beads
    this.fizzMaterial.uniforms.uTint.value.copy(color);
    this.vapourMaterial.uniforms.uTint.value.copy(color);
    this.vapourMaterial.uniforms.uSeed.value = Math.random() * 10;
    surface.uWetTint.value.copy(color);
    surface.uWetSeed.value = Math.floor(Math.random() * 97);
    surface.uWetTime.value = 0;
    surface.uWet.value = 1;

    can.add(this.fizz, this.vapour);
  }

  private stop() {
    this.start = -1;
    if (this.surface) this.surface.uWet.value = 0;
    this.surface = null;
    this.fizz.visible = false;
    this.vapour.visible = false;
    this.fizz.removeFromParent();
    this.vapour.removeFromParent();
    this.can = null;
  }

  dispose() {
    this.stop();
    this.fizz.geometry.dispose();
    this.vapour.geometry.dispose();
    this.fizzMaterial.dispose();
    this.vapourMaterial.dispose();
  }
}
