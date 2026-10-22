import React from 'react';
import { BRAND } from '../data/brand';
import { splitTagline } from '../data/tagline';

interface ArgumentSectionProps {
  isActive: boolean;
}

/**
 * The tagline moment. On wide screens the giant type and cloud field live in the fixed
 * StageBackdrop (behind the can); this section carries the accessible heading
 * and claim, and holds the scroll position for the scene.
 */
export const ArgumentSection: React.FC<ArgumentSectionProps> = ({ isActive }) => (
  <section id="argument" className={`home-section argument ${isActive ? 'is-active' : ''}`} aria-labelledby="argument-title">
    <h2 id="argument-title" className="sr-only">{BRAND.tagline}</h2>
    <p className="sr-only">
      Natural caffeine, natural electrolytes, B vitamins and added Zamzam water.
    </p>
    {/* Phones: the tagline at the foot of the frame under the whole can (the giant type behind it is desktop only) */}
    <p className="argument__tagline display" aria-hidden="true">
      {splitTagline(BRAND.tagline).map((line) => (
        <span key={line}>{line}</span>
      ))}
    </p>
  </section>
);
