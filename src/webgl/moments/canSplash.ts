import * as THREE from 'three';
import type { SceneManager } from '../sceneManager';
import type { SceneMoment } from './types';
import { CAN } from '../canDimensions';

/**
 * The drink itself, when a can is cracked open (CanCrack calls `play`): a spray of glossy drops in the flavor's colour
 * bursts out of the opening and arcs down under gravity, each drop stretched along its flight, and cold condensation
 * beads up across the side of the can facing the viewer, a few of them running down the label, before all of it fades
 * (about 5 s).
 *
 * Trigger: CanCrack, at the moment the tab cracks. Persists: nothing. Time-driven. WebGL: two instanced meshes (one
 * draw call each, only while playing): the spray in world space, the beads parented to the can so they ride its tilt.
 * Optional: skipped under reduced motion. Fallback: nothing essential lives in it.
 */
const SPRAY_LIFE = 1.25;
const BEAD_LIFE = 5.2;
const GRAVITY = -13;

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * A water drop, drawn the way liquid reads rather than as a lit ball: a see-through tinted body that thickens toward
 * the rim (fresnel), one sharp highlight from the key light, and the caustic glow light gathers into on the far, lower
 * side after passing through the drop. Instanced (three.js supplies instanceMatrix), view-space shading, no textures.
 */
function createDropMaterial(opacity: number, shine: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTint: { value: new THREE.Color() }, uOpacity: { value: opacity }, uShine: { value: shine } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        mat4 model = modelViewMatrix * instanceMatrix;
        vec4 viewPosition = model * vec4(position, 1.0);
        vNormal = normalize(mat3(model) * normal);
        vViewDir = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      uniform float uOpacity;
      uniform float uShine;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewDir);
        float facing = clamp(dot(n, v), 0.0, 1.0);
        float rim = pow(1.0 - facing, 2.0);
        // the studio key light, upper left and in front
        vec3 light = normalize(vec3(-0.45, 0.72, 0.55));
        float highlight = pow(max(dot(n, normalize(light + v)), 0.0), 160.0) * uShine;
        // light focused through the drop lands low on the side opposite the highlight
        float caustic = smoothstep(0.55, 1.0, dot(n, normalize(vec3(0.38, -0.78, 0.5))));
        // clear liquid: the centre is almost see-through, the colour lives in the rim and the caustic
        vec3 color = uTint * (0.2 + 0.8 * rim) + uTint * caustic * 0.9 + vec3(1.0) * highlight;
        float alpha = clamp(uOpacity * (0.06 + 0.94 * rim) + highlight * 0.9 + caustic * 0.22, 0.0, 1.0);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

export class CanSplash implements SceneMoment {
  private readonly sprayCount: number;
  private readonly beadCount: number;
  private readonly spray: THREE.InstancedMesh;
  private readonly beads: THREE.InstancedMesh;
  private readonly sprayMaterial: THREE.ShaderMaterial;
  private readonly beadMaterial: THREE.ShaderMaterial;

  // spray state (world units): position, velocity, launch delay, size
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly delay: Float32Array;
  private readonly size: Float32Array;
  // bead state (can-local units): angle round the can, height, size, appear delay, run start and speed
  private readonly angle: Float32Array;
  private readonly height: Float32Array;
  private readonly beadSize: Float32Array;
  private readonly appear: Float32Array;
  private readonly runAt: Float32Array;
  private readonly runSpeed: Float32Array;

