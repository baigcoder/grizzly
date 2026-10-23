import * as THREE from 'three';
import { createCanMesh, getCanParts, getCanSurface, setCanAccent, setCanFocus, type CanSurfaceUniforms } from './can/canModel';
import { CAN } from './can/canGeometry';
import { createStudioEnvironment } from './can/studioEnv';
import { SCENE_COLOR } from './can/palette';
import { PostFx } from './can/post';
import { Stage, type StageParams } from './site/stage';
import { FloorReflections } from './site/reflections';
import { BearGhost, ZamzamPool } from './site/moments';
import { FLAVORS } from './data';

/**
 * The film's 3D plate: the site's own can, its Stage backdrop (night, flavor colour field, colour-wave wipe, studio,
 * mist), its floor reflections and two of its moments (the roaring bear, the Zamzam pool), plus giant type planes that
 * sit behind the product, a cold spray for the crack, and true motion blur (several sub-frame renders averaged).
 * Everything is posed by the Director (shots.ts) as a pure function of time. Type in front of the product is drawn
 * by the Remotion layer (film/), not here.
 */

/** World y of the floor the cans' reflections are mirrored through. */
export const FLOOR_Y = -3.2;

/** Giant two-line type on a plane, drawn into a canvas once per text; never wider than the plane. */
export class TypePlane {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;
  private key = '';
  /** Aspect (w / h) of the drawn text block, for fitting. */
  aspect = 2;

  constructor() {
    this.canvas.width = 4096;
    this.canvas.height = 2048;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), this.material);
    this.mesh.renderOrder = -400;
    this.mesh.visible = false;
  }

  /** Lines of text; style 'fill' (gradient fill) or 'outline' (stroke only). */
  setText(lines: string[], style: 'fill' | 'outline' = 'fill') {
    const key = `${style}|${lines.join('|')}`;
    if (key === this.key) return;
    this.key = key;
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 4096, 2048);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = 820;
    ctx.font = `italic 900 ${size}px "Libre Franklin"`;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    // fit inside the canvas with a margin: the plane is sized to the text block, so nothing is ever cropped
    const scale = Math.min(1, 3800 / widest, 1900 / (lines.length * size * 0.9));
    const px = size * scale;
    ctx.font = `italic 900 ${px}px "Libre Franklin"`;
    const gap = px * 0.88;
    lines.forEach((line, i) => {
      const y = 1024 + (i - (lines.length - 1) / 2) * gap;
      if (style === 'outline') {
        ctx.lineWidth = px * 0.018;
        ctx.strokeStyle = 'rgba(255,255,255,1)';
        ctx.strokeText(line, 2048, y);
      } else {
        const g = ctx.createLinearGradient(0, y - gap / 2, 0, y + gap / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0.55)');
        ctx.fillStyle = g;
        ctx.fillText(line, 2048, y);
      }
    });
    const blockW = Math.min(3800, widest * scale) + px * 0.2;
    const blockH = lines.length * gap + px * 0.1;
    this.aspect = blockW / blockH;
    // crop the UVs to the block so the plane's size is the text's size
    const u0 = (2048 - blockW / 2) / 4096;
    const v0 = (1024 - blockH / 2) / 2048;
    this.texture.offset.set(u0, v0);
    this.texture.repeat.set(blockW / 4096, blockH / 2048);
    this.texture.needsUpdate = true;
  }

  /** Places the block centred at `pos`, `width` world units wide. */
  place(pos: THREE.Vector3, width: number, opacity: number, color: THREE.ColorRepresentation, camera: THREE.Camera) {
    this.mesh.visible = opacity > 0.002;
    this.material.opacity = opacity;
    this.material.color.set(color);
    this.mesh.position.copy(pos);
    this.mesh.scale.set(width, width / this.aspect / 0.5, 1);
    this.mesh.quaternion.copy(camera.quaternion);
  }
}

export interface CanRig {
  can: THREE.Group;
  surface: CanSurfaceUniforms;
  flavor: number;
}

