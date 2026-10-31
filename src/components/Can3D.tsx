import React, { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../hooks/useSmoothScroll';
import { versioned } from '../data/assetVersion';

const hasWebGL = () => {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
};

/**
 * A real 3D can (webgl/canViewer.ts) for a Limited editions panel. The 3D code and the can's label maps load only
 * when the panel nears the screen; it renders only while on screen. Until the first frame (and without WebGL) the
 * product render shows instead. Drag turns the can; vertical touch scrolling still scrolls the page.
 */
export const Can3D: React.FC<{ slug: string; fallbackSrc: string; className?: string }> = ({ slug, fallbackSrc, className = '' }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !hasWebGL()) return;
    let viewer: import('../webgl/canViewer').CanViewer | null = null;
    let cancelled = false;
    let visible = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !viewer && !cancelled) {
          void import('../webgl/canViewer').then(({ CanViewer }) => {
            if (cancelled || viewer) return;
            viewer = new CanViewer(host, prefersReducedMotion());
            viewer.onReady = () => setReady(true);
            const base = `/textures/grizzly/limited/${slug}`;
            viewer
              .load({ albedo: versioned(`${base}.webp`), surface: versioned(`${base}-surface.webp`), normal: versioned(`${base}-normal.webp`) })
              .then(() => viewer?.setActive(visible))
              .catch(() => {
                // keep the product render
              });
          });
        } else {
          viewer?.setActive(visible);
        }
      },
      { rootMargin: '200px 0px' }
    );
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
      viewer?.dispose();
    };
  }, [slug]);

  return (
    <div ref={hostRef} className={`can3d ${ready ? 'is-ready' : ''} ${className}`}>
      <img className="can3d__fallback" src={fallbackSrc} alt="" width={187} height={491} loading="lazy" decoding="async" />
    </div>
  );
};
