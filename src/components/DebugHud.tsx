import React, { useEffect, useRef } from 'react';

/**
 * Performance readout for real devices, shown only with `?debug=1` in the URL: frames per second (averaged over half a
 * second), the 3D canvas's render scale and the current quality tier. Written straight to the DOM from one rAF loop,
 * so it never re-renders React and costs next to nothing.
 */
export const DebugHud: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    let frames = 0;
    let since = performance.now();
    const tick = (now: number) => {
      frames += 1;
      if (now - since >= 500 && ref.current) {
        const fps = Math.round((frames * 1000) / (now - since));
        const canvas = document.querySelector<HTMLCanvasElement>('.webgl-canvas');
        const scale = canvas && canvas.clientWidth ? (canvas.width / canvas.clientWidth).toFixed(2) : '–';
        const quality = document.documentElement.dataset.quality ?? '–';
        ref.current.textContent = `${fps} fps · render ${scale}× · ${quality}`;
        ref.current.dataset.slow = String(fps < 45);
        frames = 0;
        since = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <div ref={ref} className="debug-hud" aria-hidden="true" />;
};
