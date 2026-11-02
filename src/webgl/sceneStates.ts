import { CAROUSEL_CONFIG } from './sceneManagerConfig';
import { LABEL } from '../data/brand';

export type SceneMode = 'hero-carousel' | 'feature-editorial' | 'range';

export interface SceneStateConfig {
  camera: { posX: number; posY: number; posZ: number; fov: number; rotX: number; rotY: number; rotZ: number };
  product: { scale: number; posX: number; posY: number; posZ: number; rotX: number; rotY: number; rotZ: number; spin: number };
  lighting: {
    pointerInfluence: number;
    /** Benefit chapters darken the printed label so only the glowing block reads. */
    labelDim?: number;
  };
  stage: {
    floorY: number;
    reflect: number;
    mountains: number;
    moon: number;
    mistFg: number;
    glow: number;
    stars: number;
    /** 0 night stage, 1 full-bleed flavor colour field. */
    field: number;
    /** 0 night stage, 1 neutral grey product studio. */
    studio: number;
  };
  spacing: number;
  /** 1 = hero ring, 0 = single featured can. */
  wave: number;
  /** 1 = the finale lineup. */
  swirl: number;
}

const DEG = Math.PI / 180;

/**
 * One lens for the page (fov 20 at z 29: one world unit ≈ 90 px at 1920×920). Each section then
 * moves the camera on purpose: a slow low-angle hero, a sideways orbit into the flavor intro,
 * a push toward the label through the benefits, a pull-back for the lineup.
 */
const cam = (posX: number, posY: number, posZ: number, rotX = 0, rotY = 0, rotZ = 0) => ({ posX, posY, posZ, fov: 20, rotX, rotY, rotZ });

const LIGHT = { pointerInfluence: 0.15 };

// The reference never leaves the studio: no night sky, mountains, moon or stars anywhere on the page. Every section is
// the grey product studio or a flavor colour field.
const STAGE = { floorY: -3.6, reflect: 1, mountains: 0, moon: 0, mistFg: 0.7, glow: 1, stars: 0, field: 0, studio: 1 };
/** Close-ups fill the frame with label: the night recedes to a faint glow. */
/** Close-ups leave the night for the flavor's own colour field (the can is the only object). */
const STAGE_CLOSE = { floorY: -9, reflect: 0, mountains: 0, moon: 0, mistFg: 0.15, glow: 1.15, stars: 0, field: 0.85, studio: 0 };

/**
 * Benefit poses come from the label layout: the can turns so the right panel's centre faces the camera (u = 0.5
 * faces it at rotY 0, u grows to the right). The whole can stays in frame, lid to base, beside the copy (at 2.4 the
 * close-ups cut it off at the top and bottom of the screen); the lit block reads down the full can, chapter by chapter.
 */
const BENEFIT_SCALE = 1.6;
const panelCentreU = (LABEL.panels.right[0] + LABEL.panels.right[1]) / 2;
const BENEFIT_ROT_Y = (0.5 - panelCentreU) * Math.PI * 2;

/**
 * One dark can, whole and leaning beside the copy, the chapter's lit block in view. All four chapters, Zamzam
 * included, share this pose; the can settles a little lower each chapter, so it moves with the scroll, never
 * against it, while the lit block reads down the label.
 */
const benefit = (rotZ: number, chapter: number): SceneStateConfig => {
  const posY = -0.05 - chapter * 0.12;
  return {
    camera: cam(0, 0, 27, 0, 0, 0),
    product: { scale: BENEFIT_SCALE, posX: 0.35, posY, posZ: 0, rotX: 7 * DEG, rotY: BENEFIT_ROT_Y, rotZ, spin: 0 },
    lighting: { ...LIGHT, pointerInfluence: 0, labelDim: 1 },
    stage: STAGE_CLOSE,
    spacing: CAROUSEL_CONFIG.spacing,
    wave: 0,
    swirl: 0,
  };
};

