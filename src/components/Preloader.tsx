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
export const Preloader: React.FC<PreloaderProps> = ({ isReady, onDone, onLeave, minDurationMs }) => {
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'leaving' | 'done'>('loading');
  const startedAt = useRef(performance.now());
  const readyRef = useRef(isReady);
  readyRef.current = isReady;
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
      const canFinish = readyRef.current && (elapsed > minDurationMs || skipRef.current);
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
      if (readyRef.current && performance.now() - startedAt.current > minDurationMs * 2) {
        setPercent(100);
        setPhase((current) => (current === 'loading' ? 'leaving' : current));
      }
    }, 500);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(fallback);
    };
  }, [minDurationMs]);

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
