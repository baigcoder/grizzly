import React, { useRef } from 'react';
import { BRAND } from '../data/brand';
import { FLAVORS } from '../data/flavors';
import { RevealText } from './RevealText';
import { useLocale, FLAVOR_NAMES_UR } from '../locale';

interface HeroCarouselProps {
  activeIndex: number;
  isActive: boolean;
  onSelectFlavor: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
}

const ArrowDots: React.FC<{ direction: 'prev' | 'next' }> = ({ direction }) => (
  <svg viewBox="0 0 10 20" className={`hero-arrow__dots hero-arrow__dots--${direction}`} aria-hidden="true">
    <circle cx="9" cy="1.5" r="1.2" opacity="0.35" />
    <circle cx="5.5" cy="5.5" r="1.2" opacity="0.6" />
    <circle cx="1.5" cy="10" r="1.4" />
    <circle cx="5.5" cy="14.5" r="1.2" opacity="0.6" />
    <circle cx="9" cy="18.5" r="1.2" opacity="0.35" />
  </svg>
);

/**
 * Hero HUD over the 3D ring: prev/next arrows beside the focused can, flavor
 * name, rainbow flavor slider and the scroll prompt. The ring itself is WebGL.
 */
export const HeroCarousel: React.FC<HeroCarouselProps> = ({ activeIndex, isActive, onSelectFlavor, onPrev, onNext }) => {
  const flavor = FLAVORS[activeIndex % FLAVORS.length];
  const { t, locale } = useLocale();
  const titleLines = locale === 'ur' ? [FLAVOR_NAMES_UR[flavor.id]] : [flavor.line1, flavor.line2].filter(Boolean);
  const sliderRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const last = FLAVORS.length - 1;

  const selectFromPointer = (clientX: number) => {
    const rect = sliderRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const index = Math.round(ratio * last);
    if (index !== activeIndex) {
      onSelectFlavor(index);
    }
  };

  const onSliderKeyDown = (event: React.KeyboardEvent) => {
    const keys: Record<string, number> = {
      ArrowRight: Math.min(last, activeIndex + 1),
      ArrowUp: Math.min(last, activeIndex + 1),
      ArrowLeft: Math.max(0, activeIndex - 1),
      ArrowDown: Math.max(0, activeIndex - 1),
      Home: 0,
      End: last,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    onSelectFlavor(keys[event.key]);
  };

  return (
    <section id="gamme" className={`home-section hero ${isActive ? 'is-active' : ''}`} aria-label="Flavors">
      <h1 className="sr-only">Grizzly Energy, natural energy drinks in six flavors</h1>
      {/* The direct answer to "What is Grizzly Energy?" comes first in the document (same text as the FAQ answer). */}
      <p className="sr-only" id="what-is-grizzly">{BRAND.summary}</p>

      <button type="button" className="hero-arrow hero-arrow--prev" onClick={onPrev} aria-label="Previous flavor">
        <ArrowDots direction="prev" />
      </button>
      <button type="button" className="hero-arrow hero-arrow--next" onClick={onNext} aria-label="Next flavor">
        <ArrowDots direction="next" />
      </button>

      <div className="hero__hud">
        <div className="hero__title-wrap">
          <RevealText key={flavor.id + locale} id="hero-title" as="h2" className="hero__title display" lines={titleLines} label={locale === 'ur' ? undefined : flavor.name} joiner={flavor.name.includes(' ') ? ' ' : ''} split={locale === 'ur' ? 'lines' : 'chars'} />
        </div>

        <div
          ref={sliderRef}
          className="flavor-slider"
          role="slider"
          aria-orientation="horizontal"
          tabIndex={0}
          aria-label="Flavor"
          aria-valuemin={1}
          aria-valuemax={FLAVORS.length}
          aria-valuenow={activeIndex + 1}
          aria-valuetext={flavor.name}
          style={{ '--slider-position': activeIndex / last } as React.CSSProperties}
          onKeyDown={onSliderKeyDown}
          onPointerDown={(event) => {
            draggingRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            selectFromPointer(event.clientX);
          }}
          onPointerMove={(event) => draggingRef.current && selectFromPointer(event.clientX)}
          onPointerUp={() => {
            draggingRef.current = false;
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
          }}
        >
          <span className="flavor-slider__track" />
          <span className="flavor-slider__handle" />
        </div>

        <p className="hero__scroll-hint">{t('scroll')}</p>
      </div>
    </section>
  );
};
