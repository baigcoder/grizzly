import * as THREE from 'three';
import { FLAVORS } from '../data/flavors';
import { LABEL } from '../data/brand';
import { audioManager } from '../audio/audioManager';
import { createCanMesh, disposeCanMaterials, getCanSurface, setCanFocus, setCanAccent } from './canModel';
import { disposeCanGeometry } from './canGeometry';
import { LabelTextures } from './labelTextures';
import { createStudioEnvironment } from './studioEnv';
import { Stage, type StageParams } from './stage';
import { PostFx } from './post';
import { FloorReflections } from './reflections';
import { Scene3DData } from '../types';
import { CAROUSEL_CONFIG } from './sceneManagerConfig';
import { SCENE_SEQUENCE, SCENE_STATES, SceneMode, SceneStateConfig } from './sceneStates';
import type { SceneMoment } from './moments/types';
import { FlavorLetters } from './moments/flavorLetters';
import { RoarMoment } from './moments/roar';
import { GhostText } from './moments/ghostText';
import { ZamzamPool } from './moments/zamzamPool';
import { moonPhase, twilight } from './liveSky';
import { CanCrack } from './moments/canCrack';
import { PackDisplay } from './packDisplay';
import { CAN } from './canDimensions';
import { MOTION_RATE, damp } from './motionVocabulary';
import { SCENE_COLOR } from './palette';

export { CAROUSEL_CONFIG };
export type { SceneMode, SceneStateConfig };

/** UV rects (u0, v0, u1, v1) of the four benefit blocks on the label's side panel (grizzly.json). */
const BENEFIT_GLOW_RECTS = LABEL.benefitBlocks.map(([u0, v0, u1, v1]) => new THREE.Vector4(u0, v0, u1, v1));

/** Product page framing (same lens as the home scene). */
const PRODUCT_CAMERA = { x: 0, y: 0, z: 29, fov: 20 };
// Whole can in the left column, lid to base with breathing room; a gentle, premium lean.
// (x is recomputed per frame from the aspect, so the can sits in the middle of the stage column at any width)
// rotY −0.35: the label's front art (u ≈ 0.556) faces the camera, as in the hero (+0.3 showed the nutrition side)
const PRODUCT_POSE = { x: -3.3, y: 0.3, z: 0, scale: 1.7, rotX: 0.08, rotY: -0.35, rotZ: 0.11 };
/** Where the can's centre sits across the frame on wide screens (0 left edge, 1 right edge): the stage column's middle,
 * nudged right of the labelled hotspots. */
const PRODUCT_STAGE_CENTRE = 0.37;
const PRODUCT_POSE_NARROW = { x: 0, y: 1.6, z: 0, scale: 1.1, rotX: 0.08, rotY: -0.35, rotZ: 0.14 };

const CAN_COUNT = 12;
/**
 * On-screen height of the tilted desktop hero can per unit of scale, in world units (lid to base with its lean and the
 * step toward the camera). Was 5.0, which left about a sixth of the space between the header and the title unused.
 */
const HERO_CAN_SPAN = 4.55;
const wrap = (value: number, min: number, max: number) => {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
};
const smooth = (t: number) => t * t * (3 - 2 * t);