  private start = -1;
  private last = 0;
  private pending: { can: THREE.Group; color: THREE.Color } | null = null;
  private can: THREE.Group | null = null;
  private readonly origin = new THREE.Vector3();
  private readonly lift = new THREE.Vector3();
  private readonly toward = new THREE.Vector3();
  private readonly local = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly outward = new THREE.Vector3(0, 0, 1);
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(scene: SceneManager) {
    this.sprayCount = scene.isLowPower ? 48 : 90;
    this.beadCount = scene.isLowPower ? 22 : 38;

    // the drink: water-drop shading in the flavor colour
    this.sprayMaterial = createDropMaterial(0.8, 1.4);
    this.spray = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), this.sprayMaterial, this.sprayCount);
    this.spray.frustumCulled = false;
    this.spray.visible = false;
    scene.scene.add(this.spray);

    // condensation: clear water beads with a breath of the flavor colour, mostly rim and highlight
    this.beadMaterial = createDropMaterial(0.32, 0.9);
    this.beads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), this.beadMaterial, this.beadCount);
    this.beads.frustumCulled = false;
    this.beads.visible = false;

    this.pos = new Float32Array(this.sprayCount * 3);
    this.vel = new Float32Array(this.sprayCount * 3);
    this.delay = new Float32Array(this.sprayCount);
    this.size = new Float32Array(this.sprayCount);
    this.angle = new Float32Array(this.beadCount);
    this.height = new Float32Array(this.beadCount);
    this.beadSize = new Float32Array(this.beadCount);
    this.appear = new Float32Array(this.beadCount);
    this.runAt = new Float32Array(this.beadCount);
    this.runSpeed = new Float32Array(this.beadCount);
  }

  /** Starts the spray and the beads on this can, in the flavor colour (the next frame picks it up). */
  play(can: THREE.Group, color: THREE.Color) {
    this.pending = { can, color };
  }

  update(seconds: number, scene: SceneManager) {
    if (this.pending) this.begin(seconds, scene);
    if (this.start < 0 || !this.can) return;
    const t = seconds - this.start;
    const dt = Math.min(0.05, Math.max(0, seconds - this.last)); // (a stalled frame never throws a drop across the screen)
    this.last = seconds;
    if (t > BEAD_LIFE) {
      this.stop();
      return;
    }
    this.stepSpray(t, dt);
    this.stepBeads(t);
  }

  private begin(seconds: number, scene: SceneManager) {
    const { can, color } = this.pending!;
    this.pending = null;
    if (scene.reducedMotion) return;
    this.stop();
    this.can = can;
    this.start = seconds;
    this.last = seconds;
    const canScale = can.scale.x;

    // the drink is the flavor colour seen through clear liquid: lighter and less saturated than the label
    this.sprayMaterial.uniforms.uTint.value.set(0xdfe9f2).lerp(color, 0.55);
    this.beadMaterial.uniforms.uTint.value.set(0x9fb1c1).lerp(color, 0.15);

    // the opening, in world space, and the can's "up" and "toward the viewer" there
    can.updateMatrixWorld(true);
    this.origin.set(0, CAN.shellHeight / 2 + CAN.topHeight * 0.6, -0.2).applyMatrix4(can.matrixWorld);
    this.lift.set(0, 1, 0).transformDirection(can.matrixWorld);
    this.toward.copy(scene.camera.position).sub(this.origin).normalize();

    for (let i = 0; i < this.sprayCount; i += 1) {
      // a fizzing burst: most drops in the first 0.15 s, a tail over the next 0.4 s
      this.delay[i] = Math.random() < 0.7 ? rand(0, 0.15) : rand(0.15, 0.55);
      // mostly fine droplets, a few full drops
      this.size[i] = (Math.random() < 0.1 ? rand(0.032, 0.048) : rand(0.008, 0.024)) * canScale;
      const speed = rand(2.6, 5.6) * Math.sqrt(canScale);
      // a fizz: up out of the opening, leaning a little toward the viewer, in a tight cone
      this.direction
        .copy(this.lift)
        .addScaledVector(this.toward, rand(0.05, 0.35))
        .add(this.local.set(rand(-0.3, 0.3), rand(0, 0.2), rand(-0.22, 0.22)))
        .normalize()
        .multiplyScalar(speed);
      this.vel.set([this.direction.x, this.direction.y, this.direction.z], i * 3);
      this.pos.set([this.origin.x, this.origin.y, this.origin.z], i * 3);
    }
    this.spray.visible = true;

    // beads on the side facing the viewer: the camera's bearing in the can's own frame
    this.local.copy(scene.camera.position);
    can.worldToLocal(this.local);
    const facing = Math.atan2(this.local.x, this.local.z);
    const top = CAN.shellHeight / 2 - 0.22;
    for (let i = 0; i < this.beadCount; i += 1) {
      this.angle[i] = facing + rand(-1.15, 1.15);
      this.height[i] = rand(-top, top);
      this.beadSize[i] = rand(0.014, 0.034) * (Math.random() < 0.15 ? 1.4 : 1);
      this.appear[i] = rand(0.1, 1.0);
      // about a third grow heavy and run down the label
      const runs = Math.random() < 0.34;
      this.runAt[i] = runs ? rand(0.9, 2.8) : Infinity;
      this.runSpeed[i] = runs ? rand(0.35, 0.95) : 0;
    }
    can.add(this.beads);
    this.beads.visible = true;
  }

  private stepSpray(t: number, dt: number) {
    if (!this.spray.visible) return;
    let alive = 0;
    for (let i = 0; i < this.sprayCount; i += 1) {
      const age = t - this.delay[i];
      if (age < 0 || age > SPRAY_LIFE) {
        this.spray.setMatrixAt(i, this.hidden);
        continue;
      }
      alive += 1;
      const k = i * 3;
      this.vel[k + 1] += GRAVITY * dt;
      // a little air drag keeps the arcs soft
      this.vel[k] *= 1 - 0.6 * dt;
      this.vel[k + 2] *= 1 - 0.6 * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.position.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]);
      this.direction.set(this.vel[k], this.vel[k + 1], this.vel[k + 2]);
      const speed = this.direction.length();
      this.quaternion.setFromUnitVectors(this.up, this.direction.multiplyScalar(1 / Math.max(speed, 1e-4)));
      // born as a bead, stretched along its flight, shrinking away at the end of its life
      const grow = 0.3 + 0.7 * easeOut(Math.min(1, age / 0.1));
      const fade = 1 - THREE.MathUtils.smoothstep(age, SPRAY_LIFE * 0.55, SPRAY_LIFE);
      const s = this.size[i] * grow * fade;
      this.scale.set(s, s * (1 + Math.min(1.1, speed * 0.1)), s);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.spray.setMatrixAt(i, this.matrix);
    }
    this.spray.instanceMatrix.needsUpdate = true;
    if (alive === 0 && t > 0.6) this.spray.visible = false;
  }

  private stepBeads(t: number) {
    const radius = CAN.radius;
    const bottom = -CAN.shellHeight / 2 + 0.15;
    const fadeOut = 1 - THREE.MathUtils.smoothstep(t, BEAD_LIFE - 1.4, BEAD_LIFE);
    for (let i = 0; i < this.beadCount; i += 1) {
      const appear = easeOut(THREE.MathUtils.clamp((t - this.appear[i]) / 0.45, 0, 1));
      let y = this.height[i];
      let size = this.beadSize[i];
      if (t > this.runAt[i]) {
        // a running bead picks up speed and pace, swelling as it gathers the ones below it
        const run = t - this.runAt[i];
        y -= this.runSpeed[i] * run * (0.5 + run * 0.6);
        size *= 1 + Math.min(0.5, run * 0.25);
      }
      const gone = y < bottom ? 0 : 1;
      const s = size * appear * fadeOut * gone;
      if (s <= 1e-4) {
        this.beads.setMatrixAt(i, this.hidden);
        continue;
      }
      const a = this.angle[i];
      // half sunk into the shell, flattened against it (a water bead, not a ball)
      this.position.set(Math.sin(a) * (radius + s * 0.25), y, Math.cos(a) * (radius + s * 0.25));
      this.direction.set(Math.sin(a), 0, Math.cos(a));
      this.quaternion.setFromUnitVectors(this.outward, this.direction);
      // a runner stretches into a teardrop along its path
      const stretch = t > this.runAt[i] ? 1.45 : 1;
      this.scale.set(s, s * stretch, s * 0.5);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.beads.setMatrixAt(i, this.matrix);
    }
    this.beads.instanceMatrix.needsUpdate = true;
  }

  private stop() {
    this.start = -1;
    this.spray.visible = false;
    this.beads.visible = false;
    this.beads.removeFromParent();
    this.can = null;
  }

  dispose() {
    this.stop();
    this.spray.removeFromParent();
    this.spray.geometry.dispose();
    this.beads.geometry.dispose();
    this.sprayMaterial.dispose();
    this.beadMaterial.dispose();
  }
}
