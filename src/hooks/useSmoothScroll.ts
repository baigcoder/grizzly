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
 * the scroll mid-gesture (desktop only). On touch screens Lenis drives the finger too (syncTouch), as the reference
 * does. Disabled under prefers-reduced-motion.
 *
 * `wrapAtEnd`: when a downward scroll reaches the very bottom of the page (the home loop segment, which renders the same
 * frame as the hero), the page wraps to the top, as in the reference. Only with Lenis (never under reduced motion).
 */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
/** One chapter per swipe: the reference's glide to the next chapter top. */
const PAGE_DURATION = 1.5;
/** A vertical drag shorter than this (CSS px) settles back on the chapter it started on. */
const PAGE_THRESHOLD = 24;

/**
 * Phone paging, as in the reference: from the hero to `lastPageSelector`, a vertical swipe does not drag the page;
 * on release it glides exactly one chapter on (or back), 1.5 s ease-out, so every swipe lands the can and its copy
 * squarely on the next step. A short drag returns to the chapter it started on; a sideways one is left to the
 * carousel and can turns. Past the last paged chapter (FAQ, footer) the page scrolls freely under the finger again.
 */
const excluded = (target: EventTarget | null) =>
  target instanceof Element && target.closest('.site-menu, .drawer, .flavor-slider') !== null;

/** Chapter tops, the chapter nearest the scroll position, and whether it lies in the paged run (hero → last page). */
function measurePages(lenis: Lenis, pageSelector: string, lastPageSelector?: string) {
  const pages = Array.from(document.querySelectorAll<HTMLElement>(pageSelector));
  const last = lastPageSelector ? pages.findIndex((page) => page.matches(lastPageSelector)) : pages.length - 1;
  const tops = pages.map((page) => page.getBoundingClientRect().top + window.scrollY);
  const position = lenis.animatedScroll;
  let anchor = 0;
  tops.forEach((top, index) => {
    if (Math.abs(top - position) < Math.abs(tops[anchor] - position)) anchor = index;
  });
  return { tops, anchor, paged: last >= 0 && anchor <= last };
}

function startTouchPaging(lenis: Lenis, pageSelector: string, lastPageSelector?: string) {
  let startX = 0;
  let startY = 0;
  let anchor = 0;
  let axis: 0 | 1 | 2 = 0; // 0 undecided, 1 sideways, 2 vertical
  let active = false;
  let tops: number[] = [];

  const onStart = (event: TouchEvent) => {
    active = false;
    axis = 0;
    if (event.touches.length !== 1 || excluded(event.target)) return;
    const measured = measurePages(lenis, pageSelector, lastPageSelector);
    tops = measured.tops;
    anchor = measured.anchor;
    active = measured.paged;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  };

  // capture: decides before Lenis's own handler, so the page never moves under the finger
  const onMove = (event: TouchEvent) => {
    if (!active) return;
    const touch = event.touches[0];
    if (axis === 0) {
      const dx = Math.abs(touch.clientX - startX);
      const dy = Math.abs(touch.clientY - startY);
      if (dx > 2 || dy > 2) axis = dx > dy ? 1 : 2;
    }
    if (axis === 2) {
      if (event.cancelable) event.preventDefault();
      lenis.stop();
    }
  };

  // registered after Lenis, so Lenis (stopped) adds no coast of its own before the glide starts
  const onEnd = (event: TouchEvent) => {
    if (!active) return;
    if (axis !== 2) {
      active = false;
      // A tap stops Lenis mid-glide: settle on the nearest chapter instead of freezing between two.
      if (axis === 0 && Math.abs(lenis.animatedScroll - tops[anchor]) > 4) {
        lenis.scrollTo(tops[anchor], { duration: PAGE_DURATION * 0.6, easing: easeOutCubic });
      }
      return;
    }
    active = false;
    const endY = event.changedTouches[0]?.clientY ?? startY;
    const delta = endY - startY;
    const target = Math.max(0, Math.min(tops.length - 1, Math.abs(delta) > PAGE_THRESHOLD ? anchor + (delta < 0 ? 1 : -1) : anchor));
    lenis.start();
    lenis.scrollTo(tops[target], { duration: PAGE_DURATION, easing: easeOutCubic });
  };

  const onCancel = () => {
    if (active && axis === 2) lenis.start();
    active = false;
  };

  window.addEventListener('touchstart', onStart, { passive: true });
  window.addEventListener('touchmove', onMove, { passive: false, capture: true });
  window.addEventListener('touchend', onEnd, { passive: true });
  window.addEventListener('touchcancel', onCancel, { passive: true });
  return () => {
    window.removeEventListener('touchstart', onStart);
    window.removeEventListener('touchmove', onMove, { capture: true });
    window.removeEventListener('touchend', onEnd);
    window.removeEventListener('touchcancel', onCancel);
  };
}

