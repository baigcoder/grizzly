import * as THREE from 'three';
import { CAN, LID_Y, TAB_PIVOT } from './can/canGeometry';
import { BENEFIT_RECTS, FLAVORS, FRONT_U, HALAL_RECT } from './data';
import { clamp, inCubic, inExpo, inOutCubic, inOutQuint, lerp, outCubic, outExpo, range, smooth } from './ease';
import { FLOOR_Y, type CanRig, type FilmScene } from './scene';
import { BENEFIT_SLOT, DURATION, FLAVOR_SLOT, T, benefitAt, flavorAt, lightAt } from './timeline';

export { DURATION };

/**
 * The 3D plate, shot by shot (see timeline.ts for the cue sheet and brag-output/brag-plan.md for the storyboard).
 * Every value is a pure function of time, so motion blur can sample between frames.
 *
 *  0  Hook     night stage, the can a silhouette; the bear roars up behind it in a flash
 *  3  Reveal   light sweep, the can turns to its front in front of the giant GRIZZLY / ENERGY
 *  6  Build    product studio: base, body, label printing on, lid, tab, each landing on a beat
 * 12  Flavors  six colour-field chapters; spin-swap under the site's colour wave; a new angle each time
 * 30  Inside   close on the label's benefit blocks (the site's spotlight shader)
 * 36  Zamzam   the site's Zamzam pool at first light
 * 39  Halal    the halal badge
 * 41  Crack    the tab cracks: mist burst, spray, condensation
 * 44  Finale   the six cans in the site's diagonal ribbon, lighting up one by one
 */

const faceU = (u: number) => Math.PI - Math.PI * 2 * u;
const FRONT = faceU(FRONT_U);
const BENEFIT_U = 0.86;
const HALAL_U = 0.778;
const TAU = Math.PI * 2;
/** Rig index of the spare Blue Raspberry can used in the finale (the hero one has been opened by then). */
const SPARE_BLUE = 6;

interface Shot {
  target: THREE.Vector3;
  h: number;
  w: number;
  elev: number;
  azim: number;
  roll: number;
  lensX: number;
  lensY: number;
}

export interface Frame {
  portrait: boolean;
  /** Screen anchors (pixels) for the type layer: build callouts. */
  anchors: Record<string, [number, number]>;
  /** Sub-frames to average for this frame (motion blur). */
  samples: number;
}

const v3 = new THREE.Vector3();
const v3b = new THREE.Vector3();
const col = new THREE.Color();

/** Deterministic camera shake: a few sines, decaying from `at` over `len` seconds. */
function shake(t: number, at: number, len: number, amp: number) {
  const k = t - at;
  if (k < 0 || k > len) return 0;
  const env = Math.exp(-k * (5 / len));
  return amp * env * (Math.sin(k * 61) * 0.6 + Math.sin(k * 37 + 1.3) * 0.4);
}

/** A part dropped from `h` that lands at `land` after `dur` seconds (gravity), with a small settle. */
function drop(t: number, land: number, dur: number, h: number) {
  const k = range(t, land - dur, land);
  if (k < 1) return h * (1 - k * k);
  const s = t - land;
  return 0.06 * h * Math.exp(-s * 14) * Math.abs(Math.sin(s * 30)) * 0.4;
}

export class Director {
  private readonly cam: THREE.PerspectiveCamera;
  private readonly tabBase = TAB_PIVOT.clone();
  private envKey = '';
  readonly frame: Frame;
  /** Giant type behind the product, placed after the camera (so it is framed exactly and never cropped). */
  private typeReq: { lines: string[]; style: 'fill' | 'outline'; frac: number; opacity: number; x: number; y: number; depth: number; color: number } | null = null;
  private readonly shot: Shot = { target: new THREE.Vector3(), h: 6, w: 3, elev: 0, azim: 0, roll: 0, lensX: 0, lensY: 0 };

  constructor(private readonly s: FilmScene) {
    this.cam = s.camera;
    this.frame = { portrait: s.height > s.width, anchors: {}, samples: 3 };
  }

  /** Motion-blur sub-frames for time t: dense on whips, spins and landings, light everywhere else. */
  samplesAt(t: number) {
    const fast: Array<[number, number]> = [
      [T.roar - 0.1, T.roar + 0.5],
      [5.6, 6.15],
      [6.2, 7.1],
      [T.printFrom, T.printTo],
      [9.2, 10.2],
      [11.4, 12.4],
      ...[1, 2, 3, 4, 5].map((i) => [flavorAt(i) - 0.45, flavorAt(i) + 0.45] as [number, number]),
      [T.inside - 0.5, T.inside + 0.6],
      [T.zamzam - 0.4, T.zamzam + 0.3],
      [T.halal - 0.4, T.halal + 0.4],
      [T.crack - 0.4, T.crack + 0.5],
      [T.pop - 0.1, T.pop + 0.6],
      [43.2, 44.3],
    ];
    return fast.some(([a, b]) => t >= a && t <= b) ? 10 : 3;
  }

