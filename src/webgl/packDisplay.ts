import * as THREE from 'three';
import { CAN, TAB_PIVOT, getCanGeometry } from './canGeometry';
import { createCanMaterials, createPlaceholderLabel } from './canModel';
import { SCENE_COLOR } from './palette';
import type { LabelMaps } from './labelTextures';

/**
 * The product page's pack picker, made physical: the pack you pick is the pack you see.
 *
 * - 1 can: the hero can alone (this module stays hidden).
 * - 6 cans: two rows of three held by a printed paperboard top clip, pressed down onto the lids.
 * - 12 and 24 cans: warehouse case packs, as they leave the line: a printed tray blank slides in and its walls fold
 *   up, the cans drop in row by row, and a clear film wraps the lot and heat-shrinks tight, leaving the classic
 *   oval "bullseye" openings at the ends.
 *
 * Trigger: the chosen pack option (ProductDetailPage → SceneManager.setProductPack). Changing pack plays the current
 * pack out (reversed, faster) and the new one in. State-driven, not scroll-driven; drag turns it like the can.
 * WebGL: the cans are four instanced meshes sharing the can geometry (one draw call per part for up to 24 cans);
 * tray, clip, film and contact shadow are procedural (geometry and canvas prints built once per pack size, on first
 * use). Instance matrices are only rewritten while the pack is assembling. Reduced motion: packs switch instantly.
 * Optional: without it the product page shows the single can. Everything is freed in dispose().
 *
 * Mix mode (the Mix your pack page, updateMix): the tray or clip stands ready, every filled slot drops in a can of
 * its own flavor (each flavor is its own instanced shell, so a pack can hold any mix), a cleared slot lifts its can
 * out, and the pack only closes (clip pressed down, film shrunk on) once every slot is full.
 */

const PITCH = CAN.radius * 2 * 1.004; // can-to-can spacing in a pack
const CAN_FOOT = CAN.shellHeight / 2 + CAN.bottomHeight; // shell centre above the floor the can stands on
const CAN_HEIGHT = CAN_FOOT + CAN.shellHeight / 2 + CAN.topHeight;
const NECK_Y = CAN.shellHeight / 2 + 0.2; // where the clip grips, under the chime (see TOP_PROFILE)
const TRAY_FLOOR = 0.06;
const TRAY_WALL = 1.05; // about a quarter of the can, like a real shrink tray
const BOARD = 0.035; // corrugated board thickness
const MAX_CANS = 24;
/** Three-quarter view from a little above, so the lids, the long side and one bullseye end all read at once. */
const BASE_YAW = -0.5;
const BASE_PITCH = 0.42;

type PackKind = 'clip' | 'tray';
interface PackParts {
  count: number;
  cols: number;
  rows: number;
  kind: PackKind;
  /** Assembly time in seconds. */
  duration: number;
  root: THREE.Group;
  /** Tray: the blank (floor) and the four wall pivots, folded flat at 0 and upright at 1. */
  tray?: { blank: THREE.Group; walls: THREE.Group[] };
  film?: THREE.Mesh;
  filmUniform?: { value: number };
  clip?: THREE.Mesh;
  shadow: THREE.Mesh;
  /** Visual height (floor to film top) and the projected size at the base view, for fitting the frame. */
  height: number;
  fitWidth: number;
  fitHeight: number;
  disposables: Array<{ dispose: () => void }>;
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const hash = (n: number) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

/** Ease-out with one small bounce: a can landing in the tray. */
function landing(t: number) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

export class PackDisplay {
  readonly group = new THREE.Group();
  /** 1 while the single hero can should show, 0 while a pack stands in its place. */
  heroPresence = 1;

  /** One instanced label shell per flavor (built on first use), so a pack can mix flavors. */
  private readonly shells: (THREE.InstancedMesh | null)[];
  private readonly shellCounts: Int32Array;
  private readonly flavorMaps: (LabelMaps | null)[];
  private readonly placeholder = createPlaceholderLabel();
  private readonly top: THREE.InstancedMesh;
  private readonly bottom: THREE.InstancedMesh;
  private readonly tab: THREE.InstancedMesh;
  private readonly metalMaterial: THREE.Material;
  private readonly baseMaterial: THREE.Material;
  private readonly parts = new Map<number, PackParts>();
  private readonly wrinkles: THREE.DataTexture;
  private readonly isLowPower: boolean;

  private shown = 1;
  private productFlavor = 0;
  private progress = 0;
  // mix mode: each slot's wanted flavor, the flavor its can shows now, and that can's drop (0 out .. 1 in)
  private mixMode = false;
  private mixMoving = false;
  private readonly slotShown = new Int8Array(MAX_CANS).fill(-1);
  private readonly slotT = new Float32Array(MAX_CANS);
  private wrapT = 0;
  private appliedProgress = -1;
  private current: PackParts | null = null;
  private printKey = '';
  private accent = '#ffffff';
  private flavorName = '';
  private fontsReady = false;
  private disposed = false;

