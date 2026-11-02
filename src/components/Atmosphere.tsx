import React, { useEffect, useMemo, useState } from 'react';
import type { HomeScene } from '../hooks/useHomeScroll';

interface AtmosphereProps {
  scene: HomeScene | 'page';
  flavorSlug: string;
  accentToken: string;
}

type Piece = { kind: string; x: number; y: number; size: number; depth: number; rotate: number; delay: number };

/**
 * Stylised fruit for each flavor, drawn as SVG (no photo assets). Each kind is
 * 100×100 and uses the flavor tokens so it changes with the accent.
 */
const FRUIT: Record<string, React.ReactNode> = {
  berry: (
    <g>
      {[[38, 40], [56, 38], [47, 54], [30, 56], [64, 55], [40, 70], [58, 70], [49, 84]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="11" fill="var(--fruit-a)" stroke="var(--fruit-b)" strokeWidth="2" />
      ))}
      <path d="M40 28c4-12 16-14 22-6-8 0-12 3-14 8z" fill="var(--fruit-leaf)" />
    </g>
  ),
  ice: <rect x="18" y="18" width="64" height="64" rx="14" fill="var(--fruit-ice)" stroke="var(--fruit-ice-edge)" strokeWidth="3" />,
  mango: (
    <g>
      <rect x="14" y="14" width="72" height="72" rx="16" fill="var(--fruit-a)" />
      <path d="M22 50h56M50 22v56" stroke="var(--fruit-b)" strokeWidth="4" opacity="0.55" />
    </g>
  ),
  wedge: (
    <g>
      <path d="M10 30 Q50 105 90 30 Z" fill="var(--fruit-a)" />
      <path d="M10 30 Q50 105 90 30" fill="none" stroke="var(--fruit-rind)" strokeWidth="9" />
      {[[38, 48], [50, 56], [62, 48], [44, 66], [56, 66]].map(([cx, cy], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx="2.5" ry="4" fill="var(--fruit-seed)" />
      ))}
    </g>
  ),
  peach: (
    <g>
      <path d="M20 70 Q20 20 70 18 Q50 40 56 80 Q36 86 20 70z" fill="var(--fruit-a)" />
      <path d="M30 66 Q34 36 62 26" stroke="var(--fruit-b)" strokeWidth="5" fill="none" opacity="0.6" />
    </g>
  ),
  kiwi: (
    <g>
      <circle cx="50" cy="50" r="40" fill="var(--fruit-kiwi-skin)" />
      <circle cx="50" cy="50" r="35" fill="var(--fruit-kiwi)" />
      <circle cx="50" cy="50" r="11" fill="var(--fruit-kiwi-core)" />
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return <ellipse key={i} cx={50 + Math.cos(a) * 19} cy={50 + Math.sin(a) * 19} rx="1.6" ry="3" fill="var(--fruit-seed)" transform={`rotate(${(a * 180) / Math.PI + 90} ${50 + Math.cos(a) * 19} ${50 + Math.sin(a) * 19})`} />;
      })}
    </g>
  ),
  strawberry: (
    <g>
      <path d="M50 92 C18 70 16 36 32 28 C40 24 46 30 50 30 C54 30 60 24 68 28 C84 36 82 70 50 92z" fill="var(--fruit-a)" />
      {[[40, 46], [56, 44], [48, 58], [36, 62], [62, 60], [50, 74]].map(([cx, cy], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx="1.8" ry="3" fill="var(--fruit-seed-light)" />
      ))}
      <path d="M34 28 L50 16 L66 28 L56 30 L50 22 L44 30z" fill="var(--fruit-leaf)" />
    </g>
  ),
};

const KINDS: Record<string, string[]> = {
  'blue-raspberry': ['berry', 'ice', 'berry', 'ice', 'berry', 'berry', 'ice', 'berry'],
  'mango-fuego': ['mango', 'mango', 'mango', 'mango', 'mango', 'mango', 'mango', 'mango'],
  watermelon: ['wedge', 'wedge', 'wedge', 'wedge', 'wedge', 'wedge', 'wedge', 'wedge'],
  'strawberry-kiwi': ['strawberry', 'kiwi', 'strawberry', 'kiwi', 'strawberry', 'kiwi', 'strawberry', 'kiwi'],
  peach: ['peach', 'peach', 'peach', 'peach', 'peach', 'peach', 'peach', 'peach'],
  'blackout-berry': ['berry', 'berry', 'berry', 'berry', 'berry', 'berry', 'berry', 'berry'],
  'falsa-frost': ['berry', 'ice', 'berry', 'berry', 'ice', 'berry', 'berry', 'ice'],
  'cold-coffee': ['ice', 'ice', 'ice', 'ice', 'ice', 'ice', 'ice', 'ice'],
};

