import React from 'react';
import type { HomeScene } from '../hooks/useHomeScroll';
import { BRAND } from '../data/brand';
import { splitTagline } from '../data/tagline';

interface StageBackdropProps {
  scene: HomeScene;
  /** Flavor name lines, scattered as tiny letters behind the can in the flavor intro. */
  flavorLines?: string[];
}

const Letters: React.FC<{ word: string }> = ({ word }) => (
  <span className="flavor-letters__row">
    {word
      .replace(/\s+/g, '')
      .split('')
      .map((letter, index) => (
        <span key={index}>{letter}</span>
      ))}
  </span>
);

/**
 * Fixed background stack behind the WebGL canvas. Each scene owns one layer;
 * layers cross-fade on opacity only, and all colour comes from flavor tokens.
 * The giant tagline lives here so the can renders in front of it.
 */
export const StageBackdrop: React.FC<StageBackdropProps> = ({ scene, flavorLines = [] }) => {
  const floorScenes: HomeScene[] = ['hero', 'lineup', 'faq', 'newsletter'];
  return (
    <div className="stage-backdrop" aria-hidden="true" data-scene={scene}>
      <div className={`stage-layer stage-layer--floor ${floorScenes.includes(scene) ? 'is-visible' : ''}`} />
      <div className={`stage-layer stage-layer--hero-glow ${scene === 'hero' ? 'is-visible' : ''}`}>
        <span className="stage-glow stage-glow--a" />
        <span className="stage-glow stage-glow--b" />
      </div>
      <div className={`stage-layer stage-layer--flavor ${scene === 'flavor' || scene === 'benefit' ? 'is-visible' : ''}`} />
      <div className={`flavor-letters ${scene === 'flavor' ? 'is-active' : ''}`}>
        {flavorLines.filter(Boolean).map((line) => (
          <Letters key={line} word={line} />
        ))}
      </div>
      <div className={`stage-layer stage-layer--clouds ${scene === 'argument' ? 'is-visible' : ''}`}>
        <span className="stage-cloud stage-cloud--1" />
        <span className="stage-cloud stage-cloud--2" />
        <span className="stage-cloud stage-cloud--3" />
        <span className="stage-cloud stage-cloud--4" />
        <span className="stage-cloud stage-cloud--5" />
        <p className="stage-giant display">
          {splitTagline(BRAND.tagline).map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
      </div>
    </div>
  );
};