  // scratch objects (no allocation per frame)
  private readonly matrix = new THREE.Matrix4();
  private readonly tabMatrix = new THREE.Matrix4();
  private readonly tabOffset = new THREE.Matrix4().makeTranslation(TAB_PIVOT.x, TAB_PIVOT.y, TAB_PIVOT.z - 0.02);
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();
  private readonly offset = new THREE.Vector3();
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(scene: THREE.Scene, flavorCount: number, isLowPower: boolean) {
    this.isLowPower = isLowPower;
    this.shells = Array.from({ length: flavorCount }, () => null);
    this.shellCounts = new Int32Array(flavorCount);
    this.flavorMaps = Array.from({ length: flavorCount }, () => null);
    const geometry = getCanGeometry();
    // the ends are shared by every flavor; each flavor's label shell is made in shellFor()
    const materials = createCanMaterials(this.placeholder, null, isLowPower, null);
    materials.bodyMat.dispose();
    this.metalMaterial = materials.aluminumMat;
    const base = materials.aluminumMat.clone() as THREE.MeshStandardMaterial;
    base.roughness = 0.46;
    base.color.setHex(SCENE_COLOR.baseRim);
    this.baseMaterial = base;

    this.top = new THREE.InstancedMesh(geometry.top, this.metalMaterial, MAX_CANS);
    this.bottom = new THREE.InstancedMesh(geometry.bottom, this.baseMaterial, MAX_CANS);
    this.tab = new THREE.InstancedMesh(geometry.tab, this.metalMaterial, MAX_CANS);
    [this.top, this.bottom, this.tab].forEach((mesh) => {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // instances move far from the base geometry's bounds while they drop in
      mesh.count = 0;
      this.group.add(mesh);
    });

    this.wrinkles = createWrinkleNormals();
    this.group.visible = false;
    scene.add(this.group);
    void document.fonts
      .load("italic 900 64px 'Libre Franklin'")
      .catch(() => undefined)
      .then(() => {
        if (this.disposed) return;
        this.fontsReady = true;
        this.printKey = ''; // redraw the prints in the brand face
      });
  }

  /** True while a pack is assembling or leaving (the scene keeps full frame rate for it). */
  get isAnimating() {
    if (this.mixMode) return this.mixMoving;
    return this.current ? this.appliedProgress !== this.progress || this.progress < 1 : this.heroPresence < 1;
  }

  /** A flavor's current label maps (called every frame; only a changed texture is swapped in). */
  setFlavorLabel(flavor: number, maps: LabelMaps) {
    this.flavorMaps[flavor] = maps;
    const material = this.shells[flavor]?.material as THREE.MeshStandardMaterial | undefined;
    if (!material) return;
    if (material.map !== maps.albedo) material.map = maps.albedo;
    if (material.metalnessMap !== maps.surface) {
      material.metalnessMap = maps.surface;
      material.roughnessMap = maps.surface;
    }
    if (!this.isLowPower && material.normalMap !== maps.normal) {
      material.normalMap = maps.normal;
      material.needsUpdate = true;
    }
  }

  /** Product page: the flavor every can wears, and the flavor colour and name printed on the tray and clip. */
  setProductFlavor(flavor: number, accent: string, flavorName: string) {
    this.productFlavor = flavor;
    this.accent = accent;
    this.flavorName = flavorName;
    this.refreshPrints();
  }

  /** This flavor's instanced label shell (built on first use, with its own label material). */
  private shellFor(flavor: number) {
    let shell = this.shells[flavor];
    if (!shell) {
      const maps = this.flavorMaps[flavor];
      const material = createCanMaterials(maps?.albedo ?? this.placeholder, maps?.surface ?? null, this.isLowPower, this.isLowPower ? null : maps?.normal ?? null).bodyMat;
      shell = new THREE.InstancedMesh(getCanGeometry().shell, material, MAX_CANS);
      shell.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      shell.frustumCulled = false;
      shell.count = 0;
      this.shells[flavor] = shell;
      this.group.add(shell);
    }
    return shell;
  }

  /** Writes can k (all its parts) at `matrix`, in `flavor`'s label; -1 hides it. */
  private writeCan(k: number, flavor: number, matrix: THREE.Matrix4) {
    if (flavor < 0) {
      this.top.setMatrixAt(k, this.hidden);
      this.bottom.setMatrixAt(k, this.hidden);
      this.tab.setMatrixAt(k, this.hidden);
      return;
    }
    this.shellFor(flavor).setMatrixAt(this.shellCounts[flavor]++, matrix);
    this.top.setMatrixAt(k, matrix);
    this.bottom.setMatrixAt(k, matrix);
    this.tabMatrix.multiplyMatrices(matrix, this.tabOffset);
    this.tab.setMatrixAt(k, this.tabMatrix);
  }

  private beginCans() {
    this.shellCounts.fill(0);
  }

  private endCans(total: number) {
    this.shells.forEach((shell, flavor) => {
      if (!shell) return;
      shell.count = this.shellCounts[flavor];
      shell.instanceMatrix.needsUpdate = true;
    });
    this.top.count = total;
    this.bottom.count = total;
    this.tab.count = total;
    this.top.instanceMatrix.needsUpdate = true;
    this.bottom.instanceMatrix.needsUpdate = true;
    this.tab.instanceMatrix.needsUpdate = true;
  }

