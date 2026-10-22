import { useEffect, useRef } from 'react';
import type Lenis from 'lenis';
import type Snap from 'lenis/snap';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Lenis smooth scrolling (native scroll position, so anchors, keyboard and
 * assistive tech keep working). Inertial (lerp) rather than fixed-duration, so a
 * flick glides and slows like a physical page. A light snap only settles a page
 * that comes to rest very near a chapter start, after a pause, so it never grabs
 * the scroll mid-gesture. Disabled under prefers-reduced-motion.
 *
 * `wrapAtEnd`: when a downward scroll reaches the very bottom of the page (the home loop segment, which renders the same
 * frame as the hero), the page wraps to the top, as in the reference. Only with Lenis (never under reduced motion).
 */
export function useSmoothScroll(enabled: boolean, snapSelector?: string, wrapAtEnd = false) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (!enabled || prefersReducedMotion()) return;
    // Lenis is only for the home story: it loads (as its own chunk) when the home page needs it, never on shop,
    // bag or checkout.
    let cancelled = false;
    let cleanup: () => void = () => {};
    void Promise.all([import('lenis'), import('lenis/snap')]).then(([{ default: LenisCtor }, { default: SnapCtor }]) => {
      if (cancelled) return;
      const lenis = new LenisCtor({ lerp: 0.075, wheelMultiplier: 0.9, touchMultiplier: 1.3, smoothWheel: true });
      lenisRef.current = lenis;
      let frame = 0;
      const loop = (time: number) => {
        lenis.raf(time);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);

      let snap: Snap | null = null;
      // No snap on touch screens: it waited for the native momentum to end and then pulled the page with its own
      // 1.2 s animation, which fought the finger and read as lag. A flick ends where the phone's own physics take it.
      const touch = window.matchMedia('(pointer: coarse)').matches;
      if (snapSelector && !touch) {
        snap = new SnapCtor(lenis, {
          type: 'proximity',
          distanceThreshold: '14%',
          duration: 1.2,
          easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
          debounce: 320,
        });
        snap.addElements(Array.from(document.querySelectorAll<HTMLElement>(snapSelector)), { align: 'start' });
      }
      if (wrapAtEnd) {
        let wrapping = false;
        lenis.on('scroll', (instance: Lenis) => {
          if (wrapping || instance.direction !== 1 || instance.limit <= 0 || instance.scroll < instance.limit - 2) return;
          wrapping = true;
          instance.scrollTo(0, { immediate: true, force: true });
          requestAnimationFrame(() => {
            wrapping = false;
          });
        });
      }
      cleanup = () => {
        cancelAnimationFrame(frame);
        snap?.destroy();
        lenis.destroy();
        lenisRef.current = null;
      };
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [enabled, snapSelector, wrapAtEnd]);

  /** Scrolls to an element, smoothly when Lenis is active. */
  const scrollToElement = (element: HTMLElement) => {
    if (lenisRef.current) {
      lenisRef.current.scrollTo(element, { duration: 1.4 });
    } else {
      element.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  };

  return { lenisRef, scrollToElement };
}