/** Chapters the reference lingers on (hero, flavor intro, tagline, line-up): their glide is slower. */
const SLOW_PAGES = [0, 1, 6, 7];
/** After a wheel glide, trackpad momentum still arriving is ignored this long (ms), so one flick moves one chapter. */
const WHEEL_COOLDOWN = 220;

/**
 * Desktop paging, as in the reference: from the hero to `lastPageSelector`, one wheel step glides exactly one chapter
 * (1.5 s on the slow chapters, 1 s otherwise, ease-out) and further wheel input waits until it lands. Past the last
 * paged chapter the wheel scrolls smoothly again. Menus and drawers, sideways wheels and ctrl-zoom are left alone.
 */
function startWheelPaging(lenis: Lenis, pageSelector: string, lastPageSelector?: string) {
  let lockedUntil = 0;
  // capture: decides before Lenis's own wheel listener, which it silences for paged steps
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || excluded(event.target) || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const { tops, anchor, paged } = measurePages(lenis, pageSelector, lastPageSelector);
    if (!paged) return;
    const direction = Math.sign(event.deltaY);
    const target = Math.max(0, Math.min(tops.length - 1, anchor + direction));
    // scrolling up out of the run's first chapter, or a no-op, falls through to normal scrolling
    if (target === anchor && direction < 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const now = performance.now();
    if (now < lockedUntil || Math.abs(event.deltaY) < 4 || target === anchor) return;
    const duration = SLOW_PAGES.includes(anchor) ? PAGE_DURATION : 1;
    lockedUntil = now + duration * 1000 + WHEEL_COOLDOWN;
    lenis.scrollTo(tops[target], { duration, easing: easeOutCubic, lock: true });
  };
  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
  return () => window.removeEventListener('wheel', onWheel, { capture: true });
}

export function useSmoothScroll(
  enabled: boolean,
  snapSelector?: string,
  wrapAtEnd = false,
  pageSelector?: string,
  lastPageSelector?: string
) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (!enabled || prefersReducedMotion()) return;
    // Lenis is only for the home story: it loads (as its own chunk) when the home page needs it, never on shop,
    // bag or checkout.
    let cancelled = false;
    let cleanup: () => void = () => {};
    void Promise.all([import('lenis'), import('lenis/snap')]).then(([{ default: LenisCtor }, { default: SnapCtor }]) => {
      if (cancelled) return;
      const touch = window.matchMedia('(pointer: coarse)').matches;
      // Touch: Lenis owns the finger as in the reference (syncTouch). The page tracks the finger 1:1, then a flick
      // coasts with weight (velocity^1.7, eased at 0.075) instead of the phone's native fling, and the 3D scene, the
      // pinned copy and the page move on the same frame instead of the canvas trailing a compositor scroll.
      // A gesture that starts sideways (hero carousel, turning a can) is locked to that axis and never scrolls.
      let axis: 'x' | 'y' | null = null;
      let travelX = 0;
      let travelY = 0;
      const lenis = new LenisCtor({
        lerp: 0.075,
        wheelMultiplier: 0.9,
        touchMultiplier: 1,
        smoothWheel: true,
        syncTouch: touch,
        syncTouchLerp: 0.075,
        touchInertiaExponent: 1.7,
        // the menu and drawers scroll themselves; the flavor slider is dragged sideways
        prevent: (node) => node.classList.contains('site-menu') || node.classList.contains('drawer') || node.classList.contains('flavor-slider'),
        virtualScroll: ({ deltaX, deltaY, event }) => {
          if (!event.type.startsWith('touch')) return true;
          if (event.type === 'touchstart') {
            axis = null;
            travelX = 0;
            travelY = 0;
            return true;
          }
          if (axis === null) {
            travelX += Math.abs(deltaX);
            travelY += Math.abs(deltaY);
            if (Math.max(travelX, travelY) > 6) axis = travelX > travelY ? 'x' : 'y';
          }
          return axis !== 'x';
        },
      });
      lenisRef.current = lenis;
      let frame = 0;
      const loop = (time: number) => {
        lenis.raf(time);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);

      let snap: Snap | null = null;
      // No snap on touch screens: it waited for the native momentum to end and then pulled the page with its own
      // 1.2 s animation, which fought the finger and read as lag. A flick ends where its own coast takes it.
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
      const stopPaging = !pageSelector
        ? null
        : touch
          ? window.innerWidth < 1024
            ? startTouchPaging(lenis, pageSelector, lastPageSelector)
            : null
          : startWheelPaging(lenis, pageSelector, lastPageSelector);
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
        stopPaging?.();
        snap?.destroy();
        lenis.destroy();
        lenisRef.current = null;
      };
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [enabled, snapSelector, wrapAtEnd, pageSelector, lastPageSelector]);

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