  /**
   * Mix your pack: `size` cans (6, 12 or 24); `slots[k]` is the flavor index in slot k, or -1 for an empty slot.
   * The tray or clip stands ready, filled slots drop their cans in, cleared ones lift out, and the pack closes once
   * it is full. A new size clears the pack and builds the new one.
   */
  updateMix(delta: number, size: number, slots: ArrayLike<number>, reducedMotion: boolean) {
    const rm = reducedMotion;
    this.mixMode = true;
    let moving = false;
    if (size !== this.shown) {
      // clear the current pack quickly, then build the new size
      let any = false;
      for (let k = 0; k < MAX_CANS; k += 1) {
        this.slotT[k] = rm ? 0 : Math.max(0, this.slotT[k] - delta * 6);
        if (this.slotT[k] > 0) any = true;
      }
      this.wrapT = rm ? 0 : Math.max(0, this.wrapT - delta * 5);
      if (!any && this.wrapT === 0) {
        this.show(size);
        this.slotShown.fill(-1);
        this.progress = rm ? 1 : 0;
      }
      moving = true;
    } else {
      if (this.progress < 1) {
        this.progress = rm ? 1 : Math.min(1, this.progress + delta / 0.7);
        moving = true;
      }
      let full = true;
      let settled = true;
      for (let k = 0; k < size; k += 1) {
        const target = k < slots.length ? slots[k] : -1;
        if (target < 0) full = false;
        const before = this.slotT[k];
        if (this.slotShown[k] !== target) {
          // a different flavor (or none): the can lifts out first
          this.slotT[k] = rm ? 0 : Math.max(0, before - delta * 5);
          if (this.slotT[k] === 0) this.slotShown[k] = target;
        } else if (target >= 0) {
          this.slotT[k] = rm ? 1 : Math.min(1, before + delta * 2.4);
        }
        if (this.slotT[k] !== before) moving = true;
        if (target >= 0 && this.slotT[k] < 1) settled = false;
      }
      const wrapBefore = this.wrapT;
      this.wrapT = full && settled ? (rm ? 1 : Math.min(1, this.wrapT + delta * 1.2)) : rm ? 0 : Math.max(0, this.wrapT - delta * 5);
      if (this.wrapT !== wrapBefore) moving = true;
    }
    this.mixMoving = moving;
    if (this.current && (moving || this.appliedProgress < 0)) this.applyMix();
    this.group.visible = !!this.current;
  }

  /** Mix mode layout: the tray stands (by `progress`), each slot's can at its own drop, the closing by `wrapT`. */
  private applyMix() {
    const parts = this.current;
    if (!parts) return;
    this.appliedProgress = this.progress;
    const { cols, rows, kind } = parts;
    const total = cols * rows;
    const isTray = kind === 'tray';
    const floor = isTray ? TRAY_FLOOR : 0;
    this.beginCans();
    for (let k = 0; k < total; k += 1) {
      const c = this.slotT[k];
      const flavor = this.slotShown[k];
      if (flavor < 0 || c <= 0) {
        this.writeCan(k, -1, this.hidden);
        continue;
      }
      const row = Math.floor(k / cols);
      const col = k % cols;
      const jitter = hash(k + total * 7) - 0.5;
      this.euler.set((1 - c) * 0.25 * jitter, -0.35 + 0.55 + jitter * 0.6, (1 - c) * 0.35 * jitter, 'XYZ');
      this.quaternion.setFromEuler(this.euler);
      this.position.set((col - (cols - 1) / 2) * PITCH, floor + CAN_FOOT + (1 - landing(c)) * 4.5, (row - (rows - 1) / 2) * PITCH);
      this.scale.setScalar(1);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.writeCan(k, flavor, this.matrix);
    }
    this.endCans(total);
    this.layoutPack(parts, this.progress * 0.24, this.wrapT);
  }

  /**
   * Steps the pack toward `count` cans: the shown pack plays out before the new one plays in. `heroPresence` tells
   * the scene how much of the single hero can to show.
   */
  update(delta: number, count: number, reducedMotion: boolean) {
    const want = count >= 6 ? count : 1;
    if (want !== this.shown) {
      if (this.shown === 1) {
        this.heroPresence = reducedMotion ? 0 : Math.max(0, this.heroPresence - delta * 3.2);
        if (this.heroPresence === 0) this.show(want);
      } else {
        this.progress = reducedMotion ? 0 : Math.max(0, this.progress - delta * 2.4);
        if (this.progress === 0) this.show(want);
      }
    } else if (this.shown === 1) {
      this.heroPresence = reducedMotion ? 1 : Math.min(1, this.heroPresence + delta * 2.4);
    } else if (this.current) {
      this.progress = reducedMotion ? 1 : Math.min(1, this.progress + delta / this.current.duration);
    }
    if (this.current && this.progress !== this.appliedProgress) this.apply(this.progress);
    this.group.visible = !!this.current && this.progress > 0;
  }

  /**
   * Places the pack's visual centre at (x, y, z), turned by the viewer's drag (yaw, pitch), scaled to fit inside
   * `width` × `height` world units.
   */
  place(x: number, y: number, z: number, yaw: number, pitch: number, width: number, height: number) {
    const parts = this.current;
    if (!parts) return;
    const scale = Math.min(width / parts.fitWidth, height / parts.fitHeight);
    this.euler.set(BASE_PITCH + pitch * 0.6, BASE_YAW + yaw, 0, 'XYZ');
    this.group.quaternion.setFromEuler(this.euler);
    this.group.scale.setScalar(scale);
    this.offset.set(0, parts.height / 2, 0).applyQuaternion(this.group.quaternion).multiplyScalar(scale);
    this.group.position.set(x - this.offset.x, y - this.offset.y, z - this.offset.z);
  }

  /** Back to the single can at once (leaving the product page). */
  reset() {
    this.mixMode = false;
    this.mixMoving = false;
    this.slotShown.fill(-1);
    this.slotT.fill(0);
    this.wrapT = 0;
    this.shown = 1;
    this.heroPresence = 1;
    this.progress = 0;
    this.appliedProgress = -1;
    if (this.current) this.current.root.visible = false;
    this.current = null;
    this.setCanCount(0);
    this.group.visible = false;
  }

  private show(count: number) {
    if (this.current) this.current.root.visible = false;
    this.shown = count;
    this.progress = 0;
    this.appliedProgress = -1;
    if (count === 1) {
      this.current = null;
      this.setCanCount(0);
      return;
    }
    let parts = this.parts.get(count);
    if (!parts) {
      parts = this.build(count);
      this.parts.set(count, parts);
      this.group.add(parts.root);
    }
    this.current = parts;
    parts.root.visible = true;
    this.setCanCount(parts.cols * parts.rows);
    this.printKey = '';
    this.refreshPrints();
  }

  private setCanCount(count: number) {
    if (count === 0) this.shells.forEach((shell) => shell && (shell.count = 0));
    this.top.count = count;
    this.bottom.count = count;
    this.tab.count = count;
  }

