import React, { useEffect, useRef, useState } from 'react';
import { BRAND } from '../data/brand';
import { BrandMark } from './BrandMark';

interface PreloaderProps {
  isReady: boolean;
  onDone: () => void;
  /** Fires when the loader starts to fade: the moment the scene's intro begins. */
  onLeave?: () => void;
  /** Shortest time the loader stays, so the count reads as a moment rather than a flash. */
  minDurationMs: number;
  /**
   * Longest the visitor waits (from navigation start) for the scene. On a thin link the 3D chunks can take far longer than anyone will stare at a
   * black screen: past this the loader finishes anyway, the page opens on its static stage, and the scene joins when it
   * arrives. Unset (fast links, where the wait is short and ends with the cinematic): wait as long as it takes.
   */
  giveUpAfterMs?: number;
  /** Fires once if the loader left without the scene being ready (see giveUpAfterMs). */
  onGiveUp?: () => void;
}

/**
 * As in the reference: a black screen, the brand mark in the centre filling with white from the bottom as
 * progress completes, and a widely spaced percentage below it. On exit the overlay fades and the hero cans rise
 * into the ring. Fill is a CSS variable. Any key or tap skips the minimum wait.
 *
 * Lifecycle, mirrored on html[data-loader] for tests and styling:
 *   (no attribute) = boot, before this runs  →  loading  →  ready (scene is up, minimum time not yet met)
 *   →  exit (wordmark lifting away)  →  complete (unmounted).  Routes that never get a loader read "none".
 */
export const Preloader: React.FC<PreloaderProps> = ({ isReady, onDone, onLeave, minDurationMs, giveUpAfterMs, onGiveUp }) => {
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'leaving' | 'done'>('loading');
  const startedAt = useRef(performance.now());
  const readyRef = useRef(isReady);
  readyRef.current = isReady;
  const gaveUpRef = useRef(false);
  const onGiveUpRef = useRef(onGiveUp);
  onGiveUpRef.current = onGiveUp;
  // Any key press or tap skips the wait (the opening is a moment, never a gate).
  const skipRef = useRef(false);
  useEffect(() => {
    const skip = () => {
      skipRef.current = true;
    };
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    let value = 0;
    const tick = (now: number) => {
      const elapsed = now - startedAt.current;
      // measured from navigation start (rAF time shares performance.now's origin): the visitor's wait began when they
      // tapped the link, not when this component finally mounted behind a slow script download
      if (!gaveUpRef.current && !readyRef.current && giveUpAfterMs !== undefined && now > giveUpAfterMs) {
        gaveUpRef.current = true;
        onGiveUpRef.current?.();
      }
      const canFinish = (readyRef.current || gaveUpRef.current) && (elapsed > minDurationMs || skipRef.current);
      const target = canFinish ? 100 : Math.min(90, (elapsed / minDurationMs) * 90);
      value += (target - value) * (canFinish ? 0.12 : 0.08);
      const rounded = Math.min(100, Math.round(value + (canFinish && value > 99.4 ? 1 : 0)));
      setPercent((previous) => (previous === rounded ? previous : rounded));
      if (rounded >= 100) {
        setPhase('leaving');
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // Background tabs throttle animation frames: never let the loader outlive its job.
    const fallback = window.setInterval(() => {
      if ((readyRef.current || gaveUpRef.current) && performance.now() - startedAt.current > minDurationMs * 2) {
        setPercent(100);
        setPhase((current) => (current === 'loading' ? 'leaving' : current));
      }
    }, 500);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(fallback);
    };
  }, [minDurationMs, giveUpAfterMs]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    onLeave?.();
    const timer = window.setTimeout(() => {
      setPhase('done');
      onDone();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [phase, onDone, onLeave]);

  // Publish the lifecycle state.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.loader = phase === 'loading' ? (isReady ? 'ready' : 'loading') : phase === 'leaving' ? 'exit' : 'complete';
  }, [phase, isReady]);

  // Tell the page a loader is up so the hero chrome stays hidden until it leaves.
  useEffect(() => {
    if (phase !== 'loading') return;
    document.documentElement.dataset.loading = 'true';
    return () => {
      delete document.documentElement.dataset.loading;
    };
  }, [phase]);

  if (phase === 'done') return null;

  const fill = percent / 100;
  return (
    <div
      className={`loader ${phase === 'leaving' ? 'is-leaving' : ''}`}
      style={{ '--loader-fill': fill } as React.CSSProperties}
      role="progressbar"
      aria-label={`Loading ${BRAND.name}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div className="loader__stage" aria-hidden="true">
        <span className="loader__mark">
          <BrandMark className="loader__mark-base" />
          <BrandMark className="loader__mark-fill" />
        </span>
        <span className="loader__percent">{percent}%</span>
      </div>
    </div>
  );
};