const ACCUM_VERTEX = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class FilmScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly post: PostFx;
  readonly stage: Stage;
  readonly stageParams: StageParams;
  readonly rigs: CanRig[] = [];
  reflections!: FloorReflections;
  readonly bear = new BearGhost();
  readonly zamzam = new ZamzamPool();
  readonly typeBack = new TypePlane();
  readonly key: THREE.DirectionalLight;
  readonly rim: THREE.DirectionalLight;
  readonly fill: THREE.DirectionalLight;
  readonly baseFill: THREE.DirectionalLight;
  readonly sweep: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly spray: THREE.Points;
  readonly width: number;
  readonly height: number;
  private readonly envs = new Map<string, THREE.Texture>();
  // motion blur: sub-frames are averaged into a float target, then copied to the screen
  private readonly accum: THREE.WebGLRenderTarget;
  private readonly addScene = new THREE.Scene();
  private readonly addMaterial: THREE.ShaderMaterial;
  private readonly outScene = new THREE.Scene();
  private readonly orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.width = width;
    this.height = height;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(SCENE_COLOR.night, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.camera = new THREE.PerspectiveCamera(20, width / height, 0.1, 500);
    this.scene.environment = this.envFor(null);

    // the site's rig: hemi, cold key, strong back rim, soft fill, base fill, plus a sweep light for glints and flashes
    this.hemi = new THREE.HemisphereLight(SCENE_COLOR.skyFill, SCENE_COLOR.groundFill, 0.14);
    this.key = new THREE.DirectionalLight(SCENE_COLOR.key, 1.05);
    this.key.position.set(-1.6, 6.5, 4.2);
    this.rim = new THREE.DirectionalLight(SCENE_COLOR.rim, 2.6);
    this.rim.position.set(3.2, 3.5, -5);
    this.fill = new THREE.DirectionalLight(SCENE_COLOR.softFill, 0.18);
    this.fill.position.set(2.6, -0.6, 4.0);
    this.baseFill = new THREE.DirectionalLight(SCENE_COLOR.baseFill, 0.12);
    this.baseFill.position.set(0.5, -6, 3);
    this.sweep = new THREE.DirectionalLight(SCENE_COLOR.white, 0);
    this.scene.add(this.hemi, this.key, this.rim, this.fill, this.baseFill, this.sweep, this.sweep.target);

    this.stage = new Stage(this.renderer, width, height, 'HIGH');
    this.stage.refreshEvery = 1;
    this.scene.add(this.stage.background, this.stage.foreground);
    this.stageParams = {
      time: 0, aspect: width / height, horizon: 0.32, camX: 0, camY: 0, scroll: 0,
      accent: new THREE.Color(), accentPrev: new THREE.Color(), wipe: 1, wipeOrigin: new THREE.Vector2(0.5, 0.5),
      moon: 1, mountains: 1, mist: 1, mistFg: 0.5, burst: 0, burstPos: new THREE.Vector2(0.5, 0.5), water: 0,
      flash: 0, glow: 1, glowPos: new THREE.Vector2(0.5, 0.45), stars: 1, field: 0, studio: 0,
      moonPhase: 0.42, dawn: 0, dusk: 0.3,
    };

    this.scene.add(this.bear.mesh, this.zamzam.mesh, this.typeBack.mesh);
    this.spray = this.createSpray();
    this.scene.add(this.spray);

    this.post = new PostFx(this.renderer, this.scene, this.camera, width, height, 1, 'HIGH');
    this.post.composer.renderToScreen = false;

    this.accum = new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType, depthBuffer: false });
    this.addMaterial = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uWeight: { value: 1 } },
      vertexShader: ACCUM_VERTEX,
      fragmentShader: 'uniform sampler2D tSrc; uniform float uWeight; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb * uWeight, 1.0); }',
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const quad = new THREE.PlaneGeometry(2, 2);
    const addQuad = new THREE.Mesh(quad, this.addMaterial);
    addQuad.frustumCulled = false;
    this.addScene.add(addQuad);
    const outQuad = new THREE.Mesh(
      quad,
      new THREE.ShaderMaterial({
        uniforms: { tSrc: { value: this.accum.texture } },
        vertexShader: ACCUM_VERTEX,
        fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }',
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
    );
    outQuad.frustumCulled = false;
    this.outScene.add(outQuad);
  }

  /** Studio environment, optionally with the flavor's coloured gel strip (cached per colour). */
  envFor(accent: string | null): THREE.Texture {
    const key = accent ?? 'neutral';
    let env = this.envs.get(key);
    if (!env) {
      env = createStudioEnvironment(this.renderer, accent ?? undefined);
      this.envs.set(key, env);
    }
    return env;
  }

  /** Loads every flavor's label (albedo, surface, emboss) and builds one can per flavor, plus spares. */
  async loadCans(extraFlavors: number[] = []) {
    const loader = new THREE.TextureLoader();
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    const load = async (url: string, srgb: boolean) => {
      const tex = await loader.loadAsync(url);
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.anisotropy = aniso;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      return tex;
    };
    const maps = await Promise.all(
      FLAVORS.map(async (f) => {
        const base = `/textures/grizzly/${f.slug}`;
        const [albedo, surface, normal] = await Promise.all([load(`${base}.webp`, true), load(`${base}-surface.png`, false), load(`${base}-normal.png`, false)]);
        return { albedo, surface, normal };
      })
    );
    await this.bear.load(FLAVORS.map((f) => f.slug));
    const order = [...FLAVORS.keys(), ...extraFlavors];
    order.forEach((flavor) => {
      const m = maps[flavor];
      const can = createCanMesh(m.albedo, m.surface, false, m.normal);
      can.rotation.order = 'ZXY'; // spin about the can's own axis first, then lean
      setCanAccent(can, FLAVORS[flavor].accent);
      this.scene.add(can);
      this.rigs.push({ can, surface: getCanSurface(can)!, flavor });
    });
    this.reflections = new FloorReflections(this.scene, this.rigs.map((r) => r.can), { get: (i: number) => ({ albedo: maps[order[i] ?? i % FLAVORS.length].albedo }) });
  }

  setFocus(rig: CanRig, focus: number) {
    setCanFocus(rig.can, Math.round(focus * 100) / 100);
  }

  parts(rig: CanRig) {
    return getCanParts(rig.can)!;
  }

  // ── cold spray after the crack: fine droplets, a pure function of time since the crack ──
  private sprayData: Float32Array | null = null;
  private createSpray() {
    const count = 520;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(count), 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(count), 1));
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.sprayData = new Float32Array(count * 5);
    for (let i = 0; i < count; i += 1) {
      const a = rand() * Math.PI * 2;
      const up = 2.4 + rand() * 4.6;
      const out = 0.3 + rand() * 1.6;
      this.sprayData.set([Math.cos(a) * out, up, Math.sin(a) * out * 0.7 + 0.4, 0.5 + rand() * rand() * 3.4, rand() * 0.2], i * 5);
    }
    const material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uScale: { value: this.height / 2 } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        varying float vAlpha;
        uniform float uScale;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale * 0.03 / -mv.z;
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float d = length(q);
          if (d > 0.5) discard;
          float ring = smoothstep(0.5, 0.36, d) * (0.35 + 0.65 * smoothstep(0.18, 0.42, d));
          float spec = smoothstep(0.14, 0.0, length(q - vec2(-0.14, -0.14)));
          gl_FragColor = vec4(uColor * (ring * 1.4 + spec * 3.0), (ring * 0.8 + spec) * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.visible = false;
    return points;
  }

  updateSpray(dt: number, origin: THREE.Vector3, color: THREE.ColorRepresentation) {
    const data = this.sprayData!;
    const visible = dt > 0 && dt < 2.2;
    this.spray.visible = visible;
    if (!visible) return;
    (this.spray.material as THREE.ShaderMaterial).uniforms.uColor.value.set(color);
    const pos = this.spray.geometry.getAttribute('position') as THREE.BufferAttribute;
    const size = this.spray.geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const alpha = this.spray.geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      const o = i * 5;
      const t = Math.max(0, dt - data[o + 4]);
      const drag = (1 - Math.exp(-2.2 * t)) / 2.2;
      pos.setXYZ(i, origin.x + data[o] * drag, origin.y + data[o + 1] * drag - 4.9 * t * t * 0.55, origin.z + data[o + 2] * drag);
      size.setX(i, data[o + 3]);
      alpha.setX(i, t <= 0 ? 0 : Math.min(1, t * 20) * Math.max(0, 1 - t / 1.7));
    }
    pos.needsUpdate = true;
    size.needsUpdate = true;
    alpha.needsUpdate = true;
  }

  /** One sub-frame: backdrop, reflections, the scene through the site's post look; result stays in the composer. */
  private renderOnce(time: number) {
    this.rigs.forEach((r) => r.can.updateMatrixWorld(true));
    this.reflections.update(this.rigs.map((r) => r.can), FLOOR_Y, this.reflect, false);
    this.stage.update(this.stageParams);
    this.stage.renderBackdrop();
    this.post.render(time);
  }

  /** Floor reflection strength (0..1), set by the Director. */
  reflect = 1;

  /**
   * Renders the frame at time t, averaging `samples` sub-frames across a 180° shutter (half a frame).
   * `pose(t)` must pose the whole scene for time t.
   */
  render(t: number, fps: number, samples: number, pose: (time: number) => void) {
    const r = this.renderer;
    r.setRenderTarget(this.accum);
    r.setClearColor(0x000000, 1);
    r.clear(true, false, false);
    const shutter = 0.5 / fps;
    for (let i = 0; i < samples; i += 1) {
      const st = samples === 1 ? t : t + shutter * ((i + 0.5) / samples - 0.5);
      pose(st);
      this.renderOnce(st);
      this.addMaterial.uniforms.tSrc.value = this.post.composer.readBuffer.texture;
      this.addMaterial.uniforms.uWeight.value = 1 / samples;
      r.setRenderTarget(this.accum);
      r.autoClear = false;
      r.render(this.addScene, this.orthoCam);
      r.autoClear = true;
    }
    r.setRenderTarget(null);
    r.setClearColor(SCENE_COLOR.night, 1);
    r.render(this.outScene, this.orthoCam);
  }
}

export { CAN };