  /** Lays out every part of the shown pack at assembly progress t (0 = nothing, 1 = packed). */
  private apply(t: number) {
    const parts = this.current;
    if (!parts) return;
    this.appliedProgress = t;
    const { cols, rows, kind } = parts;
    const total = cols * rows;
    const isTray = kind === 'tray';
    const floor = isTray ? TRAY_FLOOR : 0;
    // cans drop back row first, left to right, so the front row lands last and in front
    const dropStart = isTray ? 0.24 : 0.02;
    const dropSpan = isTray ? 0.44 : 0.48;
    this.beginCans();
    for (let k = 0; k < total; k += 1) {
      const row = Math.floor(k / cols);
      const col = k % cols;
      const start = dropStart + (total > 1 ? (dropSpan * k) / (total - 1) : 0);
      const c = clamp01((t - start) / 0.2);
      const x = (col - (cols - 1) / 2) * PITCH;
      const z = (row - (rows - 1) / 2) * PITCH;
      const jitter = hash(k + total * 7) - 0.5;
      // front faces toward the viewer, each can a little off square like a real pack
      this.euler.set((1 - c) * 0.25 * jitter, -0.35 + 0.55 + jitter * 0.6, (1 - c) * 0.35 * jitter, 'XYZ');
      this.quaternion.setFromEuler(this.euler);
      this.position.set(x, floor + CAN_FOOT + (1 - landing(c)) * 5.5, z);
      this.scale.setScalar(1);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.writeCan(k, c > 0 ? this.productFlavor : -1, this.matrix);
    }
    this.endCans(total);
    this.layoutPack(parts, t, clamp01((t - 0.6) / 0.4));
  }

  /**
   * Tray, film, clip and shadow. `t` is the tray's own timeline (slide in by 0.12, walls up by 0.24); `close` runs
   * the closing: the clip presses down, the film drops over and shrinks tight.
   */
  private layoutPack(parts: PackParts, t: number, close: number) {
    const isTray = parts.kind === 'tray';
    if (parts.tray) {
      // the blank slides in on the line, then the walls fold up
      const slide = easeOut(clamp01(t / 0.12));
      parts.tray.blank.position.x = (1 - slide) * -14;
      parts.tray.blank.visible = t > 0;
      const fold = smooth(clamp01((t - 0.1) / 0.14));
      const flat = (1 - fold) * (Math.PI / 2);
      const [front, back, right, left] = parts.tray.walls;
      front.rotation.x = flat;
      back.rotation.x = -flat;
      right.rotation.z = -flat;
      left.rotation.z = flat;
    }
    if (parts.film && parts.filmUniform) {
      // the film drops over the pack loose and heat-shrinks tight
      const f = clamp01((close - 0.35) / 0.65);
      parts.film.visible = f > 0;
      const shrink = 1 - easeOut(f);
      parts.film.scale.set(1 + 0.16 * shrink, 1 + 0.1 * shrink, 1 + 0.2 * shrink);
      parts.film.position.y = shrink * 0.5;
      parts.filmUniform.value = smooth(f);
    }
    if (parts.clip) {
      // the clip is pressed down onto the lids once the six are standing
      const p = clamp01(close / 0.8);
      parts.clip.visible = p > 0;
      const settle = p < 1 ? 1 - easeOut(p) : 0;
      parts.clip.position.y = NECK_Y + CAN_FOOT + settle * 2.4;
    }
    const shadowMaterial = parts.shadow.material as THREE.MeshBasicMaterial;
    shadowMaterial.opacity = 0.62 * smooth(clamp01(isTray ? t / 0.2 : this.mixMode ? 1 : t / 0.5));
  }

  // ───────────────────────── building ─────────────────────────

