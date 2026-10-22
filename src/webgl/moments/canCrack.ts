import * as THREE from 'three';
import type { SceneManager } from '../sceneManager';
import type { SceneMoment } from './types';
import { getCanParts } from '../canModel';
import { audioManager } from '../../audio/audioManager';
import { FLAVORS } from '../../data/flavors';
import type { CanSplash } from './canSplash';

/**
 * Crack it open. Clicking or tapping the featured can (the hero ring's centre can, or the single can of the flavor
 * intro and the tagline; or pressing O) tips its lid toward the camera, lifts the tab with a crack and a hiss, and the
 * drink sprays out of the opening in the flavor's colour while cold beads form on the can (CanSplash); a moment later
 * the tab closes and the can settles back. Pointing at the can (a mouse) lifts the tab a little: it opens.
 *
 * Trigger: a click/tap on the featured can without a drag, or the O key (SceneManager.crackOpen); hover from
 * SceneManager.setCanHover. Persists: nothing. State/time-driven (3.2 s). WebGL: the featured can's offset pose, its
 * tab and opening, the stage's mist burst and flash, CanSplash. Optional: under reduced motion the tab still lifts and
 * the sound plays, without the tilt, mist or drops. Fallback: nothing essential lives in the effect.
 */
const DURATION = 3.2;
const CRACK_AT = 0.55;

const ease = (t: number) => t * t * (3 - 2 * t);

export class CanCrack implements SceneMoment {
  private start = -1;
  private armed = false;
  private cracked = false;
  private index = -1;
  /** 'ring': the hero's centre can; 'single': a single-can scene, held at `section` (it lets go once scrolled on). */
  private mode: 'ring' | 'single' = 'ring';
  private section = 0;
  private readonly lid = new THREE.Vector3();
  private readonly color = new THREE.Color();
  // hover hint: the pointed-at can's tab lifts a little
  private hoverIndex = -1;
  private hoverCan = -1;
  private hoverLift = 0;

  constructor(private readonly splash: CanSplash) {}

  /** Plays once; ignored while a crack is already running. */
  trigger(canIndex: number, mode: 'ring' | 'single' = 'ring', section = 0) {
    if (this.armed) return;
    this.armed = true;
    this.start = -1;
    this.cracked = false;
    this.index = canIndex;
    this.mode = mode;
    this.section = section;
  }

  /** The can the pointer rests on (-1: none). */
  setHover(canIndex: number) {
    this.hoverIndex = canIndex;
  }

  get active() {
    return this.armed;
  }

  update(seconds: number, scene: SceneManager) {
    if (!this.armed) {
      this.stepHover(scene);
      return;
    }
    if (this.start < 0) this.start = seconds;
    const t = seconds - this.start;
    const can = scene.cans[this.index];
    const parts = can ? getCanParts(can) : undefined;
    // the ring moved on (swipe) or the page scrolled on: let go at once
    const movedOn = this.mode === 'ring' ? scene.data.wave < 0.6 : Math.abs(scene.sectionPosition - this.section) > 0.35;
    if (!can || t > DURATION || movedOn || scene.featuredCanIndex() !== this.index) {
      this.finish(parts);
      return;
    }

    const motion = scene.reducedMotion ? 0 : 1;
    const tilt = ease(THREE.MathUtils.clamp(t / 0.4, 0, 1)) * (1 - ease(THREE.MathUtils.clamp((t - 2.5) / 0.7, 0, 1)));
    // a single big can tips less: its lid must stay in frame
    const reach = this.mode === 'ring' ? 1 : 0.55;
    const o = scene.featuredOffset;
    o.rotX += 0.85 * tilt * motion * reach;
    o.posZ += 1.4 * tilt * motion * reach;
    o.posY -= 0.35 * tilt * motion * reach;

    if (parts) {
      const lift = ease(THREE.MathUtils.clamp((t - 0.35) / 0.25, 0, 1));
      const close = 1 - ease(THREE.MathUtils.clamp((t - 2.3) / 0.4, 0, 1));
      parts.tabPivot.rotation.x = -1.15 * lift * close;
      parts.opening.visible = lift > 0.8 && close > 0.05;
    }
    if (!this.cracked && t > CRACK_AT) {
      this.cracked = true;
      audioManager.play('open');
      this.splash.play(can, this.color.set(FLAVORS[this.index % FLAVORS.length].theme.accent));
    }
    if (this.cracked && motion) {
      const after = t - CRACK_AT;
      this.lid.set(0, 2.2, -0.2).applyMatrix4(can.matrixWorld).project(scene.camera);
      scene.fx.burstPos.set(this.lid.x * 0.5 + 0.5, this.lid.y * 0.5 + 0.5);
      const puff = Math.exp(-after * 1.8);
      const roll = THREE.MathUtils.smoothstep(after, 0, 0.5) * (1 - THREE.MathUtils.smoothstep(t, 2.2, DURATION));
      scene.fx.burst = Math.max(scene.fx.burst, 0.45 * puff + 0.35 * roll);
      scene.fx.flash = Math.max(scene.fx.flash, 0.25 * Math.exp(-after * 14));
    }
  }

  /** Hover hint: the tab of the can under the pointer lifts a little, and settles when the pointer leaves. */
  private stepHover(scene: SceneManager) {
    if (this.hoverIndex >= 0 && this.hoverIndex !== this.hoverCan) {
      this.resetTab(scene, this.hoverCan);
      this.hoverCan = this.hoverIndex;
      this.hoverLift = 0;
    }
    if (this.hoverCan < 0) return;
    const target = this.hoverIndex === this.hoverCan && !scene.reducedMotion ? 1 : 0;
    this.hoverLift += (target - this.hoverLift) * 0.18;
    const parts = getCanParts(scene.cans[this.hoverCan]);
    if (parts) parts.tabPivot.rotation.x = -0.32 * ease(this.hoverLift);
    if (target === 0 && this.hoverLift < 0.002) {
      this.resetTab(scene, this.hoverCan);
      this.hoverCan = -1;
    }
  }

  private resetTab(scene: SceneManager, index: number) {
    const parts = index >= 0 ? getCanParts(scene.cans[index]) : undefined;
    if (parts) parts.tabPivot.rotation.x = 0;
  }

  private finish(parts: ReturnType<typeof getCanParts>) {
    this.armed = false;
    this.hoverCan = -1; // the crack owned the tab; the hover hint starts again from closed
    if (parts) {
      parts.tabPivot.rotation.x = 0;
      parts.opening.visible = false;
    }
  }

  dispose() {
    this.armed = false;
  }
}