  private reset() {
    const s = this.s;
    s.rigs.forEach((rig) => {
      const { can, surface } = rig;
      can.visible = false;
      can.position.set(0, 0, 0);
      can.rotation.set(0, FRONT, 0);
      can.scale.setScalar(1);
      ['Top', 'Bottom', 'Shell'].forEach((n) => {
        const o = can.getObjectByName(n)!;
        o.position.set(0, 0, 0);
        o.visible = true;
      });
      const parts = s.parts(rig);
      parts.tabPivot.position.copy(this.tabBase);
      parts.tabPivot.rotation.set(0, 0, 0);
      parts.tabPivot.visible = true;
      parts.opening.visible = false;
      surface.uReveal.value = 1;
      surface.uLabelDim.value = 0;
      surface.uGlowStrength.value = 0;
      surface.uWet.value = 0;
      s.setFocus(rig, 1);
    });
    const p = s.stageParams;
    p.moon = 1;
    p.mountains = 1;
    p.mist = 1;
    p.mistFg = 0.5;
    p.burst = 0;
    p.water = 0;
    p.flash = 0;
    p.glow = 1;
    p.stars = 1;
    p.field = 0;
    p.studio = 0;
    p.wipe = 1;
    s.bear.set(FLAVORS[0].slug, 0xffffff, 0, 0, 0, 1);
    s.zamzam.mesh.visible = false;
    s.typeBack.material.opacity = 0;
    s.typeBack.mesh.visible = false;
    s.sweep.intensity = 0;
    s.key.intensity = 1.05;
    s.fill.intensity = 0.18;
    s.rim.intensity = 2.6;
    s.baseFill.intensity = 0.12;
    s.post.setFocus(0.5, 0.5, 0);
    s.updateSpray(-1, v3, 0xffffff);
    s.reflect = 1;
    const shot = this.shot;
    shot.azim = 0;
    shot.roll = 0;
    shot.lensX = 0;
    shot.lensY = 0;
    shot.w = 3;
    this.frame.anchors = {};
    this.typeReq = null;
  }

  /** Shows a can: position, spin about its own axis, then lean (z) and pitch (x). */
  private pose(rig: CanRig, x: number, y: number, z: number, spin: number, lean = 0, pitch = 0) {
    rig.can.visible = true;
    rig.can.position.set(x, y, z);
    rig.can.rotation.set(pitch, spin, lean);
  }

  private accent(hex: string, prev?: string) {
    const p = this.s.stageParams;
    p.accent.set(hex);
    p.accentPrev.set(prev ?? hex);
  }

  /** The flavor chapters' camera: a different angle per chapter (index 6 = the benefit close-up's arrival). */
  private chapterShot(i: number, local: number) {
    const P = this.frame.portrait;
    const angles = [
      { elev: 4, azim: -12, drift: 6, h: 6.5, roll: 0 },
      { elev: -7, azim: 12, drift: 5, h: 6.0, roll: -2.5 },
      { elev: 15, azim: -20, drift: 7, h: 6.6, roll: 0 },
      { elev: 2, azim: 20, drift: -7, h: 5.6, roll: 3 },
      { elev: -3, azim: -6, drift: 10, h: 6.2, roll: 0 },
      { elev: 9, azim: 4, drift: -10, h: 6.0, roll: -2 },
    ][i];
    return {
      elev: angles.elev,
      azim: angles.azim + angles.drift * (local / FLAVOR_SLOT),
      h: (angles.h - 0.25 * (local / FLAVOR_SLOT)) * (P ? 1.3 : 1),
      roll: angles.roll,
    };
  }

