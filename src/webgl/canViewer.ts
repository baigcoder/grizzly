import * as THREE from 'three';
import { createCanMesh, setCanFocus } from './canModel';
import { createStudioEnvironment } from './studioEnv';
import { SCENE_COLOR } from './palette';
import { CAN } from './canDimensions';
import { LABEL } from '../data/brand';

/**
 * A single real can in its own small canvas (the Limited editions panels): the site's can model, materials, studio
 * environment and label maps, lit like the product renders. It turns slowly on its own, floats a little, and can be
 * dragged round. Rendering runs only while `setActive(true)` (the page sets it from an IntersectionObserver), so
 * several viewers cost nothing off screen. The can geometry is the shared set: only this viewer's materials,
 * textures, environment and renderer are disposed.
 */
export class CanViewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly env: THREE.Texture;
  private can: THREE.Group | null = null;
  private textures: THREE.Texture[] = [];
  private frame = 0;
  private active = false;
  private last = 0;
  private yaw = 0;
  private spin = 0;
  private dragX: number | null = null;
  private readonly frontYaw = (0.5 - LABEL.frontCenterU) * Math.PI * 2;
  private readonly resizeObserver: ResizeObserver;
  /** Called once the first frame with the can is on screen (the fallback image can go). */
  public onReady: (() => void) | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly reducedMotion: boolean
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.className = 'can3d__canvas';
    host.append(this.renderer.domElement);

    this.env = createStudioEnvironment(this.renderer);
    this.scene.environment = this.env;
    // the product renders' lighting: a cool overhead key, a chrome back edge, a soft front fill and a lift for the base
    const key = new THREE.DirectionalLight(SCENE_COLOR.key, 1.5);
    key.position.set(-4.2, 6.5, 4.2);
    const rim = new THREE.DirectionalLight(SCENE_COLOR.rim, 2.2);
    rim.position.set(3.2, 3.5, -5);
    const fill = new THREE.DirectionalLight(SCENE_COLOR.softFill, 0.45);
    fill.position.set(2.6, -0.6, 4);
    const baseFill = new THREE.DirectionalLight(SCENE_COLOR.baseFill, 0.6);
    baseFill.position.set(0.5, -6, 3);
    this.scene.add(key, rim, fill, baseFill, new THREE.HemisphereLight(SCENE_COLOR.skyFill, SCENE_COLOR.groundFill, 0.25));

    // a long lens from a little above: the can reads straight on with a sliver of its lid, room round it to turn
    this.camera = new THREE.PerspectiveCamera(10, 1, 1, 200);
    const total = CAN.shellHeight + CAN.topHeight + CAN.bottomHeight;
    const centreY = (CAN.topHeight - CAN.bottomHeight) / 2;
    const distance = (total * 1.18) / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const elevation = THREE.MathUtils.degToRad(6);
    this.camera.position.set(0, centreY + distance * Math.sin(elevation), distance * Math.cos(elevation));
    this.camera.lookAt(0, centreY, 0);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();

    host.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
  }

  /** Loads the can's label maps (albedo, surface, emboss normal) and builds the can. */
  async load(urls: { albedo: string; surface: string; normal: string }) {
    const loader = new THREE.TextureLoader();
    const anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const get = (url: string, srgb: boolean) =>
      loader.loadAsync(url).then((texture) => {
        texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.anisotropy = anisotropy;
        return texture;
      });
    this.textures = await Promise.all([get(urls.albedo, true), get(urls.surface, false), get(urls.normal, false)]);
    const [albedo, surface, normal] = this.textures;
    this.can = createCanMesh(albedo, surface, false, normal);
    setCanFocus(this.can, 1);
    this.scene.add(this.can);
    this.renderFrame(performance.now());
    this.onReady?.();
  }

  setActive(active: boolean) {
    if (active === this.active) return;
    this.active = active;
    if (active) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    } else {
      cancelAnimationFrame(this.frame);
    }
  }

  private tick = (now: number) => {
    if (!this.active) return;
    this.renderFrame(now);
    this.frame = requestAnimationFrame(this.tick);
  };

  private renderFrame(now: number) {
    const delta = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.can) {
      // a slow turn of its own, eased back toward it after a drag
      if (this.dragX === null && !this.reducedMotion) this.spin += delta * 0.35;
      this.can.rotation.y = this.frontYaw + this.yaw + this.spin;
      const float = this.reducedMotion ? 0 : 1;
      this.can.position.y = Math.sin(now * 0.0011) * 0.06 * float;
      this.can.rotation.z = 0.06 + Math.sin(now * 0.0007) * 0.03 * float;
    }
    this.renderer.render(this.scene, this.camera);
  }

  private resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (width < 2 || height < 2) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (!this.active && this.can) this.renderFrame(performance.now());
  }

  private onDown = (event: PointerEvent) => {
    this.dragX = event.clientX;
  };

  private onMove = (event: PointerEvent) => {
    if (this.dragX === null) return;
    this.yaw += (event.clientX - this.dragX) * 0.012;
    this.dragX = event.clientX;
  };

  private onUp = () => {
    this.dragX = null;
  };

  dispose() {
    this.setActive(false);
    this.resizeObserver.disconnect();
    this.host.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.can?.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
    });
    this.textures.forEach((texture) => texture.dispose());
    this.env.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