export type QualityLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export class SceneManager {
  public currentMode: SceneMode = 'hero-carousel';
  public canvas: HTMLCanvasElement;
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;

  public cans: THREE.Group[] = [];
  public keyLight!: THREE.DirectionalLight;
  public rimLight!: THREE.DirectionalLight;
  public fillLight!: THREE.DirectionalLight;
  public hemiLight!: THREE.HemisphereLight;
  /** Lights the domed can bottoms seen in the hero ring; dimmed elsewhere so the base rim never glares. */
  private baseFill!: THREE.DirectionalLight;
  /** One-off strobe (the roar, flavor glint). */
  public flashLight!: THREE.DirectionalLight;

  private labels!: LabelTextures;
  private stage!: Stage;
  private post: PostFx | null = null;
  private reflections: FloorReflections | null = null;
  public moments: SceneMoment[] = [];
  private roarMoment!: RoarMoment;

  /** Stage parameters, rewritten every frame; moments may add to them before rendering. */
  public readonly stageParams: StageParams = {
    time: 0,
    aspect: 1,
    horizon: 0.4,
    camX: 0,
    camY: 0,
    scroll: 0,
    accent: new THREE.Color(),
    accentPrev: new THREE.Color(),
    wipe: 1,
    wipeOrigin: new THREE.Vector2(0.5, 0.5),
    moon: 1,
    field: 0,
    studio: 0,
    moonPhase: 0.5,
    dawn: 0,
    dusk: 0,
    mountains: 1,
    mist: 1,
    mistFg: 0.6,
    burst: 0,
    burstPos: new THREE.Vector2(0.5, 0.5),
    water: 0,
    flash: 0,
    glow: 1,
    glowPos: new THREE.Vector2(0.5, 0.4),
    stars: 1,
  };
  /** Camera offsets added by moments (shake, push) after the timeline pose. */
  public readonly cameraOffset = new THREE.Vector3();
  public cameraRollOffset = 0;
  /** Per-frame pose offsets for the featured can, added by moments and the pick-up (reset every frame). */
  public readonly featuredOffset = { rotX: 0, posY: 0, posZ: 0, scale: 1 };
  /** Per-frame effects set by moments (reset to zero at the start of every frame). */
  public readonly fx = { flash: 0, burst: 0, water: 0, burstPos: new THREE.Vector2(0.5, 0.5) };
  /**
   * A moment may take over one can's pose: `blend` mixes the layout pose toward this pose
   * (position, Euler rotation, uniform scale). Used by the opening to hold the can close to the camera.
   */
  public readonly canOverride = { index: -1, blend: 0, position: new THREE.Vector3(), rotation: new THREE.Euler(), scale: 1 };
  private readonly overrideEuler = new THREE.Euler();

  // Pointer position projected to world space at z=0 (hover proximity)
  private pointerLightTarget = { x: 0, y: 0, z: 4 };

  // Benefit label glow (one block at a time, damped in the render loop)
  private benefitGlowIndex = -1;
  private benefitGlowStrength = 0;
  private readonly glowColor = new THREE.Color();
  private readonly rimBase = new THREE.Color(SCENE_COLOR.rim);
  private readonly rimTint = new THREE.Color();

  // Per-can hover proximity state (smooth damped, outside React render)
  private canHoverInfluence: Float32Array = new Float32Array(0);
  private canIdlePhase: Float32Array = new Float32Array(0);
  private lastHoverAudioTime = 0;
  private lastHoveredCanIndex = -1;

  // Direct canvas pointer interaction & raycasting
  public onHeroCanClicked?: () => void;
  private raycaster = new THREE.Raycaster();
  private pointerNDC = new THREE.Vector2();
  private isPointerDown = false;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private lastDragX = 0;
  private lastDragY = 0;
  private lastDragTime = 0;
  /** Smoothed drag speed (px per ms), for the fling on release. */
  private dragVelocityX = 0;
  private dragVelocityY = 0;
  /** Pick-up: a press-and-hold on the centre hero can lifts it out of the ring to be turned freely. */
  private pickTimer = -1;
  private picked = false;
  private pickBlend = 0;
  private pressedCan = -1;
  private crack!: CanCrack;

  // State
  public isLowPower = false;
  public quality: QualityLevel = 'HIGH';
  public contextLost = false;
  public isRunning = true;
  private reqId: number | null = null;
  private lastTime = 0;
  private carouselVelocity = 0;
  private pixelRatioCap = 1.5;

  public carousel = {
    spacing: CAROUSEL_CONFIG.spacing,
    target: 0,
    position: 0,
    index: 0,
    lastIndex: 0,
    getRounded: () => Math.round(this.carousel.target / this.carousel.spacing) * this.carousel.spacing,
    getIndex: (wrapped = true) => {
      const idx = Math.round(this.carousel.position / this.carousel.spacing);
      if (wrapped) {
        const count = FLAVORS.length;
        return ((idx % count) + count) % count;
      }
      return idx;
    },
    goTo: (index: number) => {
      const count = FLAVORS.length;
      const current = Math.round(this.carousel.target / this.carousel.spacing);
      const currentWrapped = ((current % count) + count) % count;
      let delta = ((index % count) + count) % count - currentWrapped;
      if (delta > count / 2) delta -= count;
      if (delta < -count / 2) delta += count;
      this.carousel.target = (current + delta) * this.carousel.spacing;
    },
    previous: () => {
      this.carousel.target -= this.carousel.spacing;
    },
    next: () => {
      this.carousel.target += this.carousel.spacing;
    },
    listeners: new Set<(e: { index: number; previous: number }) => void>(),
    onChanged: (cb: (e: { index: number; previous: number }) => void) => {
      this.carousel.listeners.add(cb);
      return () => this.carousel.listeners.delete(cb);
    },
  };

  public pointer = { x: 0, y: 0, smoothX: 0, smoothY: 0 };
  private readonly windVector = new THREE.Vector2();

  /** Pointer offset from the screen centre as a gentle wind (world units); zero for reduced motion. */
  public pointerWind(): THREE.Vector2 {
    if (this.reducedMotion) return this.windVector.set(0, 0);
    return this.windVector.set(this.pointer.smoothX / Math.max(window.innerWidth, 1), -this.pointer.smoothY / Math.max(window.innerHeight, 1));
  }

  /**
   * The master timeline tweens `timelineData`; every frame it is copied into `data`, which moments
   * may adjust for that frame only (so a moment never leaves residue in the timeline).
   */
  private timelineData!: Scene3DData;
  public data: Scene3DData = {
    camPosX: 0, camPosY: 0, camPosZ: 29, camRotX: 0, camRotY: 0, camRotZ: 0, fov: 20,
    canScale: 1.2, canPosX: 0, canPosY: 0, canPosZ: 0, canRotX: 0, canRotY: 0, canRotZ: 0, canSpin: 0,
    spacing: 1, wave: 1, swirl: 0, pointerInfluence: 0.15, labelDim: 0,
    floorY: -3.6, reflect: 1, mountains: 1, moon: 1, mistFg: 0.6, glow: 1, stars: 1, field: 0, studio: 0,
  };

  public routeMode: 'HOME' | 'PRODUCT' | 'PAGE' | 'MIX' = 'HOME';
  public activeProductIndex = 0;
  private productScroll = 0;
  /** Narrow product pose fitted to the measured DOM stage (null until measured, and on wide screens). */
  private narrowPose: typeof PRODUCT_POSE_NARROW | null = null;
  private readonly widePose = { ...PRODUCT_POSE };
  /** 0..1 as the product page reaches its end: the pinned can lifts away clear of the footer. */
  private productExit = 0;
  /** Frames drawn since the narrow product stage scrolled out of view (a few, to settle, then the canvas holds). */
  private offstageFrames = 0;
  private heroLift = 0;
  /** Hero can scale factor so it fits between the header and the title (≤ 1). */
  private heroFit = 1;
  /** Phones: each home section's copy top edge (px from the top of the screen once the section is in place; -1 for a
   * section without copy) and the header's bottom edge: the band the single can stands in. */
  private copyTops: number[] = [];
  private headerBottom = 0;
  private readonly phoneFit = { scale: 1, y: 0 };
  private govStart = 0;
  private govFrames = 0;
  private govStep = 0;
  public onQualityChange?: (level: QualityLevel) => void;
  private spinStart = -1e9;
  /** Reduced motion: no pointer tilt, no spin, no intro (set from the app). */
  public reducedMotion = false;
  private spinOffset = 0;
  private productCanIndex = 0;
  private routeBlend = 1;
  private hasRenderedHome = false;
  /** The constructor renders one frame in the default HOME mode: label streaming waits for the app's real route. */
  private routeSet = false;
  private lastPageFrameAt = 0;
  /** Last scroll, pointer, drag or spin input: at rest the scene only breathes, so it renders at 30 fps. */
  private lastActivityAt = 0;
  private idleThrottled = false;

  private readonly routeFrom = Array.from({ length: CAN_COUNT }, () => ({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: 0,
  }));
  private readonly routeCameraFrom = new THREE.Vector3(0, 0, 29);
  private readonly tmpVector = new THREE.Vector3();
  private readonly tmpEuler = new THREE.Euler();
  private readonly tmpQuaternion = new THREE.Quaternion();
  public productViewerRotation = { x: 0, y: 0, targetX: 0, targetY: 0 };
  /** The share of that rotation made by setProductView (front / back panel turns): the pack ignores it, eased alike. */
  private productViewTurn = { value: 0, target: 0 };
  /** Spin left on the product can after a fling (radians per second), decaying like a real can on a turntable. */
  private productSpin = 0;
  /** Flavor previewed on the product can while a swatch is hovered or focused (-1: the page's own flavor). */
  private previewIndex = -1;
  /** Product page pack picker: how many cans the chosen pack holds, shown by the pack display (built on first use). */
  private productPackCount = 1;
  private pack: PackDisplay | null = null;
  /** Mix your pack: the chosen size, each slot's flavor index (-1 empty) and the DOM box the pack stands in. */
  private mixSize = 6;
  private readonly mixSlots = new Int8Array(24).fill(-1);
  private mixStage: HTMLElement | null = null;
  private readonly mixLoaded = new Uint8Array(FLAVORS.length);
  /** Hero: the camera eases back while the ring travels between flavors and settles when it stops. */
  private ringDolly = 0;
  /** Visitor turning the featured can (keys / drag), eased; glides back to the authored pose when idle. */
  private userTurn = { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0, lastInput: -1e9 };
  private dragTurn = false;

  // Flavor colour wave: the new accent floods outward from the focused can.
  private accentFrom = new THREE.Color();
  private accentTo = new THREE.Color();
  private wipeStart = -1e9;
  private lastAccentIndex = -1;

  /** Cinema bars (DOM, found lazily) and their eased amount. */
  /** The single-can section the scroll last settled on (for the arrival light sweep). */
  private settledSection = -1;

  // Intro: cans rise into the ring after the loader.
  private introArmedAt = -1;
  private introStart = -1e9;
  public onRoar: (() => void) | null = null;

  /** One pose per SCENE_SEQUENCE waypoint (numeric fields only), and their field names: the scroll timeline. */
  private timelineStates: Record<string, number>[] = [];
  private timelineKeys: string[] = [];
  private timelineSeekedAt = -1;
  private targetTimelineProgress = 0;
  private currentTimelineProgress = 0;
  /** Section position 0..9 (continuous), for the stage's slow drift. */
  public sectionPosition = 0;
  /** Smoothed scroll speed in sections per second (signed): drives can inertia and the ice dust. */
  public scrollVelocity = 0;
  private skyCheckedAt = -1e9;
  private lastSectionPosition = 0;

  /** When set, shaders and animation phases use this clock instead of real time (deterministic captures). */
  public timeOverride: number | null = null;
  public readonly focusScreen = new THREE.Vector2(0.5, 0.45);

  /**
   * The canvas size in CSS px. On phones the height is the large viewport (the tallest seen at this width, i.e.
   * with the address bar hidden): the bar collapsing and expanding while scrolling fired a resize every time, and
   * each one reallocated the renderer, post and backdrop buffers mid-scroll and shifted the framing. Now the bar
   * simply slides over the bottom of the canvas. A width change (rotation) measures afresh.
   */
  public viewWidth = 0;
  public viewHeight = 0;
  private measureView() {
    const width = window.innerWidth;
    const height = this.isLowPower && width === this.viewWidth ? Math.max(this.viewHeight, window.innerHeight) : window.innerHeight;
    const changed = width !== this.viewWidth || height !== this.viewHeight;
    this.viewWidth = width;
    this.viewHeight = height;
    return changed;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.isLowPower = window.innerWidth < 1024 || /iPad|iPhone|iPod|Android/.test(navigator.userAgent);
    this.measureView();
    const width = this.viewWidth;
    const height = this.viewHeight;
    // up to 2x on every tier for crisp labels; the frame-rate governor steps down on slow GPUs
    this.pixelRatioCap = 2;
    const pixelRatio = Math.min(window.devicePixelRatio, this.pixelRatioCap);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.isLowPower,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setClearColor(SCENE_COLOR.night, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(20, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 29);

    this.scene.environment = createStudioEnvironment(this.renderer);
    this.setupLights();
    this.setupSceneObjects();

    this.quality = this.isLowPower ? 'MEDIUM' : 'HIGH';
    this.stage = new Stage(this.renderer, width, height, this.quality);
    this.scene.add(this.stage.background, this.stage.foreground);

    this.buildMasterTimeline();
    this.roarMoment = new RoarMoment(this);
    this.crack = new CanCrack();
    this.moments.push(this.roarMoment, this.crack);
    this.bindEvents();
    (window as unknown as { __GRIZZLY_SCENE__: SceneManager }).__GRIZZLY_SCENE__ = this;
    this.animate(0);
    // Everything that is not needed for the first frame is built afterwards, one short task at a time.
    this.scheduleDeferredSetup();
  }

  private deferredHandles: number[] = [];
  private disposed = false;

  /**
   * Post-processing, floor reflections and the secondary moments (tagline type, Zamzam pool) are built after the first frame, each in its own task, instead of one long task before it.
   * All of them are optional in the render loop (`?.` / empty lists), so the first frames simply render without them.
   */
  private scheduleDeferredSetup() {
    const steps: Array<() => void> = [
      () => {
        // setQuality may already have built it (reduced motion / low tiers)
        if (!this.post) this.buildPost(this.viewWidth, this.viewHeight, this.renderer.getPixelRatio());
      },
      () => {
        if (!this.isLowPower) this.reflections = new FloorReflections(this.scene, this.cans, this.labels);
      },
      () => this.moments.push(new GhostText(this), new FlavorLetters(this)),
      () => this.moments.push(new ZamzamPool(this)),
    ];
    const idleWindow = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number };
    const next = () => {
      const step = steps.shift();
      if (!step || this.disposed) return;
      step();
      queue();
    };
    const queue = () => {
      const handle = idleWindow.requestIdleCallback ? idleWindow.requestIdleCallback(next, { timeout: 600 }) : window.setTimeout(next, 60);
      this.deferredHandles.push(handle);
    };
    // first, let the first frames render
    this.deferredHandles.push(window.setTimeout(queue, 120));
  }

  // ───────────────────────── setup ─────────────────────────

  /**
   * One cold overhead key follows the focused can so its top rim catches a hot specular; a
   * flavor-tinted back light separates the silhouette. Everything else stays dark.
   */
  private setupLights() {
    this.hemiLight = new THREE.HemisphereLight(SCENE_COLOR.skyFill, SCENE_COLOR.groundFill, 0.14);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(SCENE_COLOR.key, 0.6);
    this.keyLight.position.set(-1.6, 6.5, 4.2);
    this.scene.add(this.keyLight, this.keyLight.target);

    // a strong back light draws a bright chrome edge round every silhouette (product-film look)
    this.rimLight = new THREE.DirectionalLight(SCENE_COLOR.rim, 2.6);
    this.rimLight.position.set(3.2, 3.5, -5);
    this.scene.add(this.rimLight);

    this.fillLight = new THREE.DirectionalLight(SCENE_COLOR.softFill, 0.18);
    this.fillLight.position.set(2.6, -0.6, 4.0);
    this.scene.add(this.fillLight);

    this.baseFill = new THREE.DirectionalLight(SCENE_COLOR.baseFill, 0.9);
    this.baseFill.position.set(0.5, -6, 3);
    this.scene.add(this.baseFill);

    this.flashLight = new THREE.DirectionalLight(SCENE_COLOR.white, 0);
    this.flashLight.position.set(0, 7, 2);
    this.scene.add(this.flashLight, this.flashLight.target);
  }

  private setupSceneObjects() {
    this.labels = new LabelTextures(this.renderer);
    this.labels.maxLod = this.isLowPower || this.dataSaver ? 1 : 2;
    this.labels.loadNormals = !this.isLowPower;
    this.labels.phoneLevels = this.isLowPower;
    this.labels.onChange = (flavorIndex) => this.applyLabelMaps(flavorIndex);

    for (let i = 0; i < CAN_COUNT; i += 1) {
      const maps = this.labels.get(i % FLAVORS.length);
      const can = createCanMesh(maps.albedo, maps.surface, this.isLowPower, this.isLowPower ? null : maps.normal);
      setCanAccent(can, FLAVORS[i % FLAVORS.length].theme.secondary);
      can.visible = false;
      this.cans.push(can);
      this.scene.add(can);
    }
    // No label is downloaded here: a plain page never shows a can, and a product page only needs its own flavor.
    // The home story loads the 1k level of every flavor (≈120 KB each) from setRoute('HOME'); sharper levels
    // stream in by need (streamLabels).

    this.canHoverInfluence = new Float32Array(CAN_COUNT);
    this.canIdlePhase = new Float32Array(CAN_COUNT);
    for (let i = 0; i < CAN_COUNT; i += 1) this.canIdlePhase[i] = Math.random() * Math.PI * 2;
  }

  private buildPost(width: number, height: number, pixelRatio: number) {
    this.post?.dispose();
    this.post = null;
    if (this.quality === 'LOW') return;
    this.post = new PostFx(this.renderer, this.scene, this.camera, width, height, pixelRatio, this.quality);
  }

  /** Re-points every can (and its reflection) at a flavor's current textures. */
  private applyLabelMaps(flavorIndex: number) {
    const maps = this.labels.get(flavorIndex);
    this.cans.forEach((can, i) => {
      if (i % FLAVORS.length !== flavorIndex) return;
      const shell = can.getObjectByName('Shell') as THREE.Mesh | undefined;
      const material = shell?.material as THREE.MeshStandardMaterial | undefined;
      if (!material) return;
      material.map = maps.albedo;
      material.metalnessMap = maps.surface;
      material.roughnessMap = maps.surface;
      if (!this.isLowPower) material.normalMap = maps.normal;
      material.needsUpdate = true;
    });
    this.reflections?.setAlbedo(flavorIndex, maps.albedo);
  }

  /**
   * Streams label detail by need, not by default (it used to pull 2k for all six flavors and a 4k for the
   * hero, ≈14 MB before the first scroll):
   *   1k  every can, first frame (≈120 KB each)
   *   2k  the focused can (phones: only in close-ups); neighbours get their surface maps (they carry the
   *       brushed-metal look)
   *   4k  only a close-up on a capable, high-density screen, never on phones or with data saver on
   * The next flavor's 2k is prefetched when idle, but only on capable, unmetered-looking devices.
   */
  private lastStreamKey = '';
  private firstSharpLabel = true;
  private streamLabels(focusFlavor: number, closeUp: boolean) {
    const key = `${focusFlavor}:${closeUp}`;
    if (key === this.lastStreamKey) return;
    this.lastStreamKey = key;
    const count = FLAVORS.length;
    void this.labels.ensureSurface(focusFlavor);
    // Every device gets the focused can's 2k label (phones the light ETC1S one: their 1k level looked soft on a 2-3x
    // screen). The very first sharp label (≈1.3 MB, 340 KB on phones) waits for an idle moment after the first frames, so it never competes with
    // the 1k labels, the transcoder and the page itself on a first visit; later flavors load at once.
    const sharpen = () => void this.labels.ensureAlbedo(focusFlavor, 1);
    if (this.firstSharpLabel) {
      this.firstSharpLabel = false;
      const idleWindow = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number };
      if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(sharpen, { timeout: 2500 });
      else window.setTimeout(sharpen, 1200);
    } else {
      sharpen();
    }
    [1, count - 1].forEach((step) => void this.labels.ensureSurface((focusFlavor + step) % count));
    if (closeUp && this.wantsDetail4k()) void this.labels.ensureAlbedo(focusFlavor, 2);
    if (this.isLowPower || this.dataSaver) return;
    // Prefetch the next flavor's 2k only once the visitor has engaged (a bounce never pays for it), and only
    // when the browser is idle.
    void this.engaged.then(() => {
      const idle = () => void this.labels.ensureAlbedo((this.carousel.getIndex() + 1) % count, 1);
      const idleWindow = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number };
      if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(idle, { timeout: 4000 });
      else window.setTimeout(idle, 1500);
    });
  }

  /** Resolves on the visitor's first pointer, key, touch, wheel or scroll input. */
  private removeEngagedListeners: () => void = () => {};
  private readonly engaged: Promise<void> = new Promise((resolve) => {
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    const remove = () => events.forEach((name) => window.removeEventListener(name, done));
    const done = () => {
      remove();
      resolve();
    };
    this.removeEngagedListeners = remove;
    events.forEach((name) => window.addEventListener(name, done, { passive: true }));
  });

  /** Data saver or a 2g connection: stay on the small levels. */
  private readonly dataSaver = (() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    return Boolean(connection && (connection.saveData || /(^|-)2g$/.test(connection.effectiveType ?? '')));
  })();

  /** 4k only pays off where the label is shown at 1.5+ texels per pixel: capable GPUs on dense screens. */
  private wantsDetail4k() {
    // (1.25+: common laptop scaling already shows the 2k label soft in a close-up)
    return !this.isLowPower && !this.dataSaver && this.quality === 'HIGH' && this.labels.maxLod >= 2 && window.devicePixelRatio >= 1.25;
  }

  // ───────────────────────── intro ─────────────────────────

  /** Holds the hero cans below frame until playIntro() (called when the loader leaves). */
  public armIntro() {
    if (this.reducedMotion) return;
    this.introArmedAt = performance.now();
    this.introStart = Number.POSITIVE_INFINITY;
  }

  public playIntro() {
    if (this.introArmedAt < 0) return;
    this.introArmedAt = -1;
    this.introStart = performance.now();
  }

  /** The roar (first scroll of a visit): the bear behind the can, a small camera shake. */
  public roar() {
    this.roarMoment.trigger();
  }

  /** Index (into `cans`) of the can at the centre of the hero ring. */
  public featuredCanIndex() {
    const count = this.cans.length;
    return ((Math.round(this.carousel.position / this.carousel.spacing) % count) + count) % count;
  }

  /** Cracks the centre hero can open (click on it, or the O key). Only while the hero ring is on screen. */
  public crackOpen() {
    if (this.routeMode !== 'HOME' || this.data.wave < 0.6) return;
    this.crack.trigger(this.featuredCanIndex());
  }

  /** The centre hero can's index when the point hits it, else -1. */
  private centreCanAt(clientX: number, clientY: number) {
    const hit = this.pickCan(clientX, clientY, this.cans);
    if (!hit) return -1;
    const index = this.cans.indexOf(hit);
    return index === this.featuredCanIndex() ? index : -1;
  }

  /** 0 = held below frame, 1 = settled; staggered outward from the centre can. */
  private introProgress(time: number, stepDist: number) {
    if (this.introStart < 0) return 1;
    const local = Math.min(1, Math.max(0, (time - this.introStart - stepDist * 130) / 1250));
    const c = 1.15; // easeOutBack: a small settle past the mark
    return 1 + (c + 1) * (local - 1) ** 3 + c * (local - 1) ** 2;
  }

  /**
   * Keeps the focused hero can clear of the HTML title: given the title's top edge in CSS px,
   * lift the ring until the can's lowest point sits a margin above it.
   */
  public setHeroSafeBottom(titleTopPx: number, headerBottomPx = 0) {
    const height = this.viewHeight;
    const isMobile = window.innerWidth < 768;
    const distance = (isMobile ? this.data.camPosZ + 6.5 : this.data.camPosZ) - CAROUSEL_CONFIG.heroLift;
    const unitsPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * distance) / height;
    // a clear gap between the can's base and the title (14 px let the base sit on the letters once the can
    // leaned or lifted toward the pointer)
    const marginPx = 40;
    const safeY = (height / 2 - (titleTopPx - marginPx)) * unitsPerPx;
    const baseScale = isMobile ? CAROUSEL_CONFIG.heroScaleMobile : CAROUSEL_CONFIG.heroScale;
    const topY = (height / 2 - (headerBottomPx + marginPx * 0.5)) * unitsPerPx;
    const available = headerBottomPx > 0 ? topY - safeY : Number.POSITIVE_INFINITY;
    // phones keep the roomier span: their can stands closer to upright under a smaller header
    const span = isMobile ? 5.0 : HERO_CAN_SPAN;
    this.heroFit = Math.min(1, Math.max(0.6, available / (span * baseScale)));
    const scale = baseScale * this.heroFit;
    // the base sits about 2.15 scaled units below the can's centre once tilted (2.6 lifted the can ~60 px too high,
    // into the header logo)
    const canBottom = CAROUSEL_CONFIG.yBase + (isMobile ? 0.7 : 0) - (isMobile ? 2.6 : 2.15) * scale;
    // The hero camera looks slightly up and sits a little low: both move the can down the screen.
    const heroCamera = SCENE_STATES.hero.camera;
    this.heroLift = safeY - canBottom + distance * Math.tan(heroCamera.rotX) + heroCamera.posY;
    if (!isMobile && available !== Number.POSITIVE_INFINITY && available > span * scale) {
      this.heroLift += (available - span * scale) * 0.3;
    }
  }

  /** Phones: where each home section's copy starts (see `copyTops`), measured by the page on resize, never per frame. */
  public setCopyBands(tops: number[], headerBottomPx: number) {
    this.copyTops = tops;
    this.headerBottom = headerBottomPx;
  }

  /**
   * Phones: the can stands whole between the header and the section's copy, never under the text. Writes the largest
   * scale (up to `scale`) that fits the band and the height that centres the can in it into `phoneFit`. The band
   * follows the scroll from one section's copy to the next, so the can eases between them instead of jumping.
   */
  private fitPhoneCan(scale: number, rotX: number, rotZ: number, canZ: number) {
    const height = this.viewHeight;
    const section = Math.max(0, this.sectionPosition);
    const index = Math.floor(section);
    const copyTop = (i: number) => {
      const top = this.copyTops[i] ?? -1;
      return top > 0 ? top : height - 24; // no copy: the can may use the whole frame
    };
    const bottom = THREE.MathUtils.lerp(copyTop(index), copyTop(index + 1), smooth(section - index)) - 20;
    const top = this.headerBottom + 12;
    const distance = Math.max(1, this.camera.position.z - canZ);
    const unitsPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * distance) / height;
    // the leaning can's height on screen: its length foreshortened by the roll and pitch plus the rims' width; 4% for
    // the near rim, which perspective draws a little larger than the can's centre
    const half =
      (CAN.shellHeight / 2 + CAN.topHeight) * Math.abs(Math.cos(rotZ)) * Math.abs(Math.cos(rotX)) +
      CAN.radius * (Math.abs(Math.sin(rotZ)) + Math.abs(Math.sin(rotX)));
    const fit = (Math.max(0, bottom - top) * unitsPerPx) / (2 * half * 1.04);
    this.phoneFit.scale = Math.min(scale, fit);
    this.phoneFit.y = this.camera.position.y + distance * Math.tan(this.data.camRotX) + (height / 2 - (top + bottom) / 2) * unitsPerPx;
  }

  // ───────────────────────── quality ─────────────────────────

  /**
   * Steps quality down when the device can't hold ~40 fps for two windows in a row (a single hitch, a shader compile
   * or a hidden tab never counts). It sheds effects before sharpness: extra density first, then the
   * lens passes, then the low tier, and it never renders below the screen's own CSS resolution (at 0.75× the cans'
   * edges and labels turned soft and jagged, which read as cheap cans). Never steps back up within a visit.
   */
  private govSlowWindows = 0;
  private governQuality(rawDelta: number, time: number) {
    // (only a hidden tab or a multi-second gap resets the count: a device whose every frame takes 300 ms is exactly
    // the one that must step down)
    if (rawDelta <= 0 || rawDelta > 2 || document.hidden || this.idleThrottled) {
      this.govStart = time;
      this.govFrames = 0;
      return;
    }
    if (!this.govStart) this.govStart = time;
    this.govFrames += 1;
    const elapsed = time - this.govStart;
    if (elapsed < 2000) return;
    const fps = (this.govFrames * 1000) / elapsed;
    this.govStart = time;
    this.govFrames = 0;
    if (time < 4000 || this.govStep >= 3) return; // startup (shader compiles, texture uploads) never counts
    this.govSlowWindows = fps >= 40 ? 0 : this.govSlowWindows + 1;
    // phones step down after one slow 2 s window (two let a struggling phone stutter through the first scrolls)
    if (this.govSlowWindows < (this.isLowPower ? 1 : 2)) return;
    this.govSlowWindows = 0;
    this.govStep += 1;
    const dpr = Math.min(window.devicePixelRatio || 1, this.pixelRatioCap);
    const ratios = [dpr, Math.max(1, dpr * 0.8), 1, 1];
    this.setPixelRatio(ratios[this.govStep]);
    if (this.govStep >= 2) {
      this.stage.refreshEvery = 3;
      this.applyQuality('MEDIUM');
    }
    if (this.govStep >= 3) this.applyQuality('LOW');
  }

  private setPixelRatio(ratio: number) {
    this.renderer.setPixelRatio(ratio);
    this.post?.setPixelRatio(ratio);
  }

  private applyQuality(level: QualityLevel) {
    if (this.quality === level) return;
    this.quality = level;
    this.buildPost(this.viewWidth, this.viewHeight, this.renderer.getPixelRatio());
    this.reflections?.setEnabled(level !== 'LOW');
    this.stage.setQuality(level, this.viewWidth, this.viewHeight);
    this.onQualityChange?.(level);
  }

  /** Smart quality (HIGH / MEDIUM / LOW / STATIC) from the app's device probe. */
  public setQuality(level: QualityLevel | 'STATIC') {
    if (level === 'STATIC') {
      this.isRunning = false;
      return;
    }
    this.isRunning = true;
    // The cheap tier also streams only the small textures and skips emboss maps (a weak device must never look broken
    // or stall on downloads it cannot use).
    if (level === 'LOW') {
      this.labels.maxLod = Math.min(this.labels.maxLod, 1);
      this.labels.loadNormals = false;
    }
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    // HIGH renders up to 2x for crisp labels; MEDIUM up to 2x on phone-sized screens (375×812 at 2x is fewer pixels
    // than a laptop at 1.25x, and at 1.25x a 3x phone showed every can soft) and 1.5x on larger ones. The frame-rate
    // governor steps down on slow GPUs.
    const cap = level === 'LOW' ? 1 : level === 'MEDIUM' ? (window.innerWidth < 768 ? 2 : 1.5) : 2;
    this.setPixelRatio(Math.min(dpr, cap));
    this.applyQuality(level);
  }

  // ───────────────────────── controls ─────────────────────────

  /** Phone tilt (-1..1) drives the same parallax as the desktop pointer. */
  public setDeviceTilt(x: number, y: number) {
    this.pointer.x = x * 640;
    this.pointer.y = y * 640;
  }

  private tilt() {
    return this.reducedMotion ? 0 : this.data.pointerInfluence * 2;
  }

  /** Lights one benefit block on the featured can's label (-1 turns the glow off). */
  public setBenefitGlow(index: number) {
    this.benefitGlowIndex = index;
  }

  /** The lit label region the shader draws: it glides to the active block instead of snapping between blocks. */
  private readonly glowRect = new THREE.Vector4();
  private glowRectReady = false;
  private stepGlowRect(delta: number) {
    if (this.benefitGlowIndex < 0) {
      this.glowRectReady = false; // the next benefit lights up in place; the last position is kept while the glow fades
      return;
    }
    const target = BENEFIT_GLOW_RECTS[this.benefitGlowIndex];
    if (!this.glowRectReady || this.reducedMotion) {
      this.glowRect.copy(target);
      this.glowRectReady = true;
    } else {
      this.glowRect.lerp(target, damp(MOTION_RATE.transition, delta));
    }
  }

  /** Pushes scroll-driven label darkening and the benefit glow into a can's shader. */
  private applyLabelState(can: THREE.Group, isFeatured: boolean) {
    const surface = getCanSurface(can);
    if (!surface) return;
    surface.uLabelDim.value = isFeatured ? this.data.labelDim : 0;
    const strength = isFeatured ? this.benefitGlowStrength * this.data.labelDim : 0;
    surface.uGlowStrength.value = strength;
    if (strength > 0.001) {
      surface.uGlowColor.value.copy(this.glowColor);
      surface.uGlowRect.value.copy(this.glowRect);
    }
  }

  /**
   * Master timeline built from SCENE_SEQUENCE: segment k spans [k, k + 1]; the transition to
   * state k + 1 runs through the middle of the segment so each section holds its pose while it
   * is centred in the viewport. (A built-in seek replaced GSAP, which only ever drove this timeline:
   * the same windows and power2.inOut ease, ~35 KB gzipped lighter.)
   */
  private buildMasterTimeline() {
    const stateToData = (state: SceneStateConfig) => ({
      camPosX: state.camera.posX,
      camPosY: state.camera.posY,
      camPosZ: state.camera.posZ,
      fov: state.camera.fov,
      camRotX: state.camera.rotX,
      camRotY: state.camera.rotY,
      camRotZ: state.camera.rotZ,
      canScale: state.product.scale,
      canPosX: state.product.posX,
      canPosY: state.product.posY,
      canPosZ: state.product.posZ,
      canRotX: state.product.rotX,
      canRotY: state.product.rotY,
      canRotZ: state.product.rotZ,
      canSpin: state.product.spin,
      spacing: state.spacing,
      wave: state.wave,
      swirl: state.swirl,
      pointerInfluence: state.lighting.pointerInfluence,
      labelDim: state.lighting.labelDim ?? 0,
      ...state.stage,
    });

    this.timelineStates = SCENE_SEQUENCE.map(({ state }) => stateToData(SCENE_STATES[state]) as Record<string, number>);
    this.timelineKeys = Object.keys(this.timelineStates[0]);
    this.timelineData = { ...this.data, ...stateToData(SCENE_STATES[SCENE_SEQUENCE[0].state]) };
    Object.assign(this.data, this.timelineData);
    this.seekTimeline(0);
  }

  /**
   * Writes the timeline pose at `progress` (0..1) into `timelineData`. Waypoint k holds from k - 0.15 to k + 0.15
   * (in section units); between waypoints k - 1 and k the pose blends over [k - 0.85, k - 0.15] with power2.inOut.
   */
  private seekTimeline(progress: number) {
    if (progress === this.timelineSeekedAt) return;
    this.timelineSeekedAt = progress;
    const states = this.timelineStates;
    const last = states.length - 1;
    const t = progress * last;
    const k = Math.min(last, Math.max(1, Math.floor(t + 0.85)));
    const local = Math.min(1, Math.max(0, (t - (k - 0.85)) / 0.7));
    const eased = local < 0.5 ? 2 * local * local : 1 - (-2 * local + 2) ** 2 / 2;
    const from = states[k - 1];
    const to = states[k];
    const out = this.timelineData as unknown as Record<string, number>;
    for (const key of this.timelineKeys) out[key] = from[key] + (to[key] - from[key]) * eased;
  }

  public seekProgress(progress: number) {
    if (!this.timelineStates.length) return;
    if (progress !== this.targetTimelineProgress) this.lastActivityAt = performance.now();
    this.targetTimelineProgress = Math.max(0, Math.min(1, progress));
    this.sectionPosition = this.targetTimelineProgress * (SCENE_SEQUENCE.length - 1);
    // The ring is only interactive while the hero section is centred.
    const segment = 1 / (SCENE_SEQUENCE.length - 1);
    this.currentMode = progress < segment * 0.5 ? 'hero-carousel' : 'feature-editorial';
  }

  // ───────────────────────── pointer ─────────────────────────

  private onPointerDown = (e: PointerEvent) => {
    if (this.routeMode !== 'HOME') return;
    // single-can scenes: dragging turns the can; hero and lineup keep their own drag
    this.dragTurn = this.data.wave < 0.4 && this.data.swirl < 0.4;
    this.isPointerDown = true;
    this.isDragging = false;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;
    this.lastDragTime = performance.now();
    this.dragVelocityX = 0;
    this.dragVelocityY = 0;
    // Hero: hold the centre can still for a moment to pick it up.
    this.pressedCan = this.data.wave > 0.6 ? this.centreCanAt(e.clientX, e.clientY) : -1;
    window.clearTimeout(this.pickTimer);
    if (this.pressedCan >= 0 && !this.reducedMotion) {
      this.pickTimer = window.setTimeout(() => {
        if (!this.isPointerDown || this.isDragging) return;
        this.picked = true;
        this.userTurn.lastInput = performance.now();
        audioManager.playCanHover(494, 0.3);
      }, 280);
    }
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // not capturable (synthetic event): dragging still works without capture
    }
  };

  private onPointerMoveDrag = (e: PointerEvent) => {
    if (!this.isPointerDown) return;
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;
    if (!this.isDragging && Math.hypot(dx, dy) > 6) this.isDragging = true;
    const now = performance.now();
    const dt = Math.max(1, now - this.lastDragTime);
    this.lastDragTime = now;
    this.dragVelocityX += ((e.clientX - this.lastDragX) / dt - this.dragVelocityX) * 0.35;
    this.dragVelocityY += ((e.clientY - this.lastDragY) / dt - this.dragVelocityY) * 0.35;
    if (this.isDragging && (this.dragTurn || this.picked)) {
      // a held can turns on both axes (picked up in the hero), a featured can turns around its axis
      this.turnCan((e.clientX - this.lastDragX) * 0.012, this.picked ? (e.clientY - this.lastDragY) * 0.006 : 0);
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
      return;
    }
    this.lastDragY = e.clientY;
    if (this.isDragging && this.data.wave > 0.4) {
      const stepX = e.clientX - this.lastDragX;
      this.lastDragX = e.clientX;
      const deltaWorld = stepX * (14 / Math.max(window.innerWidth, 320));
      this.carousel.position -= deltaWorld;
      this.carousel.target -= deltaWorld;
    }
  };

  private onPointerUpDrag = (e: PointerEvent) => {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // nothing captured
    }
    window.clearTimeout(this.pickTimer);
    const recent = performance.now() - this.lastDragTime < 90; // a fling only if the pointer was still moving
    if (this.isDragging && (this.dragTurn || this.picked)) {
      // fling: the can keeps spinning in the direction it was thrown and eases to a stop
      if (recent && !this.reducedMotion) this.turnCan(THREE.MathUtils.clamp(this.dragVelocityX * 0.5, -6, 6), 0);
      this.isDragging = false;
      this.picked = false;
      return;
    }
    if (this.picked) {
      // held without a drag: put it back
      this.picked = false;
      return;
    }
    if (this.isDragging) {
      this.isDragging = false;
      // momentum: a quick swipe carries the ring on by up to three cans, then it snaps to a can
      const fling = recent && !this.reducedMotion
        ? THREE.MathUtils.clamp(-this.dragVelocityX * (14 / Math.max(window.innerWidth, 320)) * 260, -3 * this.carousel.spacing, 3 * this.carousel.spacing)
        : 0;
      this.carousel.target = Math.round((this.carousel.position + fling) / this.carousel.spacing) * this.carousel.spacing;
    } else if (this.routeMode === 'HOME') {
      if (this.data.swirl > 0.4) this.handleLineupClick(e.clientX, e.clientY);
      else if (this.data.wave > 0.4) this.handleCanClick(e.clientX, e.clientY);
    }
  };

  private pickCan(clientX: number, clientY: number, pool: THREE.Group[]): THREE.Group | null {
    this.pointerNDC.x = (clientX / window.innerWidth) * 2 - 1;
    this.pointerNDC.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const hit = this.raycaster.intersectObjects(pool, true)[0];
    let node: THREE.Object3D | null = hit?.object ?? null;
    while (node) {
      if (pool.includes(node as THREE.Group)) return node as THREE.Group;
      node = node.parent;
    }
    return null;
  }

  private handleLineupClick = (clientX: number, clientY: number) => {
    const clicked = this.pickCan(clientX, clientY, this.cans);
    if (!clicked) return;
    const canIndex = this.cans.indexOf(clicked) % FLAVORS.length;
    this.carousel.goTo(canIndex);
    audioManager.playCanHover([330, 370, 415, 494, 554, 659][canIndex % 6], 0.28);
  };

  private handleCanClick = (clientX: number, clientY: number) => {
    const clicked = this.pickCan(clientX, clientY, this.cans);
    if (!clicked) return;
    const canIndex = this.cans.indexOf(clicked);
    const target = canIndex * this.carousel.spacing - this.carousel.position;
    const minX = this.cans.length * -0.5 * this.carousel.spacing;
    const maxX = this.cans.length * 0.5 * this.carousel.spacing;
    const x = wrap(target, minX, maxX);
    if (Math.abs(x) < 0.65 * this.carousel.spacing) {
      this.crack.trigger(canIndex);
      this.onHeroCanClicked?.();
    }
    else this.carousel.target += Math.round(x / this.carousel.spacing) * this.carousel.spacing;
  };

  private onWheel = (e: WheelEvent) => {
    if (this.routeMode !== 'HOME' || this.data.wave < 0.6) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 12) {
      e.preventDefault();
      this.carousel.target += Math.sign(e.deltaX) * this.carousel.spacing;
    }
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
  };

  private onContextRestored = () => {
    this.contextLost = false;
  };

  private bindEvents() {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('mousemove', this.onMouseMove, { passive: true });
    window.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMoveDrag);
    this.canvas.addEventListener('pointerup', this.onPointerUpDrag);
    this.canvas.addEventListener('pointercancel', this.onPointerUpDrag);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  // ───────────────────────── routes ─────────────────────────

  /**
   * Route switch. Entering a product carries the featured can over: every can's current transform
   * is captured and the loop blends from it to the product pose (the others shrink away).
   */
  public setRoute(mode: 'HOME' | 'PRODUCT' | 'PAGE' | 'MIX', productSlug?: string) {
    const previous = this.routeMode;
    // the scene starts in HOME mode and draws a frame while it is built: only an explicit earlier route counts
    const hadRoute = this.routeSet;
    this.routeMode = mode;
    this.routeSet = true;
    if (mode === 'HOME' || mode === 'MIX') FLAVORS.forEach((_, index) => void this.labels.ensureAlbedo(index, 0));
    this.pack?.reset();
    if (mode === 'MIX') {
      // any flavor can land in the pack: every 1k label now, and the sharper level for each as it is chosen
      FLAVORS.forEach((_, index) => void this.labels.ensureSurface(index));
      this.mixLoaded.fill(0);
    }
    if (mode !== 'PRODUCT') return;

    const index = FLAVORS.findIndex((flavor) => flavor.id === productSlug);
    if (index !== -1) this.activeProductIndex = index;
    this.productViewerRotation = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.productViewTurn = { value: 0, target: 0 };
    this.previewIndex = -1;
    void this.labels.ensureSurface(this.activeProductIndex);
    // the small level first (preloaded by the page, ~120 KB): the can wears its label at once, then sharpens
    void this.labels.ensureAlbedo(this.activeProductIndex, 0);
    void this.labels.ensureAlbedo(this.activeProductIndex, 1);
    if (this.wantsDetail4k()) void this.labels.ensureAlbedo(this.activeProductIndex, 2);

    // Prefer the can already in focus on the home scene; otherwise the nearest of that flavor.
    const count = this.cans.length;
    const featured = ((Math.round(this.carousel.position / this.carousel.spacing) % count) + count) % count;
    let best = this.activeProductIndex;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = this.activeProductIndex; i < count; i += FLAVORS.length) {
      const distance = Math.min(Math.abs(i - featured), count - Math.abs(i - featured));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    this.productCanIndex = best;

    const cameFromScene = hadRoute && previous === 'HOME' && this.hasRenderedHome;
    this.cans.forEach((can, i) => {
      const from = this.routeFrom[i];
      from.position.copy(can.position);
      from.quaternion.copy(can.quaternion);
      from.scale = cameFromScene && can.visible ? can.scale.x : 0;
    });
    this.routeCameraFrom.copy(this.camera.position);
    this.routeBlend = cameFromScene ? 0 : 0.35;
    // Arriving directly (not carried over from the home ring): the can rises into place with most of a turn,
    // instead of simply appearing. Skipped under reduced motion.
    if (!cameFromScene && !this.reducedMotion) {
      const from = this.routeFrom[this.productCanIndex];
      from.position.set(0, -9, 0);
      from.scale = PRODUCT_POSE.scale * 0.8;
      this.routeBlend = 0;
      this.productViewerRotation.y = -Math.PI * 1.4;
    }
  }

  /**
   * Pack picker on the product page: 1, 6, 12 or 24 cans. The pack you pick is the pack you see: the hero can for
   * one, a clipped six-pack, or a shrink-wrapped tray of 12 or 24 that assembles in its place (packDisplay.ts).
   */
  public setProductPack(count: number) {
    this.productPackCount = Math.max(1, Math.round(count));
    this.lastActivityAt = performance.now();
  }

  /**
   * Swatch preview on the product page: the can wears another flavor's label (and the stage takes its colour) while
   * its swatch is hovered or focused, with a quick turn as the label changes. null restores the page's flavor.
   */
  public previewProductFlavor(slug: string | null) {
    if (this.routeMode !== 'PRODUCT') return;
    const index = slug ? FLAVORS.findIndex((flavor) => flavor.id === slug) : this.activeProductIndex;
    if (index < 0 || index === (this.previewIndex < 0 ? this.activeProductIndex : this.previewIndex)) return;
    const can = this.cans[this.productCanIndex];
    const material = (can?.getObjectByName('Shell') as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined;
    if (!can || !material) return;
    void this.labels.ensureAlbedo(index, 1);
    void this.labels.ensureSurface(index);
    const maps = this.labels.get(index);
    material.map = maps.albedo;
    material.metalnessMap = maps.surface;
    material.roughnessMap = maps.surface;
    if (!this.isLowPower) material.normalMap = maps.normal;
    setCanAccent(can, FLAVORS[index].theme.secondary);
    this.previewIndex = index === this.activeProductIndex ? -1 : index;
    if (!this.reducedMotion) this.productSpin = 4.5;
    this.lastActivityAt = performance.now();
  }

  public setInitialFlavor(index: number) {
    const normalized = ((index % FLAVORS.length) + FLAVORS.length) % FLAVORS.length;
    const position = normalized * this.carousel.spacing;
    this.carousel.position = position;
    this.carousel.target = position;
    this.carouselVelocity = 0;
    this.carousel.lastIndex = normalized;
    this.lastAccentIndex = -1;
  }

  /**
   * Narrow product pages: fit the can inside the DOM stage (top and height in CSS px at scroll 0).
   * Pass null on wide screens, where the can sits left of the panel instead.
   */
  public setProductStage(stage: { top: number; height: number } | null) {
    if (!stage || window.innerWidth >= 1024) {
      this.narrowPose = null;
      return;
    }
    const unitsPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(PRODUCT_CAMERA.fov / 2)) * PRODUCT_CAMERA.z) / this.viewHeight;
    // The product camera tilts up by camRotX, which drops everything a little: lift the can to compensate.
    const tiltLift = Math.tan(0.04) * PRODUCT_CAMERA.z;
    const centerPx = stage.top + stage.height / 2;
    const canHeight = CAN.shellHeight + CAN.topHeight + CAN.bottomHeight;
    const scale = THREE.MathUtils.clamp((0.86 * stage.height * unitsPerPx) / canHeight, 0.6, PRODUCT_POSE_NARROW.scale * 1.3);
    this.narrowPose = { ...PRODUCT_POSE_NARROW, y: (this.viewHeight / 2 - centerPx) * unitsPerPx + tiltLift, scale };
  }

  /** Product page scroll (in viewport heights); on narrow screens the can scrolls away with the hero. */
  public setProductScroll(progress: number) {
    this.productScroll = Math.max(0, progress);
  }

  public setProductExit(amount: number) {
    this.productExit = THREE.MathUtils.clamp(amount, 0, 1);
  }

  /** Turns the featured home can like a model viewer (radians). Ignored outside the home story. */
  public turnCan(deltaYaw: number, deltaPitch: number) {
    this.lastActivityAt = performance.now();
    if (this.routeMode !== 'HOME') return;
    const t = this.userTurn;
    t.targetYaw += deltaYaw;
    t.targetPitch = THREE.MathUtils.clamp(t.targetPitch + deltaPitch, -0.6, 0.6);
    t.lastInput = performance.now();
  }

  private updateUserTurn(delta: number, time: number) {
    const t = this.userTurn;
    if (time - t.lastInput > 3500) {
      // idle: settle back to the designed pose by the shortest way round
      t.targetYaw = Math.round(t.yaw / (Math.PI * 2)) * Math.PI * 2;
      t.targetPitch = 0;
    }
    const k = 1 - Math.exp(-(this.reducedMotion ? 30 : 7) * delta);
    t.yaw += (t.targetYaw - t.yaw) * k;
    t.pitch += (t.targetPitch - t.pitch) * k;
    if (time - t.lastInput > 3500 && Math.abs(t.yaw - t.targetYaw) < 1e-3 && Math.abs(t.pitch) < 1e-3) {
      t.yaw = 0;
      t.targetYaw = 0;
      t.pitch = 0;
    }
  }

  /** Drag-to-rotate on the product page. */
  public rotateProduct(deltaX: number, deltaY: number) {
    if (this.routeMode !== 'PRODUCT') return;
    this.productSpin = 0; // a hand on the can stops any spin
    this.lastActivityAt = performance.now();
    this.productViewerRotation.targetY += deltaX * 0.01;
    this.productViewerRotation.targetX = Math.max(-0.5, Math.min(0.5, this.productViewerRotation.targetX + deltaY * 0.006));
  }

  /**
   * Release after a drag: the can keeps turning at the release speed (px per ms of pointer travel) and slows to a
   * stop. Off under reduced motion.
   */
  public flingProduct(velocityX: number) {
    if (this.routeMode !== 'PRODUCT' || this.reducedMotion) return;
    // same gain as the drag (0.01 rad per px), per second, capped at about two turns a second
    this.productSpin = THREE.MathUtils.clamp(velocityX * 1000 * 0.01, -12, 12);
  }

  /** Turn the product can to show the front or the back panel, the short way round from wherever it was spun to. */
  public setProductView(view: 'FRONT' | 'BACK') {
    if (this.routeMode !== 'PRODUCT') return;
    this.productSpin = 0;
    const rotation = this.productViewerRotation;
    rotation.targetX = 0;
    const panelCentreU = (LABEL.panels.right[0] + LABEL.panels.right[1]) / 2;
    const isNarrow = window.innerWidth < 1024;
    const poseYaw = (isNarrow ? PRODUCT_POSE_NARROW : PRODUCT_POSE).rotY;
    const base = view === 'BACK' ? (0.5 - panelCentreU) * Math.PI * 2 - poseYaw : 0;
    const turns = Math.round((rotation.targetY - base) / (Math.PI * 2));
    const target = base + turns * Math.PI * 2;
    this.productViewTurn.target += target - rotation.targetY;
    rotation.targetY = target;
  }

  private onResize = () => {
    if (!this.measureView()) return; // the address bar moved: nothing to reallocate
    const width = this.viewWidth;
    const height = this.viewHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.post?.setSize(width, height);
    this.stage.resize(width, height);
  };

  private onMouseMove = (e: MouseEvent) => {
    this.lastActivityAt = performance.now();
    this.pointer.x = e.clientX - window.innerWidth / 2;
    this.pointer.y = e.clientY - window.innerHeight / 2;
    const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
    const ndcY = -((e.clientY / window.innerHeight) * 2 - 1);
    const halfH = Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z;
    this.pointerLightTarget.x = ndcX * halfH * this.camera.aspect;
    this.pointerLightTarget.y = ndcY * halfH;
  };

  private onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      this.isRunning = false;
    } else {
      this.isRunning = true;
      this.lastTime = performance.now();
    }
  };

  // ───────────────────────── frame loop ─────────────────────────

  public animate = (now: number) => {
    this.reqId = requestAnimationFrame(this.animate);
    if (!this.isRunning || this.contextLost) return;
    // Plain pages (shop, bag, checkout, ...) cover the canvas with their own CSS backdrop (styles/pages.css): the
    // scene draws nothing there, which leaves the GPU, the battery and the main thread to the page. It picks up
    // again on the next frame after the route returns to the home story or a product.
    if (this.routeMode === 'PAGE') {
      this.lastTime = now;
      return;
    }
    // At rest (no scroll, pointer, drag or spin for 2.5 s, the camera settled on its pose) the scene only breathes:
    // 30 fps is plenty and halves the GPU work while someone is just looking. Any input restores full rate at once.
    this.idleThrottled =
      now - this.lastActivityAt > 2500 &&
      this.productSpin === 0 &&
      Math.abs(this.targetTimelineProgress - this.currentTimelineProgress) < 0.0005;
    if (this.idleThrottled) {
      if (now - this.lastPageFrameAt < 32) return;
      this.lastPageFrameAt = now;
    }
    const time = this.timeOverride ?? now;
    const rawDelta = (now - this.lastTime) / 1000;
    const delta = Math.min(rawDelta, 0.05);
    this.lastTime = now;
    this.governQuality(rawDelta, now);

    // Frame-rate independent damping keeps scroll, pointer and product motion consistent on 60 Hz,
    // high refresh and throttled mobile displays.
    const pointerBlend = damp(MOTION_RATE.focus, delta);
    this.pointer.smoothX += (this.pointer.x - this.pointer.smoothX) * pointerBlend;
    this.pointer.smoothY += (this.pointer.y - this.pointer.smoothY) * pointerBlend;
    this.updateUserTurn(delta, now);
    {
      const raw = delta > 0 ? (this.sectionPosition - this.lastSectionPosition) / delta : 0;
      this.lastSectionPosition = this.sectionPosition;
      const target = this.reducedMotion ? 0 : THREE.MathUtils.clamp(raw, -6, 6);
      this.scrollVelocity += (target - this.scrollVelocity) * (1 - Math.exp(-5 * delta));
    }

    // the camera trails the scroll a little (cinematic follow), never snapping to it
    const timelineBlend = damp(MOTION_RATE.transition, delta);
    this.currentTimelineProgress += (this.targetTimelineProgress - this.currentTimelineProgress) * timelineBlend;
    if (Math.abs(this.targetTimelineProgress - this.currentTimelineProgress) <= 0.0001) {
      this.currentTimelineProgress = this.targetTimelineProgress;
    }
    this.seekTimeline(this.currentTimelineProgress);

    Object.assign(this.data, this.timelineData);
    this.fx.flash = 0;
    this.fx.burst = 0;
    this.fx.water = 0;
    this.canOverride.blend = 0;
    this.cameraOffset.set(0, 0, 0);
    this.cameraRollOffset = 0;
    const fo = this.featuredOffset;
    fo.rotX = 0;
    fo.posY = 0;
    fo.posZ = 0;
    fo.scale = 1;
    // a picked-up can lifts toward the camera and grows a little; let go, it settles back into the ring
    this.pickBlend += ((this.picked ? 1 : 0) - this.pickBlend) * damp(MOTION_RATE.focus, delta);
    if (this.picked) this.userTurn.lastInput = now;
    if (this.pickBlend > 0.001) {
      fo.posZ += 1.5 * this.pickBlend;
      fo.scale *= 1 + 0.06 * this.pickBlend;
    }
    this.stepCarousel(delta, now);
    this.stepGlowRect(delta);
    if (this.routeMode === 'HOME') this.moments.forEach((moment) => moment.update(time * 0.001, this));
    // the air is the same on every 3D route: the dust keeps drifting on the product page too
    // live sky: refreshed once a minute (the moon and the hour change slowly)
    if (now - this.skyCheckedAt > 60_000) {
      this.skyCheckedAt = now;
      const date = new Date();
      const tw = twilight(date);
      this.stageParams.moonPhase = moonPhase(date);
      this.stageParams.dawn = tw.dawn;
      this.stageParams.dusk = tw.dusk;
    }

    if (this.routeMode === 'PRODUCT') this.renderProduct(delta, time);
    else if (this.routeMode === 'HOME') this.renderHome(delta, time, now);
    else if (this.routeMode === 'MIX') this.renderMix(delta, time);
    else this.renderPage(time);
  };

  /** Critically damped spring: a soft, physical start and stop without a frame-rate dependent snap. */
  private stepCarousel(delta: number, now: number) {
    const springFrequency = 16;
    const springError = this.carousel.position - this.carousel.target;
    // physical flavor change: the camera eases back while the ring travels and settles as it stops
    const dollyTarget = this.reducedMotion ? 0 : Math.min(1.4, Math.abs(this.carouselVelocity) * 0.12) * this.data.wave;
    this.ringDolly += (dollyTarget - this.ringDolly) * (1 - Math.exp(-5 * delta));
    if (Math.abs(springError) > 0.0005) this.lastActivityAt = now; // the ring is travelling: full frame rate
    const springImpulse = this.carouselVelocity + springFrequency * springError;
    const springDecay = Math.exp(-springFrequency * delta);
    this.carousel.position = this.carousel.target + (springError + springImpulse * delta) * springDecay;
    this.carouselVelocity = (this.carouselVelocity - springFrequency * springImpulse * delta) * springDecay;
    if (Math.abs(springError) < 0.0005 && Math.abs(this.carouselVelocity) < 0.005) {
      this.carousel.position = this.carousel.target;
      this.carouselVelocity = 0;
    }
    const currentIdx = this.carousel.getIndex();
    if (currentIdx !== this.carousel.lastIndex) {
      this.carousel.listeners.forEach((cb) => cb({ index: currentIdx, previous: this.carousel.lastIndex }));
      this.carousel.lastIndex = currentIdx;
      if (!this.reducedMotion) this.spinStart = now;
      audioManager.play('change');
    }
    // One full turn of the focused can when the flavor changes.
    const spinT = (now - this.spinStart) / 900;
    // the ring itself slides to the new flavor (as in the reference): no extra full turn of the can
    this.spinOffset = 0;
    void spinT;
  }

  /**
   * Rebuilds the reflection environment with the flavor's colour gel, once the flavor has settled (a quick run
   * through the ring rebuilds once, not per can). Skipped on low-power devices, which keep the neutral studio.
   */
  private envTimer = -1;
  private scheduleEnvironment(accent: string) {
    if (this.isLowPower) return;
    window.clearTimeout(this.envTimer);
    this.envTimer = window.setTimeout(() => {
      if (this.disposed) return;
      const previous = this.scene.environment;
      this.scene.environment = createStudioEnvironment(this.renderer, accent);
      previous?.dispose();
    }, 450);
  }

  /** Accent colour wave: starts when the focused flavor changes, floods out from the focus can. */
  private updateAccent(flavorIndex: number, time: number) {
    const flavor = FLAVORS[flavorIndex % FLAVORS.length];
    if (this.lastAccentIndex < 0) {
      this.accentFrom.set(flavor.theme.secondary);
      this.accentTo.set(flavor.theme.secondary);
      this.wipeStart = -1e9;
    } else if (flavorIndex !== this.lastAccentIndex) {
      this.accentFrom.copy(this.accentTo);
      this.accentTo.set(flavor.theme.secondary);
      this.wipeStart = time;
    }
    if (flavorIndex !== this.lastAccentIndex) this.scheduleEnvironment(flavor.theme.secondary);
    this.lastAccentIndex = flavorIndex;
    const wipeT = Math.min(1, Math.max(0, (time - this.wipeStart) / (this.reducedMotion ? 1 : 1400)));
    this.stageParams.wipe = wipeT >= 1 ? 1 : 1 - (1 - wipeT) ** 3;
    this.stageParams.accentPrev.copy(this.accentFrom);
    this.stageParams.accent.copy(this.accentTo);
    this.stageParams.wipeOrigin.copy(this.focusScreen);
    this.glowColor.copy(this.accentTo);
  }

  private applyCamera(isMobile: boolean, time: number) {
    // scroll-speed feel: a fast flick widens the lens a touch (a sense of rush), easing back at rest
    const rush = this.reducedMotion ? 0 : Math.min(2.2, Math.abs(this.scrollVelocity) * 0.9);
    this.camera.fov = this.data.fov + rush;
    this.camera.updateProjectionMatrix();
    // Phones are too narrow for the sideways orbit: keep the camera centred there.
    const lateral = isMobile ? 0 : 1;
    this.camera.position.set(
      this.data.camPosX * lateral + this.cameraOffset.x,
      this.data.camPosY + this.cameraOffset.y,
      (isMobile ? this.data.camPosZ + (this.data.wave > 0.5 ? 6.5 : 2) : this.data.camPosZ) + this.cameraOffset.z + this.ringDolly
    );
    // A whisper of idle sway keeps the camera alive without ever reading as motion.
    const sway = this.reducedMotion ? 0 : 1;
    this.camera.rotation.set(
      this.data.camRotX + Math.sin(time * 0.00031) * 0.0035 * sway,
      this.data.camRotY * lateral + Math.cos(time * 0.00027) * 0.004 * sway,
      this.data.camRotZ + this.cameraRollOffset
    );
  }

  /** Writes the timeline's stage values and the focus can's screen position into the stage. */
  private updateStage(time: number, focus: THREE.Object3D | null) {
    const p = this.stageParams;
    const d = this.data;
    p.time = time * 0.001;
    p.aspect = this.camera.aspect;
    p.horizon = THREE.MathUtils.clamp(0.5 - (0.5 * Math.tan(this.camera.rotation.x)) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), 0.05, 0.95);
    p.camX = this.camera.position.x;
    p.camY = this.camera.position.y;
    p.scroll = this.sectionPosition;
    p.moon = d.moon;
    p.field = d.field;
    p.studio = d.studio;
    p.mountains = d.mountains;
    // the colour field is a clean studio gradient: no night mist drawn over it
    const clear = 1 - THREE.MathUtils.clamp(d.field + d.studio, 0, 1);
    p.mist = (0.6 + 0.4 * d.mistFg) * clear;
    p.mistFg = d.mistFg * (this.quality === 'HIGH' ? 1 : 0.7) * clear;
    p.glow = d.glow;
    p.stars = d.stars;
    p.flash = this.fx.flash;
    p.burst = this.fx.burst;
    p.water = this.fx.water;
    p.burstPos.copy(this.fx.burstPos);
    if (focus) {
      this.camera.updateMatrixWorld();
      this.tmpVector.setFromMatrixPosition(focus.matrixWorld).project(this.camera);
      this.focusScreen.set(this.tmpVector.x * 0.5 + 0.5, this.tmpVector.y * 0.5 + 0.5);
      p.glowPos.copy(this.focusScreen);
    }
    this.stage.update(p);
    this.stage.renderBackdrop();
  }

  private renderScene(time: number) {
    if (this.post) this.post.render(time * 0.001);
    else this.renderer.render(this.scene, this.camera);
  }

  /** Plain pages (bag, checkout, story, 404): the night stage only, redrawn at a relaxed pace. */
  private pageFrame = 0;
  private ensurePack() {
    return (this.pack ??= new PackDisplay(this.scene, FLAVORS.length, this.isLowPower));
  }

  /** Mix your pack: the size (6, 12 or 24) and each slot's flavor slug (null for an empty slot). */
  public setMix(size: number, slots: (string | null)[]) {
    this.mixSize = size;
    this.mixSlots.fill(-1);
    slots.forEach((slug, k) => {
      if (k >= this.mixSlots.length || !slug) return;
      const flavor = FLAVORS.findIndex((item) => item.id === slug);
      this.mixSlots[k] = flavor;
      // a chosen flavor sharpens to its 2k label (once per flavor and visit)
      if (flavor >= 0 && !this.mixLoaded[flavor]) {
        this.mixLoaded[flavor] = 1;
        void this.labels.ensureAlbedo(flavor, 1);
      }
    });
    this.lastActivityAt = performance.now();
  }

  /** The page element the mix pack stands in (measured every frame, so it scrolls with the page); null clears it. */
  public setMixStage(element: HTMLElement | null) {
    this.mixStage = element;
  }

  /**
   * Mix your pack: the product studio (grey, lit from above), no single cans, and the pack standing in the page's
   * stage box: the tray or clip waits, each chosen flavor drops into its slot, and it closes when full.
   */
  private renderMix(delta: number, time: number) {
    this.cans.forEach((can) => (can.visible = false));
    this.reflections?.hideAll();
    Object.assign(this.data, { camRotX: 0.04, camRotY: 0, camRotZ: 0, floorY: -3.4, reflect: 0, mountains: 0, moon: 0, mistFg: 0.2, glow: 1, stars: 0, wave: 0, swirl: 0, labelDim: 0, field: 0, studio: 1 });
    this.camera.fov = PRODUCT_CAMERA.fov;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(PRODUCT_CAMERA.x, PRODUCT_CAMERA.y, PRODUCT_CAMERA.z);
    this.camera.rotation.set(this.data.camRotX, 0, 0);
    this.updateAccent(this.carousel.getIndex(), time);
    this.baseFill.intensity = 0.18;

    const pack = this.ensurePack();
    FLAVORS.forEach((_, index) => pack.setFlavorLabel(index, this.labels.get(index)));
    pack.setProductFlavor(0, '#e9e4d8', 'Your mix'); // the tray and clip print (cans take their own slot's flavor)
    pack.updateMix(delta, this.mixSize, this.mixSlots, this.reducedMotion);
    if (pack.isAnimating) this.lastActivityAt = performance.now();

    // the stage box on screen → world units at the pack's depth (the camera's small tilt drops everything a little)
    const height = this.viewHeight;
    const unitsPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(PRODUCT_CAMERA.fov / 2)) * PRODUCT_CAMERA.z) / height;
    const rect = this.mixStage?.getBoundingClientRect();
    const box = rect && rect.width > 0 ? rect : { left: window.innerWidth * 0.55, top: height * 0.25, width: window.innerWidth * 0.4, height: height * 0.5 };
    const x = (box.left + box.width / 2 - window.innerWidth / 2) * unitsPerPx;
    const y = (height / 2 - (box.top + box.height / 2)) * unitsPerPx + Math.tan(this.data.camRotX) * PRODUCT_CAMERA.z;
    const sway = this.reducedMotion ? 0 : Math.sin(time * 0.0005) * 0.08;
    pack.place(x, y, 0, sway, 0, box.width * unitsPerPx * 0.9, box.height * unitsPerPx * 0.9);
    this.keyLight.position.set(x - 4.2, y + 4.6, 3.6);
    this.keyLight.target.position.set(x, y, 0);
    this.keyLight.target.updateMatrixWorld();

    this.updateStage(time, null);
    this.post?.setFocus(0.5, 0.5, 0);
    this.renderScene(time);
  }

  private renderPage(time: number) {
    this.pageFrame += 1;
    if (this.pageFrame % 2 === 1) return;
    this.cans.forEach((can) => (can.visible = false));
    this.reflections?.hideAll();
    Object.assign(this.data, { camPosX: 0, camPosY: 0, camPosZ: 29, camRotX: 0.04, camRotY: 0, camRotZ: 0, mountains: 0.55, moon: 0.7, mistFg: 0.5, glow: 0, stars: 0.8, field: 0, studio: 0 });
    this.applyCamera(false, time);
    this.updateAccent(this.carousel.getIndex(), time);
    this.updateStage(time, null);
    this.post?.setFocus(0.5, 0.5, 0);
    this.renderScene(time);
  }

  private renderHome(delta: number, time: number, now: number) {
    const isMobile = window.innerWidth < 768;
    this.hasRenderedHome = true;
    this.applyCamera(isMobile, time);

    const closeUp = this.data.wave < 0.3 && this.data.swirl < 0.5;
    if (this.routeSet) this.streamLabels(this.carousel.getIndex(), closeUp);
    this.updateAccent(this.carousel.getIndex(), time);

    // Benefit label glow: flavor-coloured, one block at a time, damped.
    const glowTarget = this.benefitGlowIndex >= 0 ? 1 : 0;
    this.benefitGlowStrength += (glowTarget - this.benefitGlowStrength) * damp(MOTION_RATE.emphasize, delta);

    // a dim lift for the can bottoms the ring shows (at up to 0.9 every base read as bright white rings)
    this.baseFill.intensity = 0.06 + 0.2 * this.data.wave;
    // Benefit chapters: a stronger front light so the active label block reads sharp and bright.
    this.keyLight.intensity = 1.05 + 0.6 * this.data.labelDim; // a real key on the featured can in every scene
    this.fillLight.intensity = 0.18 + 0.5 * this.data.labelDim;
    // Back light picks up the flavor colour, like a coloured gel behind a product shot, in the single-can chapters.
    // In the hero ring it stays neutral: a tinted back light re-coloured the edge glow of every can at once each time
    // the ring moved to another flavor.
    // (a touch of colour only, and none in the line-up: a tinted back light reads as a glow round every can)
    this.rimTint.copy(this.rimBase).lerp(this.glowColor, 0.25 * (1 - this.data.wave) * (1 - this.data.swirl));
    this.rimLight.color.lerp(this.rimTint, damp(MOTION_RATE.reveal, delta));

    // Arrival on a single-can chapter: a soft-box glint sweeps across the featured can, left to right. Not in the hero
    // ring: the glint is a directional light, so there it flashed every can in the line-up whenever the ring moved.
    const glintT = (now - this.spinStart) / 1100;
    const glintAmount = Math.max(0, 1 - this.data.wave * 1.5);
    if (glintT >= 0 && glintT < 1 && glintAmount > 0) {
      this.flashLight.intensity = Math.sin(Math.PI * glintT) ** 2 * 2.2 * glintAmount;
      this.flashLight.position.set(this.data.canPosX - 7 + glintT * 14, this.data.canPosY + 3, this.data.canPosZ + 6);
      this.flashLight.target.position.set(this.data.canPosX, this.data.canPosY, this.data.canPosZ);
      this.flashLight.target.updateMatrixWorld();
    } else if (this.flashLight.intensity !== 0) {
      this.flashLight.intensity = 0;
    }

    // Responsive carousel spacing
    const targetSpacing = isMobile ? CAROUSEL_CONFIG.spacingMobile : CAROUSEL_CONFIG.spacing;
    if (Math.abs(this.carousel.spacing - targetSpacing) > 0.005) {
      const ratio = this.carousel.position / (this.carousel.spacing || 1);
      this.carousel.spacing = targetSpacing;
      this.carousel.position = ratio * targetSpacing;
      this.carousel.target = Math.round(ratio) * targetSpacing;
    }

    // Key light follows the featured can so its top rim always catches the hot specular.
    const pointerX = this.reducedMotion ? 0 : this.pointer.smoothX / (window.innerWidth / 2);
    const pointerY = this.reducedMotion ? 0 : this.pointer.smoothY / (window.innerHeight / 2);
    this.keyLight.position.set(this.data.canPosX - 4.2 + pointerX * 3, this.data.canPosY + 4.6 - pointerY * 2, this.data.canPosZ + 3.6);
    this.keyLight.target.position.set(this.data.canPosX, this.data.canPosY, this.data.canPosZ);
    this.keyLight.target.updateMatrixWorld();

    // Intro safety net: never leave the cans parked if the loader never reports.
    if (this.introArmedAt >= 0 && now - this.introArmedAt > 8000) this.playIntro();
    if (this.introStart > -1e8 && this.introStart < now - 4500) this.introStart = -1e9;

    this.layoutCans(delta, time, isMobile);
    this.updateCinema(now);
    this.reflections?.update(this.cans, this.data.floorY, this.data.reflect, this.reducedMotion);
    const focus = this.cans[this.featuredCanIndex()] ?? this.cans[0];
    this.updateStage(time, focus);
    // Lens focus: the ring's back cans fall softly out of focus, single-can scenes keep only a whisper of it, the
    // finale row stays sharp. (a strong blur read as low-quality cans: the ring keeps only a gentle depth cue; the
    // fast-scroll blur and cinema bars are gone: the reference keeps the frame open and sharp while scrolling)
    // (the ring's depth blur is light: blurred side cans read as low-resolution labels, the reference keeps them sharp)
    const lens = 0.12 * this.data.wave + 0.18 * (1 - this.data.wave) * (1 - this.data.swirl);
    this.post?.setFocus(this.focusScreen.x, this.focusScreen.y, lens * (1 - 0.8 * this.pickBlend));
    this.renderScene(time);
  }

  /**
   * Each time the scroll settles on a single-can chapter a soft-box light sweeps across the can (the same glint as a
   * flavor change).
   */
  private updateCinema(now: number) {
    const speed = Math.abs(this.scrollVelocity);
    const nearest = Math.round(this.sectionPosition);
    const state = SCENE_STATES[SCENE_SEQUENCE[nearest]?.state];
    const settled = Math.abs(this.sectionPosition - nearest) < 0.04 && speed < 0.2;
    if (settled && nearest !== this.settledSection) {
      this.settledSection = nearest;
      if (state && state.wave === 0 && state.swirl === 0 && !this.reducedMotion) this.spinStart = now;
    } else if (Math.abs(this.sectionPosition - this.settledSection) > 0.5) {
      this.settledSection = -1;
    }
  }

  /** Positions every can for the current timeline state: hero ring, single feature or finale lineup. */
  private layoutCans(delta: number, time: number, isMobile: boolean) {
    const minX = this.cans.length * -0.5 * this.carousel.spacing;
    const maxX = this.cans.length * 0.5 * this.carousel.spacing;
    let maxHoverInfluence = 0;
    let bestHoverCanIndex = -1;
    // The finale row uses every can (two of each flavor), like a full shelf, as in the reference.
    const lineupCount = this.cans.length;
    const fo = this.featuredOffset;

    this.cans.forEach((can, i) => {
      const target = i * this.carousel.spacing - this.carousel.position;
      const x = wrap(target, minX, maxX);
      const stepDist = Math.abs(x) / this.carousel.spacing;
      const centerWeight = Math.max(0, 1 - stepDist);
      const p = smooth(centerWeight);

      // Finale: every can on one tight, twisting row. Blends from the featured pose as swirl goes 0 → 1.
      if (this.data.swirl > 0.01) {
        const s = this.data.swirl;
        // the active flavor lands near the middle of the row
        const slot = LINEUP_SLOTS[(((i - this.carousel.getIndex() + 5) % lineupCount) + lineupCount) % lineupCount];
        const isFeatured = p > 0.4;
        const fromScale = isFeatured ? this.data.canScale : 0;
        can.visible = isFeatured || s > 0.25;
        const mobileK = isMobile ? 0.3 : 1; // phones: the whole row fits the narrow frame, raised to mid-screen
        // narrower desktop frames: the whole row grows (up to 1.35×; at 2× only three cans fit a narrow frame) so it still fills the frame and runs past both
        // edges, as in the reference, instead of floating small with empty space below
        // (only around the line-up itself: by the FAQ the row is back to 1×, so it still hangs into the top of the frame)
        const lineupWeight = Math.max(0, Math.min(1, 8 - this.sectionPosition));
        const rowK = isMobile ? 1 : 1 + (Math.min(1.35, Math.max(1, 1.9 / this.camera.aspect)) - 1) * lineupWeight;
        // Spacing from the cans' real size: neighbours keep about 12% of a diameter of air between them at any width
        // (the fixed 1.68-unit step was narrower than a can, so tilted neighbours passed through each other, worst on
        // phones where the row's positions shrank more than its cans).
        const finalScale = this.data.canScale * (isMobile ? 0.46 : rowK);
        const posK = mobileK * rowK;
        const spread = Math.max(1, (2 * CAN.radius * finalScale * 1.12) / (1.72 * posK));
        // Each can drops in on its own beat (back row first), with a small settle.
        const local = THREE.MathUtils.clamp((s - slot.delay * 0.7) / (1 - slot.delay * 0.7), 0, 1);
        const drop = (1 - landing(local)) * 9;
        const phase = this.canIdlePhase[i];
        const breath = this.reducedMotion ? 0 : Math.sin(time * 0.0008 + phase) * 0.014;
        can.position.set(
          this.data.canPosX * (1 - s) + slot.x * posK * spread * s,
          this.data.canPosY * (1 - s) + ((1 + (slot.y - 1) * spread) * posK + (isMobile ? 2.2 : 0) + breath + drop) * s,
          this.data.canPosZ * (1 - s) + slot.z * rowK * spread * s
        );
        can.rotation.set(
          this.data.canRotX * (1 - s) + slot.rotX * s,
          this.data.canRotY * (1 - s) + slot.rotY * s,
          this.data.canRotZ * (1 - s) + slot.rotZ * s
        );
        const canScale = fromScale * (1 - s) + finalScale * s;
        can.scale.setScalar(canScale);
        setCanFocus(can, Math.round(Math.max(0.02, (isFeatured ? 1 - s : 0) + s * 0.95) * 100) / 100);
        this.applyLabelState(can, false);
        this.applyCanOverride(can, i);
        return;
      }

      // Feature editorial: one single large can; all others recede and are hidden.
      if (this.currentMode === 'feature-editorial' && this.data.wave < 0.15) {
        const isFeatured = p > 0.4;
        can.visible = isFeatured;
        if (!isFeatured) {
          can.position.set(0, -999, 0);
          return;
        }
        let featX = this.data.canPosX;
        let featY = this.data.canPosY;
        let featScale = this.data.canScale;
        let featRotX = this.data.canRotX;
        let featRotY = this.data.canRotY + this.data.canSpin;
        if (isMobile) {
          // Phones: the can stands centred and whole above the copy (sized to the band below, once its lean is known)
          featX = 0;
        } else {
          featX = this.fitFeatureX(featX);
        }
        featRotY += (this.pointer.smoothX / 1280) * this.tilt() + this.spinOffset;
        featRotY += this.userTurn.yaw;
        featRotX = featRotX + this.userTurn.pitch;
        // Between two chapters the can makes one full turn, scrubbed by the scroll (not timed): it swings toward the
        // camera mid-turn with a little roll, and lands facing exactly as the next pose wants (2π apart). The turn
        // alternates direction chapter to chapter. Off for reduced motion.
        let featZ = this.data.canPosZ;
        let featRotZ = this.data.canRotZ;
        const section = this.sectionPosition;
        const fromState = SCENE_STATES[SCENE_SEQUENCE[Math.floor(section)]?.state];
        const toState = SCENE_STATES[SCENE_SEQUENCE[Math.floor(section) + 1]?.state];
        // only between two single-can poses: out of the hero ring or into the finale row the layout switches branch
        const singleToSingle = !!fromState && !!toState && fromState.wave === 0 && toState.wave === 0 && fromState.swirl === 0 && toState.swirl === 0;
        // Between benefit chapters 1 → 2 → 3 the can holds its pose and steps while the lit block slides down the label
        // (a full turn there spun a dark can through an empty frame). The turn stays for the flavor intro, Zamzam and
        // the tagline.
        const betweenBenefits = Math.floor(section) === 2 || Math.floor(section) === 3;
        if (!this.reducedMotion && singleToSingle && !betweenBenefits) {
          const local = THREE.MathUtils.clamp((section - Math.floor(section) - 0.15) / 0.7, 0, 1);
          const turn = local * local * (3 - 2 * local);
          const swing = Math.sin(Math.PI * local);
          const dir = Math.floor(section) % 2 === 0 ? 1 : -1;
          featRotY += Math.PI * 2 * turn * dir;
          featZ += swing * 1.6;
          featRotZ += swing * 0.12 * dir;
        }
        if (isMobile) {
          this.fitPhoneCan(featScale, featRotX, featRotZ, featZ);
          featScale = this.phoneFit.scale;
          featY = this.phoneFit.y;
        }
        // inertia: the can leans back against a fast scroll and trails it slightly, then settles
        featRotX -= this.scrollVelocity * 0.07;
        featY += this.scrollVelocity * 0.12;
        featRotX += (this.pointer.smoothY / 1280) * this.tilt();
        // A whole-can pose floats: a slow bob and a lazy quarter-sway of the label, so the can feels held in the air.
        // Benefit close-ups (labelDim) stay still so the lit block holds its place on screen.
        const float = this.reducedMotion ? 0 : 1 - this.data.labelDim;
        featY += Math.sin(time * 0.0009) * 0.09 * float;
        featRotY += Math.sin(time * 0.00045) * 0.16 * float;
        featRotZ += Math.sin(time * 0.0007 + 1.3) * 0.025 * float;
        setCanFocus(can, 1);
        this.applyLabelState(can, true);
        can.position.set(featX, featY + fo.posY, featZ + fo.posZ);
        can.rotation.set(featRotX + fo.rotX, featRotY, featRotZ);
        can.scale.setScalar(featScale * fo.scale);
        this.applyCanOverride(can, i);
        return;
      }

      const heroScale = (isMobile ? CAROUSEL_CONFIG.heroScaleMobile : CAROUSEL_CONFIG.heroScale) * this.heroFit;
      const ringRadius = isMobile ? CAROUSEL_CONFIG.ringRadiusMobile : CAROUSEL_CONFIG.ringRadius;
      const heroWeight = Math.max(0, 1 - stepDist * 1.15);
      const heroWeightSmooth = smooth(heroWeight);

      // Position on a shallow, symmetric arc; cans past the visible slots shrink away.
      const theta = x / ringRadius;
      const ringX = Math.sin(theta) * ringRadius;
      // as in the reference the ring curves toward the viewer at its edges (concave): side cans come a little closer
      // instead of receding, so the line-up wraps around the camera
      const ringZ = (1 - Math.cos(theta)) * ringRadius * (isMobile ? 0 : 0.45) + (Math.cos(theta) - 1) * ringRadius * (isMobile ? 1 : 0);
      const visibleSlots = isMobile ? CAROUSEL_CONFIG.visibleSlotsMobile : CAROUSEL_CONFIG.visibleSlots;
      const edge = Math.min(1, Math.max(0, (visibleSlots + 0.45 - stepDist) / 0.9));
      const edgeFade = smooth(edge);
      const ringArc = (isMobile ? CAROUSEL_CONFIG.ringArcMobile : CAROUSEL_CONFIG.ringArc) * Math.min(stepDist, isMobile ? 3 : visibleSlots) ** 2;
      // tilted ring: lower left of centre, higher right of it, level again at the edges (signed slots)
      const ringWave = (isMobile ? CAROUSEL_CONFIG.ringWaveMobile : CAROUSEL_CONFIG.ringWave) *
        Math.sin((Math.PI * x) / (this.carousel.spacing * CAROUSEL_CONFIG.ringWaveSlots)) * (1 - heroWeightSmooth);
      // neighbours a little smaller than the centre can (a product wall, as in the reference)
      const neighbourScale = CAROUSEL_CONFIG.neighbourScale + (1 - CAROUSEL_CONFIG.neighbourScale) * heroWeightSmooth;
      let canScale = heroScale * neighbourScale * (0.75 + 0.25 * edgeFade);
      // optional per-can jitter in height and lean (stable per can); off on desktop, where the fan is one clean line
      const scatter = (1 - heroWeightSmooth) * (isMobile ? CAROUSEL_CONFIG.scatterMobile : CAROUSEL_CONFIG.scatter);
      const scatterY = Math.sin(i * 2.37 + 0.8) * 0.3 * scatter;
      const scatterRoll = Math.sin(i * 1.71 + 2.1) * 0.22 * scatter;
      // The dive out of the ring (hero → flavor), scrubbed by the scroll. The focused can collapses onto the next
      // pose and lands on it exactly where the single-can layout takes over (wave 0.15), so there is no hand-off jump.
      // The neighbours keep their ring pose and the ring opens: they sweep outward and past the camera instead of
      // switching off, as in the reference.
      const isFocusCan = p > 0.4;
      const collapse = Math.min(1, Math.max(0, (1 - this.data.wave) / 0.85));
      const ringK = isFocusCan ? 1 - collapse : 1;
      let canPosX = ringX * ringK;
      let canPosY = (CAROUSEL_CONFIG.yBase + (isMobile ? 0.7 : 0) + this.heroLift + ringArc + ringWave + scatterY) * ringK;
      let canPosZ = (ringZ + CAROUSEL_CONFIG.heroLift * heroWeightSmooth - (1 - edgeFade) * 3) * ringK;

      const pitch = CAROUSEL_CONFIG.pitchNeighbour + (CAROUSEL_CONFIG.pitchX - CAROUSEL_CONFIG.pitchNeighbour) * heroWeightSmooth;
      let canRotX = pitch * ringK;
      let canRotY = (CAROUSEL_CONFIG.yawHeroY + theta * CAROUSEL_CONFIG.labelTurn * (1 - heroWeightSmooth)) * ringK;
      let canRotZ = (CAROUSEL_CONFIG.rollZ * heroWeightSmooth + Math.sin(theta) * CAROUSEL_CONFIG.neighbourLean + scatterRoll) * ringK;
      // Each side can tumbles on its own, as in the reference: some turn their sides or backs to the viewer and they
      // lean and pitch differently (stable per can, so the ring never jitters). The centre can stays as posed.
      const tumble = (1 - heroWeightSmooth) * ringK * (isMobile ? 0.5 : 1);
      // (a small turn only: at ±1.25 rad several cans showed their nutrition backs and the ring read as busy text)
      canRotY += Math.sin(i * 2.13 + 0.4) * 0.35 * tumble;
      canRotX += Math.sin(i * 1.37 + 1.1) * 0.16 * tumble;
      canRotZ += Math.sin(i * 0.91 + 2.6) * 0.14 * tumble;
      // scroll-speed feel: the side cans sway against a fast flick (alternating, like hanging cans in a gust), then
      // settle as the scroll comes to rest
      canRotZ += this.scrollVelocity * 0.05 * (i % 2 === 0 ? 1 : -0.7) * (1 - heroWeightSmooth);

      let targetSectionScale = this.data.canScale;
      let targetSectionPosY = this.data.canPosY;
      let targetSectionPosX = this.data.canPosX;
      if (isMobile && this.data.wave < 0.5) {
        // Phones: the dive lands on the same band fit as the single-can pose (whole, centred above the copy)
        this.fitPhoneCan(targetSectionScale, this.data.canRotX, this.data.canRotZ, this.data.canPosZ);
        targetSectionScale = this.phoneFit.scale;
        targetSectionPosY = this.phoneFit.y;
        targetSectionPosX = 0;
      } else if (!isMobile) {
        targetSectionPosX = this.fitFeatureX(targetSectionPosX);
      }

      const exodus = smooth(collapse);
      can.visible = isFocusCan || (edgeFade > 0.02 && exodus < 0.97);

      // only the focused can collapses onto the single-can pose
      const collapseBlend = isFocusCan ? collapse : 0;
      canScale += (targetSectionScale - canScale) * collapseBlend;
      canPosY += (targetSectionPosY - canPosY) * collapseBlend;
      canPosZ += (this.data.canPosZ - canPosZ) * collapseBlend;
      canPosX += (targetSectionPosX - canPosX) * collapseBlend;

      if (isFocusCan) {
        // Push-through: mid-dive the can swings toward the lens with a roll, then settles into the flavor pose.
        const swing = this.reducedMotion ? 0 : Math.sin(Math.PI * collapse);
        canPosZ += swing * 2.4;
        canRotZ -= swing * 0.24;
        canRotY += swing * 0.55;
      } else if (exodus > 0.001) {
        // The ring opens: each neighbour swings out to its side and rushes past the camera, leaning away.
        const side = x < 0 ? -1 : 1;
        canPosX += side * (2.6 + stepDist * 1.4) * exodus * 2;
        canPosY += (stepDist * 0.35 - 0.4) * exodus;
        if (!this.reducedMotion) {
          canPosZ += exodus * (7 - stepDist);
          canRotZ += side * exodus * 0.45;
          canRotY += side * exodus * 0.9;
        }
      }

      // Depth falloff: the focused can is fully lit, neighbours step into the dark.
      // neighbours step back into the dark but keep their label colour (it was a near-black silhouette, so the
      // flavors beside the hero read as unlit shapes); only the centre can is fully lit
      // (raised again: at 0.14–0.3 the wall read as dull black shapes; now every label shows its colour and art,
      // stepping down gently with distance so the centre can still leads)
      // (0.52–0.74 still read as dull, dark cans next to the hero: now they keep most of their colour and gloss)
      // (leaving neighbours sink into the dark as they rush past, so the eye stays on the diving can)
      // (the reference: side cans step down into a dim, sharp read of their colour so the lit centre can leads; at
      // 0.74–0.92 every can was equally bright and the ring read as a flat shelf)
      // (round 4: the reference's side cans are near-black silhouettes, their label colour only a faint tint, with lit
      // chrome ends; the uFocus² falloff in the shader takes 0.34 to about 12% brightness)
      const ringFocus = ((0.3 + 0.08 * Math.max(0, 1 - stepDist / 3)) * edgeFade + 0.72 * heroWeightSmooth) * (1 - 0.55 * exodus);
      const focus = Math.min(1, Math.max(ringFocus, p * collapseBlend));
      setCanFocus(can, Math.round(focus * 100) / 100);
      this.applyLabelState(can, p > 0.4);

      canRotX += this.data.canRotX * collapseBlend;
      canRotY += this.data.canRotY * collapseBlend;
      canRotZ += this.data.canRotZ * collapseBlend;
      canRotY += this.data.canSpin * p;
      canRotY += this.userTurn.yaw * p;
      canRotX += this.userTurn.pitch * p;
      canRotX -= this.scrollVelocity * 0.05 * p;
      // The focused can tilts toward the pointer.
      canRotY += this.spinOffset * p;
      canRotZ -= (this.pointer.smoothX / 1280) * this.tilt() * 0.6 * p;
      canRotX += (this.pointer.smoothY / 1280) * this.tilt() * p;

      // Per-can hover proximity: physical tilt, lift and z-push, exponentially damped.
      if (!isMobile && can.visible && this.data.wave > 0.3) {
        const dx = canPosX - this.camera.position.x - this.pointerLightTarget.x;
        const dy = canPosY - this.camera.position.y - this.pointerLightTarget.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const proximityRadius = this.carousel.spacing * 0.85;
        const rawInfluence = Math.max(0, 1 - dist / proximityRadius);
        const targetHover = this.reducedMotion ? 0 : rawInfluence * rawInfluence;
        this.canHoverInfluence[i] += (targetHover - this.canHoverInfluence[i]) * (1 - Math.exp(-8 * delta));
        const h = this.canHoverInfluence[i];
        if (h > maxHoverInfluence) {
          maxHoverInfluence = h;
          bestHoverCanIndex = i;
        }
        if (h > 0.01) {
          canRotX += -dy * 0.08 * h;
          // hover leans the can toward the pointer (no turn: the label's front stays square to the viewer)
          canRotZ -= dx * 0.03 * h;
          canPosY += h * 0.12;
          canPosZ += h * 0.35;
          canScale *= 1 + h * 0.06;
        }
      } else if (this.canHoverInfluence[i] > 0.001) {
        this.canHoverInfluence[i] *= 1 - Math.min(1, 6 * delta);
      }

      // Idle micro-breathing so cans never feel frozen.
      if (can.visible && this.data.wave > 0.3 && !this.reducedMotion) {
        const phase = this.canIdlePhase[i];
        canPosY += Math.sin(time * 0.0008 + phase) * 0.025;
        canRotZ += Math.cos(time * 0.00056 + phase) * 0.008;
      }

      if (this.introStart > -1e8) {
        const rise = this.introProgress(time, stepDist);
        // Held for the opening: the rest of the ring waits out of frame (and out of the reflections).
        if (this.introStart === Number.POSITIVE_INFINITY && this.canOverride.index !== i) can.visible = false;
        canPosY -= (1 - rise) * 7.5;
        canRotY += (1 - rise) * 2.2;
      }

      // featured-can offsets (opening, pick-up), weighted by how centred this can is
      canRotX += fo.rotX * p;
      canPosY += fo.posY * p;
      canPosZ += fo.posZ * p;
      canScale *= 1 + (fo.scale - 1) * p;

      can.position.set(canPosX, canPosY, canPosZ);
      can.rotation.set(canRotX, canRotY, canRotZ);
      can.scale.setScalar(canScale);
      this.applyCanOverride(can, i);
    });

    // Resonant chime when the pointer crosses onto another can.
    if (!isMobile && (this.data.wave > 0.3 || this.data.swirl > 0.5)) {
      if (maxHoverInfluence > 0.12 && bestHoverCanIndex !== -1) {
        if (this.lastHoveredCanIndex !== bestHoverCanIndex && time - this.lastHoverAudioTime > 80) {
          this.lastHoveredCanIndex = bestHoverCanIndex;
          this.lastHoverAudioTime = time;
          audioManager.playCanHover([330, 370, 415, 494, 554, 659][((bestHoverCanIndex % 6) + 6) % 6], 0.22);
        }
      } else if (maxHoverInfluence < 0.03) {
        this.lastHoveredCanIndex = -1;
      }
    }
    this.cans.forEach((can) => can.updateMatrixWorld(true));
  }

  /**
   * Narrower desktop frames (1024–1700 px wide) pull a side-placed feature can toward the camera axis, so the whole
   * can stays in frame beside the copy instead of running off the right edge, and move the centred flavor-intro and benefit cans
   * clear of the copy (poses are authored at 1920×920).
   */
  private fitFeatureX(x: number) {
    // cap the can's offset from the camera axis to a share of the frame's half-width (benefit poses sit well inside it)
    const maxOffset = 4.2 * Math.min(1, this.camera.aspect / 1.9);
    const offset = x - this.data.camPosX;
    // The big centred cans of the flavor intro and the first three benefit chapters lean over the copy on frames
    // narrower than 1920×920: slide them right as the frame narrows (blended in from the hero, out toward Zamzam).
    const p = this.sectionPosition;
    const profileWeight = Math.min(1, Math.max(0, p)) * Math.min(1, Math.max(0, 5 - p));
    const narrowShift = Math.max(0, 1.9 - this.camera.aspect) * 3.8 * profileWeight;
    return this.data.camPosX + Math.sign(offset) * Math.min(Math.abs(offset), maxOffset) + narrowShift;
  }

  private applyCanOverride(can: THREE.Group, index: number) {
    const o = this.canOverride;
    if (o.index !== index || o.blend <= 0.001) return;
    can.visible = true;
    can.position.lerp(o.position, o.blend);
    this.overrideEuler.set(
      THREE.MathUtils.lerp(can.rotation.x, o.rotation.x, o.blend),
      THREE.MathUtils.lerp(can.rotation.y, o.rotation.y, o.blend),
      THREE.MathUtils.lerp(can.rotation.z, o.rotation.z, o.blend)
    );
    can.rotation.copy(this.overrideEuler);
    can.scale.setScalar(THREE.MathUtils.lerp(can.scale.x, o.scale, o.blend));
    setCanFocus(can, 1);
  }

  /**
   * Product page pose: one large can, left of the purchase panel on desktop and above it on narrow
   * screens. Blends in from the captured home transforms.
   */
  private renderProduct(delta: number, time: number) {
    const isNarrow = window.innerWidth < 1024;
    // Phones: once the stage has scrolled away with the hero (the can lifts off the top), there is nothing moving to
    // draw behind the facts and reviews. Draw a few frames so the can clears the frame, then hold the last one until
    // the stage scrolls back (no GPU work, no battery, while reading). A pack still assembling keeps drawing.
    if (isNarrow && this.productScroll > 1.25 && !this.pack?.isAnimating) {
      this.offstageFrames += 1;
      if (this.offstageFrames > 4) return;
    } else {
      this.offstageFrames = 0;
    }
    const viewerBlend = 1 - Math.exp(-8 * delta);
    const rotation = this.productViewerRotation;
    if (this.productSpin !== 0) {
      rotation.targetY += this.productSpin * delta;
      this.productSpin *= Math.exp(-2.2 * delta);
      if (Math.abs(this.productSpin) < 0.05) this.productSpin = 0;
    }
    rotation.x += (rotation.targetX - rotation.x) * viewerBlend;
    rotation.y += (rotation.targetY - rotation.y) * viewerBlend;
    this.productViewTurn.value += (this.productViewTurn.target - this.productViewTurn.value) * viewerBlend;

    this.routeBlend += (1 - this.routeBlend) * damp(MOTION_RATE.settle, delta);
    const eased = smooth(this.routeBlend);

    // Same lens as the home scene so the can keeps its scale while travelling.
    // product page: the same grey product studio as the home page (no night ridge), the flavor colour pooled at the
    // floor, and the can standing over its own reflection
    const wide = !isNarrow;
    const widePose = PRODUCT_POSE;
    const halfWidth = Math.tan(THREE.MathUtils.degToRad(PRODUCT_CAMERA.fov / 2)) * PRODUCT_CAMERA.z * this.camera.aspect;
    const wideX = (PRODUCT_STAGE_CENTRE * 2 - 1) * halfWidth;
    const canFoot = (CAN.shellHeight / 2 + CAN.bottomHeight) * widePose.scale * 1.02;
    Object.assign(this.data, { camRotX: 0.04, camRotY: 0, camRotZ: 0, floorY: wide ? widePose.y - canFoot - 0.25 : -3.4, reflect: 0.45, mountains: 0, moon: 0, mistFg: 0.2, glow: 1, stars: 0, wave: 0, swirl: 0, labelDim: 0, field: 0, studio: 1 });
    this.camera.fov = PRODUCT_CAMERA.fov;
    this.camera.updateProjectionMatrix();
    this.tmpVector.set(PRODUCT_CAMERA.x, PRODUCT_CAMERA.y, PRODUCT_CAMERA.z);
    this.camera.position.lerpVectors(this.routeCameraFrom, this.tmpVector, eased);
    this.camera.rotation.set(this.data.camRotX, 0, 0);

    this.widePose.x = wideX; // reused object: no allocation per frame
    const pose = isNarrow ? this.narrowPose ?? PRODUCT_POSE_NARROW : this.widePose;
    const sway = this.reducedMotion ? 0 : Math.sin(time * 0.0006) * 0.03;
    const scrollLift = isNarrow ? this.productScroll * 7 : smooth(this.productExit) * 11;
    this.tmpEuler.set(pose.rotX + rotation.x, pose.rotY + rotation.y + sway, pose.rotZ);
    this.tmpQuaternion.setFromEuler(this.tmpEuler);
    const flavor = FLAVORS[this.activeProductIndex];
    this.updateAccent(this.previewIndex < 0 ? this.activeProductIndex : this.previewIndex, time);
    // product page: the back light keeps only a touch of the flavor colour (no coloured glow round the can)
    this.rimTint.copy(this.rimBase).lerp(this.glowColor, 0.2);
    this.rimLight.color.lerp(this.rimTint, damp(MOTION_RATE.reveal, delta));
    this.keyLight.position.set(pose.x - 4.2, pose.y + 4.6, 3.6);
    this.keyLight.target.position.set(pose.x, pose.y, 0);
    this.keyLight.target.updateMatrixWorld();
    this.baseFill.intensity = 0.18;

    // The chosen pack takes the hero can's place once the can has arrived: the can steps out, the pack assembles.
    // An open label hotspot brings the single can back (its lit label block is what the hotspot points at).
    const pack = this.ensurePack();
    const shownIndex = this.previewIndex < 0 ? this.activeProductIndex : this.previewIndex;
    pack.setFlavorLabel(shownIndex, this.labels.get(shownIndex));
    pack.setProductFlavor(shownIndex, FLAVORS[shownIndex].theme.secondary, FLAVORS[shownIndex].name);
    pack.update(delta, this.routeBlend > 0.9 && this.benefitGlowIndex < 0 ? this.productPackCount : 1, this.reducedMotion);
    if (pack.isAnimating) this.lastActivityAt = performance.now();
    if (pack.group.visible) {
      // the pack fits between the hotspot dots (left) and the purchase panel (wide) or the screen edge (narrow),
      // as fractions of the screen width
      const left = isNarrow ? 0.17 : 0.175;
      const right = isNarrow ? 0.83 : 0.535;
      const packX = (left + right - 1) * halfWidth;
      const width = (right - left) * 2 * halfWidth;
      const height = pose.scale * (CAN.shellHeight + CAN.topHeight + CAN.bottomHeight) * (isNarrow ? 0.9 : 0.86);
      // the pack turns with the visitor's drag, not with the can's front / back panel turns
      pack.place(packX, pose.y + scrollLift + sway * 2, pose.z, rotation.y - this.productViewTurn.value + sway, rotation.x, width, height);
    }
    const hero = smooth(pack.heroPresence);

    this.cans.forEach((can, i) => {
      const from = this.routeFrom[i];
      if (i === this.productCanIndex) {
        can.visible = hero > 0.01;
        this.tmpVector.set(pose.x, pose.y + scrollLift + sway * 2 - (1 - hero) * 1.6, pose.z);
        can.position.lerpVectors(from.position, this.tmpVector, eased);
        can.quaternion.slerpQuaternions(from.quaternion, this.tmpQuaternion, eased);
        const fromScale = from.scale || pose.scale * 0.85;
        can.scale.setScalar((fromScale + (pose.scale - fromScale) * eased) * (0.35 + 0.65 * hero));
        setCanFocus(can, 1);
        // Label hotspots light one benefit block, with the rest of the label dimmed a little.
        const glowTarget = this.benefitGlowIndex >= 0 ? 1 : 0;
        this.benefitGlowStrength += (glowTarget - this.benefitGlowStrength) * damp(MOTION_RATE.emphasize, delta);
        const surface = getCanSurface(can);
        if (surface) {
          surface.uLabelDim.value = this.benefitGlowStrength * 0.55;
          surface.uGlowStrength.value = this.benefitGlowStrength;
          surface.uGlowColor.value.set(flavor.theme.secondary);
          surface.uGlowRect.value.copy(this.glowRect);
        }
      } else {
        // The rest of the ring clears out quickly so the featured can travels alone.
        const scale = from.scale * Math.max(0, 1 - eased * 3);
        can.visible = scale > 0.01;
        if (can.visible) {
          setCanFocus(can, Math.round(Math.max(0, 0.1 - eased) * 100) / 100);
          can.scale.setScalar(scale);
        }
      }
      can.updateMatrixWorld(true);
    });
    this.reflections?.update(this.cans, this.data.floorY, this.data.reflect, this.reducedMotion);
    this.updateStage(time, this.cans[this.productCanIndex]);
    this.post?.setFocus(this.focusScreen.x, this.focusScreen.y, 0.18);
    this.renderScene(time);
  }

  // ───────────────────────── teardown ─────────────────────────

  public dispose() {
    this.disposed = true;
    this.deferredHandles.forEach((handle) => {
      window.clearTimeout(handle);
      (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(handle);
    });
    if (this.reqId) cancelAnimationFrame(this.reqId);
    window.clearTimeout(this.pickTimer);
    window.clearTimeout(this.envTimer);
    this.removeEngagedListeners();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMoveDrag);
    this.canvas.removeEventListener('pointerup', this.onPointerUpDrag);
    this.canvas.removeEventListener('pointercancel', this.onPointerUpDrag);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.moments.forEach((moment) => moment.dispose());
    this.reflections?.dispose();
    this.pack?.dispose();
    this.stage.dispose();
    this.post?.dispose();
    this.labels.dispose();
    this.scene.environment?.dispose();
    this.cans.forEach(disposeCanMaterials);
    disposeCanGeometry();
    this.renderer.dispose();
    delete (window as unknown as { __GRIZZLY_SCENE__?: SceneManager }).__GRIZZLY_SCENE__;
  }
}

/** Ease-out with one small bounce: a can landing on the floor. */
function landing(t: number) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

/**
 * Finale lineup, as in the reference: one tight, twisting row of every can (two of each flavor), packed can to can
 * at nearly one size along its length, low at the left (showing bottoms) and high at the right (showing lids), each
 * can leaning square to the row. The active flavor lands near the middle. `delay` staggers the drop, left to right.
 */
const LINEUP_SLOTS = Array.from({ length: 12 }, (_, k) => {
  const t = k - 5.5;
  return {
    x: t * 1.68,
    y: 1.0 + t * 0.36 - 0.014 * t * t, // rising, flattening toward the far end
    z: 0.8 - t * 0.25,
    rotX: -0.6 + (k / 11) * 1.2, // (±0.8 swung tilted bottoms into the neighbouring can)
    rotY: -0.3,
    rotZ: 0.22,
    delay: (k / 11) * 0.6,
  };
});