  private build(count: number): PackParts {
    const cols = count >= 24 ? 6 : count >= 12 ? 4 : 3;
    const rows = count >= 24 ? 4 : count >= 12 ? 3 : 2;
    const kind: PackKind = count >= 12 ? 'tray' : 'clip';
    const halfX = (cols * PITCH) / 2;
    const halfZ = (rows * PITCH) / 2;
    const root = new THREE.Group();
    root.visible = false;
    const disposables: Array<{ dispose: () => void }> = [];
    const parts: PackParts = {
      count,
      cols,
      rows,
      kind,
      duration: count >= 24 ? 2.3 : count >= 12 ? 1.9 : 1.35,
      root,
      shadow: null as unknown as THREE.Mesh,
      height: CAN_HEIGHT + (kind === 'tray' ? TRAY_FLOOR + 0.04 : 0),
      fitWidth: 1,
      fitHeight: 1,
      disposables,
    };

    if (kind === 'tray') {
      const trayX = halfX + 0.05;
      const trayZ = halfZ + 0.05;
      const longPrint = createPrintTexture(2 * trayX, TRAY_WALL);
      const shortPrint = createPrintTexture(2 * trayZ, TRAY_WALL);
      const board = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.82, metalness: 0 });
      const kraft = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.95, metalness: 0 });
      const longMat = new THREE.MeshStandardMaterial({ map: longPrint.texture, roughness: 0.62, metalness: 0 });
      const shortMat = new THREE.MeshStandardMaterial({ map: shortPrint.texture, roughness: 0.62, metalness: 0 });
      longPrint.texture.userData.print = { canvas: longPrint.canvas, side: 'long', count };
      shortPrint.texture.userData.print = { canvas: shortPrint.canvas, side: 'short', count };
      disposables.push(longPrint.texture, shortPrint.texture, board, kraft, longMat, shortMat);

      const blank = new THREE.Group();
      const floorGeometry = new THREE.BoxGeometry(2 * trayX, TRAY_FLOOR, 2 * trayZ);
      const floor = new THREE.Mesh(floorGeometry, [kraft, kraft, board, board, kraft, kraft]);
      floor.position.y = TRAY_FLOOR / 2;
      blank.add(floor);
      const longGeometry = new THREE.BoxGeometry(2 * trayX, TRAY_WALL, BOARD);
      const shortGeometry = new THREE.BoxGeometry(BOARD, TRAY_WALL, 2 * trayZ - 2 * BOARD);
      disposables.push(floorGeometry, longGeometry, shortGeometry);
      // box face order: +x, -x, +y, -y, +z, -z; the print faces out, the cut top edge shows the kraft core
      const wall = (geometry: THREE.BoxGeometry, materials: THREE.Material[], px: number, pz: number, mx: number, mz: number) => {
        const pivot = new THREE.Group();
        pivot.position.set(px, TRAY_FLOOR, pz);
        const mesh = new THREE.Mesh(geometry, materials);
        mesh.position.set(mx, TRAY_WALL / 2, mz);
        pivot.add(mesh);
        blank.add(pivot);
        return pivot;
      };
      const walls = [
        wall(longGeometry, [board, board, kraft, kraft, longMat, board], 0, trayZ, 0, -BOARD / 2),
        wall(longGeometry, [board, board, kraft, kraft, board, longMat], 0, -trayZ, 0, BOARD / 2),
        wall(shortGeometry, [shortMat, board, kraft, kraft, kraft, kraft], trayX, 0, -BOARD / 2, 0),
        wall(shortGeometry, [board, shortMat, kraft, kraft, kraft, kraft], -trayX, 0, BOARD / 2, 0),
      ];
      root.add(blank);
      parts.tray = { blank, walls };

      const filmGeometry = createFilmGeometry(halfX, halfZ, cols, rows, parts.height);
      const filmUniform = { value: 0 };
      const filmMaterial = createFilmMaterial(this.wrinkles, filmUniform, this.isLowPower);
      disposables.push(filmGeometry, filmMaterial);
      const film = new THREE.Mesh(filmGeometry, filmMaterial);
      film.renderOrder = 10; // after the cans and tray it wraps
      root.add(film);
      parts.film = film;
      parts.filmUniform = filmUniform;
    } else {
      const clip = createClipGeometry(cols, rows);
      const clipPrint = createPrintTexture(clip.width, clip.depth);
      clipPrint.texture.userData.print = { canvas: clipPrint.canvas, side: 'clip', count };
      // ExtrudeGeometry's caps take the shape's own coordinates as UVs: map the board's extent onto the print
      clipPrint.texture.repeat.set(1 / clip.width, 1 / clip.depth);
      clipPrint.texture.offset.set(0.5, 0.5);
      const printMat = new THREE.MeshStandardMaterial({ map: clipPrint.texture, roughness: 0.55, metalness: 0 });
      const edgeMat = new THREE.MeshStandardMaterial({ color: 0x6f5639, roughness: 0.95, metalness: 0 });
      disposables.push(clip.geometry, clipPrint.texture, printMat, edgeMat);
      const mesh = new THREE.Mesh(clip.geometry, [printMat, edgeMat]);
      root.add(mesh);
      parts.clip = mesh;
    }

    // soft contact shadow on the floor under the pack
    const shadowTexture = createShadowTexture();
    const shadowGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, map: shadowTexture, transparent: true, opacity: 0, depthWrite: false });
    disposables.push(shadowTexture, shadowGeometry, shadowMaterial);
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.scale.set(2 * halfX + 1.6, 1, 2 * halfZ + 1.6);
    shadow.position.y = 0.004;
    shadow.renderOrder = -1;
    root.add(shadow);
    parts.shadow = shadow;

    // projected size of the pack's box at the base view, for fitting it into the stage
    this.euler.set(BASE_PITCH, BASE_YAW, 0, 'XYZ');
    const m = this.matrix.makeRotationFromEuler(this.euler).elements;
    const hx = halfX + 0.1;
    const hy = parts.height / 2;
    const hz = halfZ + 0.1;
    parts.fitWidth = 2 * (Math.abs(m[0]) * hx + Math.abs(m[4]) * hy + Math.abs(m[8]) * hz);
    parts.fitHeight = 2 * (Math.abs(m[1]) * hx + Math.abs(m[5]) * hy + Math.abs(m[9]) * hz);
    return parts;
  }

  /** Redraws the shown pack's prints when the flavor (or the brand font) changes. */
  private refreshPrints() {
    const parts = this.current;
    if (!parts) return;
    const key = `${parts.count}:${this.accent}:${this.flavorName}:${this.fontsReady}`;
    if (key === this.printKey) return;
    this.printKey = key;
    parts.disposables.forEach((item) => {
      const texture = item as THREE.Texture;
      const print = texture.isTexture ? (texture.userData.print as PrintInfo | undefined) : undefined;
      if (!print) return;
      drawPrint(print, this.accent, this.flavorName);
      texture.needsUpdate = true;
    });
  }

  dispose() {
    this.disposed = true;
    this.group.removeFromParent();
    this.parts.forEach((parts) => parts.disposables.forEach((item) => item.dispose()));
    this.parts.clear();
    [this.top, this.bottom, this.tab].forEach((mesh) => mesh.dispose());
    this.shells.forEach((shell) => {
      if (!shell) return;
      shell.dispose();
      (shell.material as THREE.Material).dispose();
    });
    this.placeholder.dispose();
    this.metalMaterial.dispose();
    this.baseMaterial.dispose();
    this.wrinkles.dispose();
  }
}

// ───────────────────────── prints ─────────────────────────

interface PrintInfo {
  canvas: HTMLCanvasElement;
  side: 'long' | 'short' | 'clip';
  count: number;
}

