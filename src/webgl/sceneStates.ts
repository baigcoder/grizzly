import { CAROUSEL_CONFIG } from './sceneManagerConfig';
import { LABEL } from '../data/brand';
import { CAN } from './canDimensions';

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
 * Benefit chapters, as in the reference: the camera sits at z 12, a little below and rolled (-10° then +5°, alternating),
 * looking up 10°; the can stands at scale 1, centred, and the label turns to the benefits panel (10° further every other
 * chapter). The reference slides the can up 1.3 units over the four chapters while a fixed spotlight stays put; here the
 * can slides so each chapter's lit block (LABEL.benefitBlocks) comes to that same spot, whatever the label art.
 * Scrubbed by the scroll, power1.inOut between chapters.
 */
const BENEFIT_SPOT_Y = 0.46; // where the lit block sits in the frame (world units above the camera axis, can at scale 1)
const panelCentreU = (LABEL.panels.right[0] + LABEL.panels.right[1]) / 2;
const BENEFIT_ROT_Y = (0.5 - panelCentreU) * Math.PI * 2;
/** The label's front panel faces the camera at this yaw (u = frontCenterU at the centre). */
const FRONT_YAW = (0.5 - LABEL.frontCenterU) * Math.PI * 2;

const benefit = (chapter: number): SceneStateConfig => {
  const [, v0, , v1] = LABEL.benefitBlocks[chapter];
  const posY = BENEFIT_SPOT_Y - ((v0 + v1) / 2 - 0.5) * CAN.shellHeight;
  return {
    camera: { posX: 0, posY: -2, posZ: 12, fov: 20, rotX: 10 * DEG, rotY: 0, rotZ: (chapter % 2 === 0 ? -10 : 5) * DEG },
    product: { scale: 1, posX: 0, posY, posZ: 0, rotX: 0, rotY: BENEFIT_ROT_Y + (chapter % 2) * 10 * DEG, rotZ: 0, spin: 0 },
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

  // Flavor intro ("taste" in the reference): the camera comes in close (z 6, a 40 degree lens), so the can fills the frame
  // from above, leaning back 37.5 and rolled 22.5, its label turned 15 degrees; scale 1, a little right of and below centre.
  profile: {
    camera: { posX: 0, posY: 0, posZ: 6, fov: 40, rotX: 0, rotY: 0, rotZ: 0 },
    product: { scale: 1, posX: 0.5, posY: -0.5, posZ: 0, rotX: -37.5 * DEG, rotY: FRONT_YAW + 15 * DEG, rotZ: 22.5 * DEG, spin: 0 },
    lighting: { ...LIGHT, pointerInfluence: 0.12 },
    // no floor: the can floats in its colour field
    stage: { ...STAGE, floorY: -9, reflect: 0, mistFg: 0.2, stars: 0, field: 1 },
    spacing: CAROUSEL_CONFIG.spacing,
    wave: 0,
    swirl: 0,
  },

  // Benefits: the whole can, a little lower each chapter as the lit block reads down the label.
  benefit01: benefit(0),
  benefit02: benefit(1),
  benefit03: benefit(2),
  // Zamzam: the same close-up as the other benefits, its block lit (the dawn light and rosette of
  // moments/zamzamPool.ts glow behind the can).
  benefit04: benefit(3),

  // The tagline ("no bullshit"): the camera pulls back to z 8 on a 45 degree lens, the can behind the plane a little
  // (z -0.5), leaning back 20 and rolled -5, in front of the giant headline.
  argument: {
    camera: { posX: 0, posY: 0, posZ: 8, fov: 45, rotX: 0, rotY: 0, rotZ: 0 },
    product: { scale: 1, posX: 0, posY: 0, posZ: -0.5, rotX: -20 * DEG, rotY: FRONT_YAW, rotZ: -5 * DEG, spin: 0 },
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