// Fixed layout: pieces sit around (never in front of) the can column, far ones blurrier.
const LAYOUT: Omit<Piece, 'kind'>[] = [
  { x: 24, y: 30, size: 7, depth: 0.9, rotate: -18, delay: 0 },
  { x: 72, y: 24, size: 5, depth: 0.5, rotate: 22, delay: -3 },
  { x: 16, y: 62, size: 9, depth: 0.25, rotate: 12, delay: -6 },
  { x: 82, y: 58, size: 8, depth: 0.35, rotate: -30, delay: -2 },
  { x: 36, y: 14, size: 4, depth: 1, rotate: 40, delay: -8 },
  { x: 64, y: 72, size: 6, depth: 0.7, rotate: 8, delay: -5 },
  { x: 8, y: 22, size: 5, depth: 0.8, rotate: -6, delay: -9 },
  { x: 92, y: 34, size: 6, depth: 0.6, rotate: 28, delay: -4 },
];

const BUBBLES = Array.from({ length: 22 }, (_, i) => ({
  x: (i * 37) % 100,
  size: 3 + ((i * 7) % 6),
  duration: 7 + ((i * 13) % 9),
  delay: -((i * 11) % 12),
}));

/** Generates a 128² monochrome noise tile once for the film grain overlay. */
function useGrainTile() {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(128, 128);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = Math.random() * 255;
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    setUrl(canvas.toDataURL('image/png'));
  }, []);
  return url;
}

/**
 * Flavor atmosphere behind the canvas (fruit, splash, bubbles, flavor wipe) and a
 * grain + vignette overlay above it. Decorative only; quality tiers and reduced
 * motion are handled in CSS via [data-quality] and the media query.
 */
export const Atmosphere: React.FC<AtmosphereProps> = ({ scene, flavorSlug, accentToken }) => {
  const pieces = useMemo<Piece[]>(() => {
    const kinds = KINDS[flavorSlug] ?? KINDS['blue-raspberry'];
    return LAYOUT.map((spot, i) => ({ ...spot, kind: kinds[i] }));
  }, [flavorSlug]);
  const grain = useGrainTile();
  const [wipeKey, setWipeKey] = useState(0);
  // The bear's roar at the end of the intro: one accent shockwave behind the hero can.
  const [roarKey, setRoarKey] = useState(0);
  useEffect(() => {
    const onRoar = () => setRoarKey((key) => key + 1);
    document.documentElement.addEventListener('grizzly:roar', onRoar);
    return () => document.documentElement.removeEventListener('grizzly:roar', onRoar);
  }, []);
  const [lastFlavor, setLastFlavor] = useState(flavorSlug);

  if (flavorSlug !== lastFlavor) {
    setLastFlavor(flavorSlug);
    setWipeKey((key) => key + 1);
  }

  return (
    <>
      <div className="atmosphere" aria-hidden="true" data-scene={scene} data-flavor-kind={flavorSlug}>
        <div className="atmosphere__splash" />
        <div className="atmosphere__fruit" key={flavorSlug}>
          {pieces.map((piece, i) => (
            <svg
              key={i}
              className="fruit"
              viewBox="0 0 100 100"
              style={
                {
                  '--x': piece.x,
                  '--y': piece.y,
                  '--size': piece.size,
                  '--depth': piece.depth,
                  '--rotate': `${piece.rotate}deg`,
                  '--delay': `${piece.delay}s`,
                } as React.CSSProperties
              }
            >
              {FRUIT[piece.kind]}
            </svg>
          ))}
        </div>
        <div className="atmosphere__bubbles">
          {BUBBLES.map((bubble, i) => (
            <span
              key={i}
              style={
                {
                  '--x': bubble.x,
                  '--size': `${bubble.size}px`,
                  '--duration': `${bubble.duration}s`,
                  '--delay': `${bubble.delay}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
        {roarKey > 0 && (
          <div key={`roar-${roarKey}`} className="roar" data-accent={accentToken}>
            <span />
            <span />
          </div>
        )}
        {wipeKey > 0 && <div key={wipeKey} className="flavor-wipe" data-accent={accentToken} />}
      </div>
      <div className="film" aria-hidden="true" style={{ '--grain': grain ? `url(${grain})` : 'none' } as React.CSSProperties} />
    </>
  );
};