/** A canvas at the board's aspect ratio (world width × height), at about 220 px per world unit. */
function createPrintTexture(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(2048, Math.round(width * 220));
  canvas.height = Math.max(64, Math.round((canvas.width * height) / width));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, texture };
}

/** Matte black board, white wordmark, the flavor in its own colour, a thin accent band: the case print. */
function drawPrint(print: PrintInfo, accent: string, flavorName: string) {
  const { canvas, side, count } = print;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#0c0c0e';
  ctx.fillRect(0, 0, w, h);
  // faint board grain
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1);
  }
  ctx.globalAlpha = 1;
  const display = "'Libre Franklin', 'Arial Black', Arial, sans-serif";
  const mono = "'Geist Mono', ui-monospace, monospace";
  const spaced = (text: string, x: number, y: number, spacing: number, align: 'left' | 'center' | 'right') => {
    const chars = text.split('');
    const widths = chars.map((char) => ctx.measureText(char).width);
    const total = widths.reduce((sum, value) => sum + value, 0) + spacing * (chars.length - 1);
    let cursor = align === 'left' ? x : align === 'center' ? x - total / 2 : x - total;
    ctx.textAlign = 'left';
    chars.forEach((char, i) => {
      ctx.fillText(char, cursor, y);
      cursor += widths[i] + spacing;
    });
  };
  ctx.textBaseline = 'middle';
  const packLine = `${count} × 250 ML`;

  if (side === 'clip') {
    // the board is seen from above: print along the front and back margins, outside the can holes
    const band = h * 0.075;
    ctx.fillStyle = accent;
    ctx.fillRect(0, h - band * 0.45, w, band * 0.45);
    ctx.fillRect(0, 0, w, band * 0.3);
    ctx.fillStyle = '#f4f4f2';
    ctx.font = `italic 900 ${Math.round(band * 0.78)}px ${display}`;
    spaced('GRIZZLY', w * 0.06, h - band * 1.1, band * 0.16, 'left');
    ctx.fillStyle = accent;
    ctx.font = `italic 700 ${Math.round(band * 0.62)}px ${display}`;
    spaced(flavorName.toUpperCase(), w / 2, h - band * 1.1, band * 0.12, 'center');
    ctx.fillStyle = 'rgba(244,244,242,0.75)';
    ctx.font = `500 ${Math.round(band * 0.52)}px ${mono}`;
    spaced(packLine, w * 0.94, h - band * 1.1, band * 0.08, 'right');
    ctx.save();
    ctx.translate(w / 2, band * 1.05);
    ctx.rotate(Math.PI); // the back margin reads from the far side
    ctx.fillStyle = 'rgba(244,244,242,0.8)';
    ctx.font = `italic 900 ${Math.round(band * 0.7)}px ${display}`;
    spaced('GRIZZLY ENERGY', 0, 0, band * 0.2, 'center');
    ctx.restore();
    return;
  }

  // tray walls: accent band at the foot, wordmark left, flavor centre, pack size right
  ctx.fillStyle = accent;
  ctx.fillRect(0, h * 0.86, w, h * 0.14);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, h * 0.06, w, Math.max(1, h * 0.012));
  if (side === 'long') {
    // type sized to the shorter of the wall's height and length, so the 12-tray's shorter side doesn't crowd
    const unit = Math.min(h, w * 0.105);
    ctx.fillStyle = '#f4f4f2';
    ctx.font = `italic 900 ${Math.round(unit * 0.4)}px ${display}`;
    spaced('GRIZZLY', w * 0.035, h * 0.47, unit * 0.07, 'left');
    ctx.fillStyle = accent;
    ctx.font = `italic 700 ${Math.round(unit * 0.2)}px ${display}`;
    spaced(flavorName.toUpperCase(), w * 0.56, h * 0.47, unit * 0.04, 'center');
    ctx.fillStyle = 'rgba(244,244,242,0.8)';
    ctx.font = `500 ${Math.round(unit * 0.17)}px ${mono}`;
    spaced(packLine, w * 0.965, h * 0.47, unit * 0.02, 'right');
  } else {
    ctx.fillStyle = '#f4f4f2';
    ctx.font = `italic 900 ${Math.round(h * 0.34)}px ${display}`;
    spaced('GRIZZLY', w / 2, h * 0.4, h * 0.05, 'center');
    ctx.fillStyle = accent;
    ctx.font = `600 ${Math.round(h * 0.15)}px ${mono}`;
    spaced(packLine, w / 2, h * 0.68, h * 0.02, 'center');
  }
}

function createShadowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // a blurred rounded block (drawn off-canvas, only its shadow lands): dense under the pack, soft at the edges
    ctx.shadowColor = 'rgba(0,0,0,1)';
    ctx.shadowBlur = size * 0.16;
    ctx.shadowOffsetX = size * 4;
    ctx.fillStyle = '#000';
    ctx.fillRect(size * 0.18 - size * 4, size * 0.18, size * 0.64, size * 0.64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ───────────────────────── geometry ─────────────────────────

/**
 * Paperboard top clip for six cans: the board covers the lids, a hole for each can's neck (the lid and tab show
 * through) and two finger holes where four cans meet. Thickness along +Y, centred on the pack.
 */
function createClipGeometry(cols: number, rows: number) {
  const width = cols * PITCH + 0.3;
  const depth = rows * PITCH + 0.6;
  const shape = new THREE.Shape();
  const r = 0.45;
  const hw = width / 2;
  const hd = depth / 2;
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const hole = new THREE.Path();
      hole.absellipse((col - (cols - 1) / 2) * PITCH, (row - (rows - 1) / 2) * PITCH, 0.64, 0.64, 0, Math.PI * 2, true, 0);
      shape.holes.push(hole);
    }
  }
  for (let col = 0; col < cols - 1; col += 1) {
    const finger = new THREE.Path();
    finger.absellipse((col + 0.5 - (cols - 1) / 2) * PITCH, 0, 0.2, 0.13, 0, Math.PI * 2, true, 0);
    shape.holes.push(finger);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.045,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 1,
    curveSegments: 40,
  });
  // built in XY: lay it flat (thickness along +Y)
  geometry.rotateX(-Math.PI / 2);
  return { geometry, width, depth };
}