export const SCENE_STATES: Record<string, SceneStateConfig> = {
  // Hero: the ring of cans hangs in cold air over a wet floor; the focused can is ~55% of the viewport height.
  hero: {
    camera: cam(0, -0.3, 29, 0.045),
    product: {
      scale: CAROUSEL_CONFIG.heroScale,
      posX: 0,
      posY: CAROUSEL_CONFIG.yBase,
      posZ: 0,
      rotX: CAROUSEL_CONFIG.pitchX,
      rotY: CAROUSEL_CONFIG.yawHeroY,
      rotZ: CAROUSEL_CONFIG.rollZ,
      spin: 0,
    },
    lighting: LIGHT,
    stage: { ...STAGE, studio: 1, mistFg: 0.2 },
    spacing: CAROUSEL_CONFIG.spacing,
    wave: 1,
    swirl: 0,
  },

  // Flavor intro: one big can, whole from lid to base and leaning ~20°, beside the copy on the left with the
  // scattered flavor letters behind it. (At 2.5 its base ran off the bottom edge and only half the can showed.)
  profile: {
    camera: cam(0, 0.2, 27, 0.03, 0, 0),
    product: { scale: 1.6, posX: 0.7, posY: 0.55, posZ: 0, rotX: 8 * DEG, rotY: -0.38, rotZ: 20 * DEG, spin: 0 },
    lighting: { ...LIGHT, pointerInfluence: 0.12 },
    // no floor: the can floats in its colour field
    stage: { ...STAGE, floorY: -9, reflect: 0, mistFg: 0.2, stars: 0, field: 1 },
    spacing: CAROUSEL_CONFIG.spacing,
    wave: 0,
    swirl: 0,
  },

  // Benefits: the whole can, a little lower each chapter as the lit block reads down the label.
  benefit01: benefit(12 * DEG, 0),
  benefit02: benefit(9 * DEG, 1),
  benefit03: benefit(11 * DEG, 2),
  // Zamzam: the same close-up as the other benefits, its block lit (the dawn light and rosette of
  // moments/zamzamPool.ts glow behind the can).
  benefit04: benefit(10 * DEG, 3),

  // The tagline: an upright can in front of the giant headline.
  argument: {
    camera: cam(0, 0.4, 28, -0.02),
    // Was 1.45: the can read as a small object in front of the giant headline. Now it fills about 75% of the
    // frame height, with its top clear of the header.
    // (1.65 at -0.4 clipped the base at the bottom edge: the whole can now stands in frame)
    // rotY −0.25: the label's front faces the camera with a slight turn (+0.26 showed the nutrition side)
    product: { scale: 1.55, posX: 0, posY: 0.05, posZ: 0, rotX: 5 * DEG, rotY: -0.25, rotZ: 5 * DEG, spin: 0 },
    lighting: LIGHT,
    stage: { ...STAGE, floorY: -3.4, mistFg: 0.35, field: 1, studio: 0 },
    spacing: CAROUSEL_CONFIG.spacing,
    wave: 0,
    swirl: 0,
  },

  // Finale: every can on one tight, twisting row in the grey studio (no floor reflection).
  range: {
    // closer than before (z 32): as in the reference, the row runs past both edges of the frame
    camera: cam(0, 0.3, 28.5, 0.02),
    product: { scale: 1.04, posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, spin: 0 },
    lighting: { ...LIGHT, pointerInfluence: 0 },
    stage: { ...STAGE, floorY: -2.3, reflect: 0, mistFg: 0.2, glow: 0.4, studio: 1 },
    spacing: CAROUSEL_CONFIG.spacing,
    wave: 0,
    swirl: 1,
  },

  // FAQ, as in the reference: the camera sinks below the row, so the cans hang along the top of the frame over the
  // grey studio and the giant FAQ title.
  faq: {
    camera: cam(0, -3.6, 28.5, 0.02), // the cans' lower halves hang into the top of the frame
    product: { scale: 1.12, posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, spin: 0 },
    lighting: { ...LIGHT, pointerInfluence: 0 },
    stage: { ...STAGE, floorY: -2.3, reflect: 0, glow: 0.2, mistFg: 0.45 },
    spacing: CAROUSEL_CONFIG.spacing,
    wave: 0,
    swirl: 1,
  },

  // Newsletter / footer: the camera keeps sinking and the row leaves the frame: an empty grey studio.
  newsletter: {
    camera: cam(0, -16, 32, 0.02),
    product: { scale: 1.12, posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, spin: 0 },
    lighting: { ...LIGHT, pointerInfluence: 0 },
    stage: { ...STAGE, floorY: -2.3, reflect: 0, glow: 0.1, mistFg: 0.9 },
    spacing: CAROUSEL_CONFIG.spacing,
    wave: 0,
    swirl: 1,
  },
};

/**
 * One source of truth for the home scroll story: each DOM section id maps to a
 * scene state. Waypoint k sits at timeline progress k / (n - 1).
 */
export const SCENE_SEQUENCE: ReadonlyArray<{ sectionId: string; state: keyof typeof SCENE_STATES }> = [
  { sectionId: 'gamme', state: 'hero' },
  { sectionId: 'profile', state: 'profile' },
  { sectionId: 'benefits-1', state: 'benefit01' },
  { sectionId: 'benefits-2', state: 'benefit02' },
  { sectionId: 'benefits-3', state: 'benefit03' },
  { sectionId: 'benefits-4', state: 'benefit04' },
  { sectionId: 'argument', state: 'argument' },
  { sectionId: 'full-gamme', state: 'range' },
  { sectionId: 'FAQ', state: 'faq' },
  { sectionId: 'newsletter', state: 'newsletter' },
  // The loop, as in the reference: past the footer the scene flows back into the hero ring, and at the very bottom
  // the page wraps to the top (useSmoothScroll), where the frame is identical, so the story starts again seamlessly.
  { sectionId: 'loop', state: 'hero' },
];