  update(t: number) {
    const s = this.s;
    const P = this.frame.portrait;
    const p = s.stageParams;
    const shot = this.shot;
    this.reset();
    p.time = t;
    let env: string | null = null;
    let horizonDepth = 30;

    if (t < T.build) {
      // ── HOOK + REVEAL: night stage, the Blue Raspberry can ──
      const rig = s.rigs[0];
      const f = FLAVORS[0];
      this.accent(f.accent);
      env = f.accent;
      const turn = inOutCubic(range(t, T.reveal, T.reveal + 2.4));
      const whip = inExpo(range(t, 5.55, 6.0));
      this.pose(rig, 0, 0.15, 0, FRONT + 0.7 - 0.12 * t * (1 - turn) - 0.55 * turn + TAU * whip, -0.06 - 0.06 * turn, 0);
      const silhouette = smooth(range(t, T.roar, T.roar + 0.4)) * 0.3;
      const lit = smooth(range(t, T.reveal, T.reveal + 1.2));
      s.setFocus(rig, Math.max(0.08 + silhouette * 1.4, lit));
      s.key.intensity = 0.15 + 1.0 * lit;
      p.glow = 0.25 + 0.75 * lit;
      p.mistFg = 0.7;
      // the roar: the bear rises behind the can with a flash
      const rise = smooth(range(t, T.roar, T.roar + 0.5));
      const fade = 1 - smooth(range(t, 2.6, 3.6));
      s.bear.set(f.slug, f.accent, 0.62 * rise * fade, smooth(range(t, T.roar, T.roar + 0.6)), smooth(range(t, T.roar + 0.1, T.roar + 1.9)), 9);
      s.bear.mesh.position.set(P ? 0.4 : 1.2, 1.7, -10);
      s.bear.mesh.quaternion.copy(this.cam.quaternion);
      p.flash = Math.max(0, 1 - (t - T.roar) * 3.5) * (t >= T.roar ? 0.55 : 0) + Math.max(0, 1 - (t - 5.9) * 6) * (t >= 5.9 ? 1.2 : 0);
      // the light sweep across the can on the reveal
      const sw = range(t, T.reveal - 0.1, T.reveal + 1.6);
      s.sweep.intensity = Math.sin(Math.PI * sw) ** 2 * 3.0 + Math.max(0, 1 - (t - T.roar) * 3) * (t >= T.roar ? 3 : 0);
      s.sweep.position.set(-8 + sw * 16, 3, 6);
      // the wordmark behind the can
      const markIn = outExpo(range(t, T.reveal + 0.2, T.reveal + 1.1));
      const markOut = smooth(range(t, 5.3, 5.8));
      this.typeReq = { lines: ['GRIZZLY', 'ENERGY'], style: 'fill', frac: (P ? 0.9 : 0.74) * lerp(1.08, 1, markIn), opacity: 0.95 * markIn * (1 - markOut), x: 0, y: P ? 0.06 : 0.04, depth: 9, color: 0xffffff };
      // camera: low, close and climbing through the hook; a kick on the roar; orbiting on the reveal
      const hook = inOutCubic(range(t, 0, T.reveal + 2.5));
      shot.target.set(0, lerp(1.2, 0.35, hook), 0);
      shot.h = lerp(4.2, 6.6, hook) * (P ? 1.25 : 1) * lerp(1, 0.55, whip);
      shot.w = 3.6;
      shot.elev = lerp(-9, 3, hook);
      shot.azim = lerp(-14, 10, turn);
      shot.roll = shake(t, T.roar + 0.05, 0.7, 1.2) - 2 * (1 - hook);
      shot.target.y += shake(t, T.roar + 0.05, 0.7, 0.05);
      shot.lensY = P ? 0.08 : 0;
    } else if (t < T.flavors) {
      // ── BUILD: product studio, the can assembles part by part ──
      const rig = s.rigs[0];
      const f = FLAVORS[0];
      this.accent(f.accent);
      env = null;
      p.studio = 1;
      p.glow = 0.9;
      p.mountains = 0;
      p.stars = 0;
      p.moon = 0;
      p.mistFg = 0.15;
      p.flash = Math.max(0, 1 - (t - T.build) * 4) * 0.9;
      // the floor mirrors the finished label, so it stays dark until the can is whole
      s.reflect = smooth(range(t, T.tab, T.tab + 0.8));
      const can = rig.can;
      const bottom = can.getObjectByName('Bottom')!;
      const shell = can.getObjectByName('Shell')!;
      const top = can.getObjectByName('Top')!;
      const parts = s.parts(rig);
      bottom.position.y = drop(t, T.base, 0.5, 9);
      shell.visible = t > T.base - 0.05;
      shell.position.y = drop(t, T.body, 0.5, 10);
      const lidOff = drop(t, T.lid, 0.45, 8);
      top.visible = t > T.lid - 0.5;
      top.position.y = lidOff;
      parts.tabPivot.visible = t > T.lid - 0.5;
      parts.tabPivot.position.y = this.tabBase.y + lidOff + 0.9 * (1 - outExpo(range(t, T.tab - 0.2, T.tab)));
      parts.tabPivot.rotation.x = -1.25 * (1 - outExpo(range(t, T.tab - 0.2, T.tab + 0.15)));
      rig.surface.uReveal.value = t < T.printFrom ? 0 : inOutCubic(range(t, T.printFrom, T.printTo));
      rig.surface.uRevealColor.value.set(f.accent).multiplyScalar(1.8);
      // spin: slow, plus a full turn while the label prints, plus the whip out at the end
      const printSpin = TAU * inOutCubic(range(t, T.printFrom, T.printTo));
      const whipOut = TAU * inExpo(range(t, 11.5, 12.0));
      this.pose(rig, 0, 0, 0, FRONT - 0.6 + 0.35 * (t - T.build) + printSpin + whipOut, 0, 0);
      // a flash on every landing
      const hits = [T.base, T.body, T.lid, T.tab];
      const hit = Math.max(...hits.map((h) => (t >= h ? Math.exp(-(t - h) * 9) : 0)));
      s.sweep.intensity = hit * 3.2;
      s.sweep.position.set(0, 8, 3);
      // camera: three-quarter view from above, orbiting; a push and dive into the first colour field at the end
      const orbit = range(t, T.build, T.flavors);
      const out = inExpo(range(t, 11.3, 12.0));
      const grow = smooth(range(t, T.base, T.tab + 0.4));
      shot.target.set(0, lerp(-1.7, 0.25, grow), 0);
      shot.h = (lerp(3.0, 6.2, grow) * lerp(1, 0.5, out)) * (P ? 1.5 : 1);
      shot.w = 4;
      shot.elev = lerp(20, 10, smooth(orbit)) - 8 * out;
      shot.azim = lerp(-28, 18, inOutCubic(orbit));
      shot.lensX = P ? 0 : 0.14 * (1 - out);
      shot.lensY = P ? 0.04 : 0;
      shot.target.y += shake(t, T.body, 0.35, 0.03) + shake(t, T.lid, 0.35, 0.03);
      // callout anchors for the type layer
      can.updateMatrixWorld(true);
      this.applyCamera();
      const R = CAN.radius;
      this.frame.anchors.base = this.project(can, R * 0.9, -CAN.shellHeight / 2 - 0.1 + bottom.position.y, 0);
      this.frame.anchors.body = this.project(can, R, 0.4 + shell.position.y, 0);
      this.frame.anchors.lid = this.project(can, R * 0.85, LID_Y - 0.1 + lidOff, 0);
      this.frame.anchors.tab = this.project(can, 0.1, parts.tabPivot.position.y + 0.04, 0.2);
    } else if (t < T.inside + 0.5) {
      // ── FLAVORS: six chapters in the site's colour field ──
      const i = Math.min(5, Math.floor((t - T.flavors) / FLAVOR_SLOT));
      const local = t - flavorAt(i);
      // the next hero: flavors 1..5, then Blue Raspberry again for the close-ups
      const nextRig = i < 5 ? i + 1 : 0;
      const nextAt = flavorAt(i + 1);
      const swap = range(t, nextAt - 0.4, nextAt + 0.4);
      const into = smooth(range(t, T.flavors - 0.05, T.flavors + 0.5));
      p.field = into;
      p.studio = 1 - into;
      p.mountains = 0;
      p.moon = 0;
      p.stars = 0;
      p.mistFg = 0.2;
      p.glow = 1;
      const f = FLAVORS[i];
      const g = FLAVORS[nextRig];
      // the colour wave: from the can outward, starting just before the swap
      const wave = range(t, nextAt - 0.12, nextAt + 0.55);
      if (wave > 0) {
        this.accent(g.accent, f.accent);
        p.wipe = 1 - (1 - wave) ** 3;
      } else {
        this.accent(f.accent);
        p.wipe = 1;
      }
      env = (wave > 0.3 ? g : f).accent;
      // spin-swap: the outgoing can whips round and the next arrives spinning out of it, on the beat
      const before = t < nextAt;
      const rigIndex = before ? i : nextRig;
      const rig = s.rigs[rigIndex];
      const swapSpin = before ? TAU * 0.75 * inCubic(range(t, nextAt - 0.4, nextAt)) : -TAU * 0.75 * (1 - outCubic(range(t, nextAt, nextAt + 0.45)));
      const lf = before ? local : t - nextAt;
      const k = before ? i : i + 1;
      const bob = 0.06 * Math.sin(lf * 1.6 + k);
      const punch = before ? 1 + 0.06 * inCubic(range(t, nextAt - 0.4, nextAt)) : 1 + 0.06 * (1 - outCubic(range(t, nextAt, nextAt + 0.45)));
      this.pose(rig, 0, bob, 0, FRONT + 0.25 * Math.sin(lf * 0.7 + k) - 0.1 + swapSpin, -0.16 + 0.03 * Math.sin(lf * 0.9 + k), 0.04);
      rig.can.scale.setScalar(punch);
      rig.surface.uWet.value = 0.85;
      rig.surface.uWetTime.value = 2.4;
      rig.surface.uWetSeed.value = k * 3 + 1;
      rig.surface.uWetTint.value.set(FLAVORS[rig.flavor].accent);
      // the giant name behind, never cropped: fitted to the frame
      if (k <= 5) {
        const typeIn = smooth(range(lf, 0.05, 0.5)) * (1 - smooth(range(lf, FLAVOR_SLOT - 0.5, FLAVOR_SLOT - 0.1)));
        this.typeReq = { lines: FLAVORS[k].lines.map((l) => l.toUpperCase()), style: 'outline', frac: (P ? 0.9 : 0.42) * lerp(0.97, 1.03, lf / FLAVOR_SLOT), opacity: 0.42 * typeIn, x: P ? 0 : 0.18, y: P ? 0.2 : 0.02, depth: 8, color: 0xffffff };
      }
      // camera: blend between chapter angles through the swap
      const a = this.chapterShot(i, local);
      const b = this.chapterShot(Math.min(5, i + 1), 0);
      const blend = i < 5 ? inOutCubic(swap) : 0;
      shot.target.set(0, 0.1, 0);
      shot.elev = lerp(a.elev, b.elev, blend);
      shot.azim = lerp(a.azim, b.azim, blend);
      shot.h = lerp(a.h, b.h, blend) * (1 - 0.08 * Math.sin(Math.PI * swap));
      shot.roll = lerp(a.roll, b.roll, blend);
      shot.w = 4;
      shot.lensX = P ? 0 : 0.18;
      shot.lensY = P ? 0.15 : 0;
      // the first chapter punches out of the build's dive
      if (i === 0) shot.h *= lerp(0.5, 1, outExpo(range(t, T.flavors, T.flavors + 0.6)));
      // the last swap (into the close-ups) dives toward the label
      if (i === 5) {
        const dive = inOutCubic(range(t, T.inside - 0.4, T.inside + 0.5));
        const block = BENEFIT_RECTS[0];
        shot.target.y = lerp(0.1, ((block[1] + block[3]) / 2 - 0.5) * CAN.shellHeight, dive);
        shot.h = lerp(shot.h, (P ? 3.4 : 2.7), dive);
        shot.w = lerp(4, 2.4, dive);
        shot.elev = lerp(shot.elev, 3, dive);
        shot.azim = lerp(shot.azim, -6, dive);
        shot.lensX = P ? 0 : lerp(0.18, 0.2, dive);
        if (!before) {
          rig.can.rotation.y = lerp(rig.can.rotation.y, faceU(BENEFIT_U) + 0.1 + swapSpin, dive);
          rig.can.rotation.z = lerp(-0.16, -0.05, dive);
          rig.surface.uWet.value = 0;
          const b0 = BENEFIT_RECTS[0];
          rig.surface.uGlowRect.value.set(b0[0], b0[1], b0[2], b0[3]);
          rig.surface.uLabelDim.value = 0.82 * smooth(range(t, T.inside - 0.1, T.inside + 0.4));
          rig.surface.uGlowStrength.value = 1;
          rig.surface.uGlowColor.value.set(g.accent);
        }
      }
    } else if (t < T.zamzam) {
      // ── INSIDE: the label's benefit blocks, one at a time ──
      const rig = s.rigs[0];
      const f = FLAVORS[0];
      this.accent(f.accent);
      env = f.accent;
      p.field = 1;
      p.mountains = 0;
      p.moon = 0;
      p.stars = 0;
      p.mistFg = 0.15;
      p.glow = 0.8;
      const k = Math.min(2, Math.floor((t - T.inside) / BENEFIT_SLOT));
      const step = k < 2 ? inOutCubic(range(t, benefitAt(k + 1) - 0.35, benefitAt(k + 1) + 0.15)) : 0;
      const cur = BENEFIT_RECTS[k];
      const nxt = BENEFIT_RECTS[Math.min(2, k + 1)];
      const r = rig.surface.uGlowRect.value;
      r.set(lerp(cur[0], nxt[0], step), lerp(cur[1], nxt[1], step), lerp(cur[2], nxt[2], step), lerp(cur[3], nxt[3], step));
      const dim = 0.82 * smooth(range(t, T.inside - 0.1, T.inside + 0.4));
      rig.surface.uLabelDim.value = dim;
      rig.surface.uGlowStrength.value = 1;
      rig.surface.uGlowColor.value.set(f.accent);
      s.key.intensity = 1.05 + 0.6 * dim;
      s.fill.intensity = 0.18 + 0.5 * dim;
      const outro = inOutCubic(range(t, T.zamzam - 0.45, T.zamzam));
      this.pose(rig, 0, 0, 0, faceU(BENEFIT_U) + 0.1 - 0.05 * (t - T.inside) - TAU * 0.5 * inCubic(range(t, T.zamzam - 0.4, T.zamzam)), -0.05, 0);
      const y = (((cur[1] + cur[3]) / 2) * (1 - step) + ((nxt[1] + nxt[3]) / 2) * step - 0.5) * CAN.shellHeight;
      shot.target.set(0, lerp(y, 0.2, outro), 0);
      shot.h = lerp(P ? 3.4 : 2.7, 6.6, outro) - 0.08 * (t - T.inside) * (1 - outro);
      shot.w = 2.4;
      shot.elev = 3;
      shot.azim = -6 + 2 * (t - T.inside);
      shot.lensX = P ? 0 : 0.2;
      shot.lensY = P ? 0.16 : 0;
    } else if (t < T.halal) {
      // ── ZAMZAM: the site's pool at first light ──
      const rig = s.rigs[0];
      this.accent(FLAVORS[0].accent);
      env = FLAVORS[0].accent;
      p.mountains = 0;
      p.moon = 0;
      p.stars = 0;
      p.mistFg = 0;
      s.reflect = 0.45;
      const inn = smooth(range(t, T.zamzam - 0.05, T.zamzam + 0.35));
      const z = s.zamzam.material.uniforms;
      s.zamzam.mesh.visible = true;
      z.uAlpha.value = inn;
      z.uTime.value = t;
      z.uDrop.value = t - (T.zamzam + 0.2);
      z.uAspect.value = s.width / s.height;
      (z.uAccent.value as THREE.Color).set(FLAVORS[0].accent);
      const arrive = TAU * 0.5 * (1 - outCubic(range(t, T.zamzam, T.zamzam + 0.6)));
      this.pose(rig, 0, -0.5, 0, FRONT + 0.25 - 0.08 * (t - T.zamzam) + arrive, 0, 0);
      shot.target.set(0, 0.3, 0);
      shot.h = (6.8 - 0.25 * (t - T.zamzam)) * (P ? 1.3 : 1);
      shot.w = 4;
      shot.elev = 2;
      shot.azim = 4 - 2 * (t - T.zamzam);
      shot.lensX = P ? 0 : 0.2;
      shot.lensY = P ? 0.14 : 0;
      this.applyCamera();
      rig.can.updateMatrixWorld(true);
      v3.set(0, -(CAN.shellHeight / 2 + CAN.bottomHeight), 0).applyMatrix4(rig.can.matrixWorld).project(this.cam);
      v3b.set(0, CAN.shellHeight / 2 + CAN.topHeight, 0).applyMatrix4(rig.can.matrixWorld).project(this.cam);
      (z.uBase.value as THREE.Vector2).set(v3.x * 0.5 + 0.5, clamp(v3.y * 0.5 + 0.5, 0.05, 0.6));
      const hh = Math.max(0.1, (v3b.y - v3.y) * 0.5);
      (z.uRosetteAt.value as THREE.Vector3).set(v3.x * 0.5 + 0.5, v3.y * 0.5 + 0.5 + hh * 0.6, hh * 0.78);
      horizonDepth = 0;
    } else if (t < T.crack) {
      // ── HALAL: the badge on the label ──
      const rig = s.rigs[0];
      const f = FLAVORS[0];
      this.accent(f.accent);
      env = f.accent;
      p.field = 1;
      p.mountains = 0;
      p.moon = 0;
      p.stars = 0;
      p.glow = 0.7;
      const r = HALAL_RECT;
      rig.surface.uGlowRect.value.set(r[0], r[1], r[2], r[3]);
      const dim = 0.85 * smooth(range(t, T.halal, T.halal + 0.3));
      rig.surface.uLabelDim.value = dim;
      rig.surface.uGlowStrength.value = 1;
      rig.surface.uGlowColor.value.set(0xffffff);
      s.key.intensity = 1.6;
      const arrive = 1 - outExpo(range(t, T.halal, T.halal + 0.5));
      this.pose(rig, 0, 0, 0, faceU(HALAL_U) + 0.05 - 0.04 * (t - T.halal) - 1.2 * arrive, -0.04, 0);
      const by = (((r[1] + r[3]) / 2) - 0.5) * CAN.shellHeight;
      shot.target.set(0, by, 0);
      shot.h = (P ? 2.6 : 2.0) * (1 + 0.6 * arrive) - 0.1 * (t - T.halal);
      shot.w = 1.8;
      shot.elev = 3;
      shot.azim = -4;
      shot.lensX = P ? 0 : 0.2;
      shot.lensY = P ? 0.14 : 0;
      // a light sweep across the seal
      const sw = range(t, T.halal + 0.4, T.halal + 1.6);
      s.sweep.intensity = Math.sin(Math.PI * sw) ** 2 * 2.2;
      s.sweep.position.set(-6 + sw * 12, 2, 6);
    } else if (t < T.finale) {
      // ── CRACK: night, over the lid ──
      const rig = s.rigs[0];
      const f = FLAVORS[0];
      this.accent(f.accent);
      env = f.accent;
      p.mistFg = 0.7;
      p.glow = 0.6;
      const parts = s.parts(rig);
      const lift = smooth(range(t, T.pop - 0.08, T.pop + 0.06));
      const settle = 1 - 0.75 * inOutCubic(range(t, T.pop + 0.35, T.pop + 1.0));
      parts.tabPivot.rotation.x = -1.15 * lift * settle;
      parts.opening.visible = t > T.pop + 0.02;
      this.pose(rig, 0, 0, 0, FRONT - 0.3 + 0.05 * (t - T.crack), 0, 0);
      rig.surface.uWet.value = 1;
      rig.surface.uWetTime.value = t > T.pop ? t - T.pop + 0.6 : 2.6;
      rig.surface.uWetSeed.value = 3;
      rig.surface.uWetTint.value.set(f.accent);
      const inn = 1 - outExpo(range(t, T.crack, T.crack + 0.7));
      const leave = inExpo(range(t, 43.3, 44.0));
      shot.target.set(0, LID_Y - 0.15, 0);
      shot.h = (lerp(3.0, 2.5, smooth(range(t, T.crack, T.pop))) * (1 + 1.5 * inn) * (1 + 3 * leave)) * (P ? 1.3 : 1);
      shot.w = 2.6;
      shot.elev = 36 + 10 * leave;
      shot.azim = 6 - 4 * (t - T.crack) + 40 * leave;
      shot.roll = shake(t, T.pop, 0.6, 1.5);
      shot.target.y += shake(t, T.pop, 0.6, 0.04);
      shot.lensY = P ? 0.06 : 0;
      this.applyCamera();
      rig.can.updateMatrixWorld(true);
      const hole = parts.opening.getWorldPosition(v3b);
      s.updateSpray(t - T.pop, hole, 0xdfe9ff);
      v3.copy(hole).project(this.cam);
      p.burstPos.set(v3.x * 0.5 + 0.5, v3.y * 0.5 + 0.5);
      p.burst = t > T.pop ? Math.min(1, (t - T.pop) * 3) * Math.exp(-(t - T.pop) * 1.2) : 0;
      p.flash = t > T.pop ? Math.max(0, 1 - (t - T.pop) * 4) * 0.5 : 0;
      s.sweep.intensity = t > T.pop ? Math.max(0, 1 - (t - T.pop) * 3) * 2.5 : 0;
      s.sweep.position.set(0, 8, 2);
      p.flash = Math.max(p.flash, Math.max(0, (t - 43.75) * 4));
    } else {
      // ── FINALE: the site's diagonal ribbon of all six, then the lock-up ──
      env = null;
      this.accent(FLAVORS[0].accent);
      p.studio = 1;
      p.mountains = 0;
      p.moon = 0;
      p.stars = 0;
      p.mistFg = 0.2;
      p.glow = 0.7;
      p.flash = Math.max(0, 1 - (t - T.finale) * 3) * 0.45;
      const order = [SPARE_BLUE, 1, 2, 3, 4, 5];
      const drift = inOutCubic(range(t, T.finale, T.end));
      order.forEach((rigIndex, j) => {
        const rig = s.rigs[rigIndex];
        const c = j - 2.5;
        const x = P ? c * 1.4 : c * 1.95;
        const y = P ? c * 1.05 + 0.2 : c * 0.26;
        const z = P ? -Math.abs(c) * 0.3 : -c * 0.9;
        this.pose(rig, x, y, z, FRONT + 0.2 - 0.06 * c + 0.12 * Math.sin(t * 0.6 + j) - 0.4 * drift, -0.22, 0.05);
        const on = smooth(range(t, lightAt(j), lightAt(j) + 0.35));
        s.setFocus(rig, lerp(0.05, 1, on));
        rig.surface.uWet.value = 0.7;
        rig.surface.uWetTime.value = 2.4;
        rig.surface.uWetSeed.value = j + 11;
        rig.surface.uWetTint.value.set(FLAVORS[rig.flavor].accent);
      });
      shot.target.set(P ? lerp(-0.3, 0.3, drift) : lerp(-0.6, 0.6, drift), P ? 0.4 : 0.3, P ? -0.5 : 0);
      shot.h = P ? 15.5 - 1.2 * drift : 10.6 - 0.8 * drift;
      shot.w = P ? 9.4 : 14;
      shot.elev = 4;
      shot.azim = lerp(-16, -8, drift);
      shot.roll = -1.5;
      shot.lensY = P ? -0.12 : -0.17;
    }

    // environment gel follows the flavor
    const key = env ?? 'neutral';
    if (key !== this.envKey) {
      this.envKey = key;
      s.scene.environment = s.envFor(env);
    }
    col.set(0xdfe6ff).lerp(p.accent, 0.25);
    s.rim.color.copy(col);
    this.applyCamera();
    this.placeType();
    // backdrop parameters that follow the camera
    v3.copy(shot.target).project(this.cam);
    p.glowPos.set(v3.x * 0.5 + 0.5, clamp(v3.y * 0.5 + 0.5, 0.2, 0.8));
    if (p.wipe < 1) p.wipeOrigin.copy(p.glowPos);
    v3.set(shot.target.x, FLOOR_Y, shot.target.z - horizonDepth).project(this.cam);
    p.horizon = clamp(v3.y * 0.5 + 0.5, 0.06, 0.7);
    p.camX = this.cam.position.x;
    p.camY = this.cam.position.y;
    p.aspect = s.width / s.height;
  }