/**
 * Shrink film around a tray of cans. A tube along X with a rounded-rectangle section hugs the pack (dipping a
 * little between the cans on the sides and top, as heat-shrunk film does), and each end closes into a pleated
 * collar round an oval opening: the bullseye. `aEdge` marks the rolled lip of each opening, which reads milky.
 */
function createFilmGeometry(halfX: number, halfZ: number, cols: number, rows: number, height: number) {
  const endX = halfX + 0.05;
  const sideZ = halfZ + 0.06;
  const yBottom = -0.02;
  const yTop = height + 0.03;
  const rTop = 0.42;
  const rBottom = 0.12;

  // section outline in (z, y), counter-clockwise from the +z side, sampled about every 0.1 units
  const outline: Array<{ z: number; y: number; nz: number; ny: number; s: number }> = [];
  const push = (z: number, y: number, nz: number, ny: number) => {
    const last = outline[outline.length - 1];
    const s = last ? last.s + Math.hypot(z - last.z, y - last.y) : 0;
    outline.push({ z, y, nz, ny, s });
  };
  const line = (z0: number, y0: number, z1: number, y1: number, nz: number, ny: number) => {
    const steps = Math.max(2, Math.ceil(Math.hypot(z1 - z0, y1 - y0) / 0.1));
    for (let i = 0; i < steps; i += 1) push(z0 + ((z1 - z0) * i) / steps, y0 + ((y1 - y0) * i) / steps, nz, ny);
  };
  const arc = (cz: number, cy: number, r: number, a0: number) => {
    const steps = 8;
    for (let i = 0; i < steps; i += 1) {
      const a = a0 + ((Math.PI / 2) * i) / steps;
      push(cz + Math.cos(a) * r, cy + Math.sin(a) * r, Math.cos(a), Math.sin(a));
    }
  };
  line(sideZ, yBottom + rBottom, sideZ, yTop - rTop, 1, 0);
  arc(sideZ - rTop, yTop - rTop, rTop, 0);
  line(sideZ - rTop, yTop, -sideZ + rTop, yTop, 0, 1);
  arc(-sideZ + rTop, yTop - rTop, rTop, Math.PI / 2);
  line(-sideZ, yTop - rTop, -sideZ, yBottom + rBottom, -1, 0);
  arc(-sideZ + rBottom, yBottom + rBottom, rBottom, Math.PI);
  line(-sideZ + rBottom, yBottom, sideZ - rBottom, yBottom, 0, -1);
  arc(sideZ - rBottom, yBottom + rBottom, rBottom, Math.PI * 1.5);
  const perimeter = outline[outline.length - 1].s + Math.hypot(outline[0].z - outline[outline.length - 1].z, outline[0].y - outline[outline.length - 1].y);
  const around = outline.length;

  // film pulled into the gaps between cans (1 where two cans meet, 0 over a can's middle)
  const dip = (p: number, half: number) => (0.5 + 0.5 * Math.cos((2 * Math.PI * (p + half)) / PITCH)) ** 4;
  const aboveWall = (y: number) => smooth(clamp01((y - TRAY_WALL - 0.1) / 0.5)) * (1 - smooth(clamp01((y - (yTop - 0.7)) / 0.5)));
  const filmPoint = (x: number, j: number, out: THREE.Vector3) => {
    const o = outline[j];
    const side = smooth(clamp01((Math.abs(o.nz) - 0.5) / 0.4));
    const topFace = smooth(clamp01((o.ny - 0.5) / 0.4));
    const inward = side * 0.16 * dip(x, halfX) * aboveWall(o.y) + topFace * 0.07 * Math.max(dip(x, halfX), dip(o.z, halfZ));
    // a little slack: film never lies perfectly flat
    const slack = 0.012 * Math.sin(x * 3.1 + o.s * 2.3) * Math.sin(o.s * 4.7 - x * 1.3);
    out.set(x, o.y - o.ny * (inward - slack), o.z - o.nz * (inward - slack));
    return out;
  };

  const positions: number[] = [];
  const uvs: number[] = [];
  const edges: number[] = [];
  const indices: number[] = [];
  const point = new THREE.Vector3();
  const rim = new THREE.Vector3();

  // tube
  const along = Math.max(24, Math.round((2 * endX) / 0.1));
  for (let i = 0; i <= along; i += 1) {
    const x = -endX + (2 * endX * i) / along;
    for (let j = 0; j <= around; j += 1) {
      filmPoint(x, j % around, point);
      positions.push(point.x, point.y, point.z);
      uvs.push(((x + endX) / (2 * endX)) * cols * 0.8, ((j === around ? perimeter : outline[j].s) / perimeter) * 5);
      edges.push(0);
    }
  }
  for (let i = 0; i < along; i += 1) {
    for (let j = 0; j < around; j += 1) {
      const a = i * (around + 1) + j;
      const b = a + around + 1;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }

  // bullseye ends
  const centreY = height * 0.52;
  const holeZ = sideZ * 0.6;
  const holeY = height * 0.34;
  const steps = 12;
  [-1, 1].forEach((sign) => {
    const start = positions.length / 3;
    for (let w = 0; w <= steps; w += 1) {
      const t = w / steps;
      for (let j = 0; j <= around; j += 1) {
        const jj = j % around;
        const o = outline[jj];
        filmPoint(sign * endX, jj, rim);
        const angle = Math.atan2((o.y - centreY) / (height / 2), o.z / sideZ);
        const hz = Math.cos(angle) * holeZ;
        const hy = centreY + Math.sin(angle) * holeY;
        const e = easeOut(t);
        // pleats gather at the corners, where the film had the most slack to shrink
        const corner = clamp01(4 * Math.abs(o.nz * o.ny));
        const pleat = (0.025 + 0.08 * corner) * Math.sin(Math.PI * t) * Math.sin((2 * Math.PI * o.s) / 0.42 + hash(jj) * 0.6);
        const x = sign * (endX + 0.035 * Math.sin(Math.PI * t) - 0.13 * t * t + pleat);
        positions.push(x, rim.y + (hy - rim.y) * e, rim.z + (hz - rim.z) * e);
        uvs.push(((j === around ? perimeter : o.s) / perimeter) * 5, t * 1.5);
        edges.push(smooth(clamp01((t - 0.72) / 0.28)));
      }
    }
    for (let w = 0; w < steps; w += 1) {
      for (let j = 0; j < around; j += 1) {
        const a = start + w * (around + 1) + j;
        const b = a + around + 1;
        // (w outward → inward) × (around) faces +x: keep that order on the +x end, flip it on the -x end
        if (sign > 0) indices.push(a, b, b + 1, a, b + 1, a + 1);
        else indices.push(a, b + 1, b, a, a + 1, b + 1);
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aEdge', new THREE.Float32BufferAttribute(edges, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Clear shrink film: almost invisible face-on, silvery at grazing angles, and crisp wherever it catches the studio
 * lights (the wrinkle normal map breaks those reflections into the streaks real film shows). Alpha comes from the
 * fresnel term and the reflected light, so only the highlights and edges cover the cans.
 */
function createFilmMaterial(wrinkles: THREE.Texture, opacity: { value: number }, isLowPower: boolean) {
  const params = {
    color: 0x0e0f11,
    metalness: 0,
    roughness: 0.14,
    normalMap: wrinkles,
    normalScale: new THREE.Vector2(0.6, 0.6),
    envMapIntensity: 1.7,
    transparent: true,
    depthWrite: false,
  };
  const material = isLowPower ? new THREE.MeshStandardMaterial(params) : new THREE.MeshPhysicalMaterial({ ...params, specularIntensity: 1 });
  material.customProgramCacheKey = () => 'gz-shrink-film';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFilm = opacity;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEdge;\nvarying float vEdge;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFilm;\nvarying float vEdge;')
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 gzView = normalize(vViewPosition);
          float gzFacing = saturate(dot(normal, gzView));
          float gzFresnel = pow(1.0 - gzFacing, 3.0);
          // the studio's softboxes mirrored in the film: a tall strip up left and a broad panel overhead. Through the
          // crinkle normals they break into the bright streaks that make shrink film read as film.
          vec3 gzRay = reflect(-gzView, normal);
          float gzStrip = smoothstep(0.2, 0.02, abs(gzRay.x + 0.42)) * smoothstep(-0.25, 0.35, gzRay.y);
          float gzPanel = smoothstep(0.5, 0.88, gzRay.y);
          float gzKey = gzStrip + 0.32 * gzPanel;
          outgoingLight += vec3(0.95, 0.97, 1.0) * gzKey * 0.85;
          float gzSpec = max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b));
          // milky where the film is seen edge-on and along the rolled lip of each opening
          outgoingLight += vec3(0.62, 0.64, 0.68) * (0.05 + 0.1 * gzFresnel + 0.16 * vEdge);
          diffuseColor.a = clamp(0.07 + 0.6 * gzFresnel + 0.7 * smoothstep(0.08, 0.6, gzSpec) + 0.36 * vEdge, 0.0, 0.9) * uFilm;
        }
        #include <opaque_fragment>`
      );
  };
  return material;
}

/**
 * Tangent-space normals for crinkled film: long, thin creases running mostly along the pack (the way film
 * shrinks), over fine crumple. Generated once (256²) and shared by every film.
 */
function createWrinkleNormals() {
  const size = 256;
  const heights = new Float32Array(size * size);
  let seed = 41;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const wrapIndex = (x: number, y: number) => (((y % size) + size) % size) * size + (((x % size) + size) % size);
  for (let i = 0; i < 260; i += 1) {
    const cx = rand() * size;
    const cy = rand() * size;
    const length = 18 + rand() * 80;
    const angle = (rand() - 0.5) * 0.9 + (rand() < 0.25 ? Math.PI / 2 : 0);
    const width = 0.8 + rand() * 2.4;
    const amp = (rand() - 0.5) * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    for (let s = -length / 2; s <= length / 2; s += 1) {
      const taper = 1 - (2 * Math.abs(s)) / length;
      const px = cx + dx * s;
      const py = cy + dy * s;
      for (let o = -4; o <= 4; o += 1) {
        const weight = Math.exp(-(o * o) / (2 * width * width)) * taper * amp;
        heights[wrapIndex(Math.round(px - dy * o), Math.round(py + dx * o))] += weight;
      }
    }
  }
  for (let i = 0; i < heights.length; i += 1) heights[i] += (rand() - 0.5) * 0.35;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = -(heights[wrapIndex(x + 1, y)] - heights[wrapIndex(x - 1, y)]) * 0.9;
      const ny = -(heights[wrapIndex(x, y + 1)] - heights[wrapIndex(x, y - 1)]) * 0.9;
      const length = Math.hypot(nx, ny, 1);
      const k = (y * size + x) * 4;
      data[k] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      data[k + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      data[k + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      data[k + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
