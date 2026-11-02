import React from 'react';
import { FLAVORS } from '../data/flavors';
import { useLocale } from '../locale';
import { ButtonLabel } from './ButtonLabel';
import { SCENE_SEQUENCE } from '../webgl/sceneStates';

/** Where the finale sits on the home scroll (0..1): the call to action fades once it is passed. */
const FINALE_AT = SCENE_SEQUENCE.findIndex((step) => step.sectionId === 'full-gamme') / (SCENE_SEQUENCE.length - 1);

interface FullGammeSectionProps {
  isActive: boolean;
  onShop: () => void;
}

/**
 * The finale: every can on a mountain-shaped lineup (WebGL), each lit in its own colour, with one
 * clear button to shop. The list names the range for assistive tech and crawlers.
 */
export const FullGammeSection: React.FC<FullGammeSectionProps> = ({ isActive, onShop }) => {
  const { t } = useLocale();
  return (
  <section id="full-gamme" className={`home-section lineup ${isActive ? 'is-active' : ''}`} aria-labelledby="lineup-title">
    <h2 id="lineup-title" className="sr-only">The range</h2>
    <ul className="sr-only">
      {FLAVORS.map((flavor) => (
        <li key={flavor.id}>{flavor.name}</li>
      ))}
    </ul>
    <div className="lineup__cta" style={{ '--section-at': FINALE_AT } as React.CSSProperties}>
      <p className="lineup__claims">{t('claims')}</p>
      <a
        className="button-primary"
        href="/shop"
        onClick={(event) => {
          event.preventDefault();
          onShop();
        }}
      >
        <ButtonLabel>{t('shopTheRange')}</ButtonLabel>
      </a>
    </div>
  </section>
  );
};