  /**
   * Puts the requested giant type `depth` units behind the camera target, facing the camera, `frac` of the frame
   * width wide and offset by (x, y) frame fractions from the frame centre (lens shift accounted for).
   */
  private placeType() {
    const req = this.typeReq;
    const plane = this.s.typeBack;
    if (!req || req.opacity < 0.002) {
      plane.mesh.visible = false;
      return;
    }
    plane.setText(req.lines, req.style);
    const cam = this.cam;
    const dist = cam.position.distanceTo(this.shot.target) + req.depth;
    const visH = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * dist;
    const visW = visH * (this.s.width / this.s.height);
    const fwd = v3.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const right = v3b.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const pos = cam.position.clone().addScaledVector(fwd, dist);
    pos.addScaledVector(right, (req.x - this.shot.lensX) * visW).addScaledVector(up, (req.y - this.shot.lensY) * visH);
    let width = visW * req.frac;
    // never taller than 80% of the frame either
    width = Math.min(width, visH * 0.8 * plane.aspect);
    plane.place(pos, width, req.opacity, req.color, cam);
  }

  /** Screen position (pixels) of a point in a can's local frame, ignoring its spin. */
  private project(can: THREE.Object3D, x: number, y: number, z: number): [number, number] {
    v3.set(can.position.x + x, can.position.y + y, can.position.z + z).project(this.cam);
    return [Math.round((v3.x * 0.5 + 0.5) * this.s.width), Math.round((0.5 - v3.y * 0.5) * this.s.height)];
  }

  private applyCamera() {
    const { shot } = this;
    const cam = this.cam;
    const vfov = THREE.MathUtils.degToRad(cam.fov);
    const aspect = this.s.width / this.s.height;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const dist = Math.max(shot.h / (2 * Math.tan(vfov / 2)), shot.w / (2 * Math.tan(hfov / 2)));
    const elev = THREE.MathUtils.degToRad(shot.elev);
    const azim = THREE.MathUtils.degToRad(shot.azim);
    cam.position.set(
      shot.target.x + dist * Math.cos(elev) * Math.sin(azim),
      shot.target.y + dist * Math.sin(elev),
      shot.target.z + dist * Math.cos(elev) * Math.cos(azim)
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(shot.target);
    if (shot.roll) cam.rotateZ(THREE.MathUtils.degToRad(shot.roll));
    const w = this.s.width;
    const h = this.s.height;
    cam.setViewOffset(w, h, -shot.lensX * w, shot.lensY * h, w, h);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
}

void inOutQuint;
