import { useEffect, useState } from 'react';
import type { SceneManager } from '../webgl/sceneManager';
import { SCENE_SEQUENCE } from '../webgl/sceneStates';
import { audioManager } from '../audio/audioManager';
import { scrollVar } from './scrollVar';

export type HomeScene = 'hero' | 'flavor' | 'benefit' | 'argument' | 'lineup' | 'faq' | 'newsletter';

const SCENE_BY_SECTION: Record<string, HomeScene> = {
  gamme: 'hero',
  profile: 'flavor',
  'benefits-1': 'benefit',
  'benefits-2': 'benefit',
  'benefits-3': 'benefit',
  'benefits-4': 'benefit',
  argument: 'argument',
  'full-gamme': 'lineup',
  FAQ: 'faq',
  newsletter: 'newsletter',
  loop: 'hero',
};

export interface HomeScrollState {
  /** Index into SCENE_SEQUENCE of the section centred in the viewport. */
  sectionIndex: number;
  scene: HomeScene;
  /** 0–3 inside the benefit chapters, otherwise -1. */
  chapter: number;
}

/**
 * The one scroll listener for the home page. Maps section positions to the
 * master timeline (seeked in the WebGL loop), writes the header progress as a CSS
 * variable (no React render), and exposes the active section for the DOM. The scroll variables go only on the
 * elements that read them (scrollVar.ts), never on <html>, so a scroll frame does not re-style the whole page.
 */
export function useHomeScroll(enabled: boolean, sceneRef: React.MutableRefObject<SceneManager | null>) {
  const [state, setState] = useState<HomeScrollState>({ sectionIndex: 0, scene: 'hero', chapter: -1 });

  useEffect(() => {
    if (!enabled) return;
    const progressVar = scrollVar('--scroll-progress', '.scroll-progress, .hero__hud, .hero-arrow, .lineup__cta');
    const diveVar = scrollVar('--dive', '.hero__title');
    let ticking = false;
    let lastSection = -1;
    // Touch screens hand the copy over early, as the reference does: the next chapter's copy comes in as soon as its
    // section starts to rise into view (a fifth of the way there), so it is in place when the can arrives. Halfway
    // read as late on a phone, with the thumb already past.
    const handover = window.matchMedia('(pointer: coarse)').matches ? 0.8 : 0.5;
    let tops: number[] = [];

    const measure = () => {
      tops = SCENE_SEQUENCE.map(({ sectionId }) => {
        const element = document.getElementById(sectionId);
        return element ? element.getBoundingClientRect().top + window.scrollY : Number.POSITIVE_INFINITY;
      });
      // the page has changed shape: elements may have mounted since (the hero after the loader, the finale CTA)
      progressVar.refresh();
      diveVar.refresh();
    };

    const update = () => {
      ticking = false;
      const scrollY = window.scrollY;
      const last = SCENE_SEQUENCE.length - 1;

      // Continuous section index: k at section k's top, linear in between.
      let position = 0;
      for (let k = 0; k < last; k += 1) {
        const start = tops[k];
        const end = tops[k + 1];
        if (scrollY >= end) {
          position = k + 1;
          continue;
        }
        position = k + Math.min(1, Math.max(0, (scrollY - start) / Math.max(1, end - start)));
        break;
      }
      const progress = position / last;
      progressVar.set(progress.toFixed(4));
      // 0 → 1 across the hero → flavor dive (CSS: the hero title glides toward the flavor chapter's title)
      diveVar.set(Math.min(1, position).toFixed(3));
      sceneRef.current?.seekProgress(progress);

      const sectionIndex = Math.min(last, Math.floor(position + handover));
      const sectionId = SCENE_SEQUENCE[sectionIndex].sectionId;
      const scene = SCENE_BY_SECTION[sectionId];
      const chapter = scene === 'benefit' ? sectionIndex - 2 : -1;
      if (sectionIndex !== lastSection) {
        // Air moves between chapters (benefit chapters have their own cue).
        if (lastSection !== -1 && scene !== 'benefit') audioManager.play('whoosh', 0.6);
        lastSection = sectionIndex;
      }
      setState((previous) =>
        previous.sectionIndex === sectionIndex ? previous : { sectionIndex, scene, chapter }
      );
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    const onResize = () => {
      measure();
      onScroll();
    };

    measure();
    update();
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(document.body);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      resizeObserver.disconnect();
      progressVar.clear();
      diveVar.clear();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [enabled, sceneRef]);

  useEffect(() => {
    if (!enabled) return;
    document.body.dataset.scene = state.scene;
    return () => {
      delete document.body.dataset.scene;
    };
  }, [enabled, state.scene]);

  return state;
}
