import React from 'react';
import { BENEFITS } from '../data/benefits';
import { publicText } from '../data/brand';
import { audioManager } from '../audio/audioManager';
import { BenefitIcon } from './BenefitIcons';
import { RevealText } from './RevealText';
import { HalalSeal } from './HalalSeal';
import { RevealLines } from './RevealLines';

interface BenefitsSectionProps {
  activeChapter: number;
  showRail: boolean;
  onNavigateChapter: (chapterIndex: number) => void;
}

/**
 * Four benefit chapters, in label order. Each shows a spec tag, the benefit title
 * and copy; the WebGL can turns dark and lights only the matching block of its
 * label's right panel. The icon rail on the right navigates between chapters.
 */
export const BenefitsSection: React.FC<BenefitsSectionProps> = ({ activeChapter, showRail, onNavigateChapter }) => (
  <>
    <nav
      className={`benefit-rail ${showRail ? 'is-visible' : ''}`}
      aria-label="Benefits"
      aria-hidden={!showRail}
      style={{ '--rail-progress': activeChapter < 0 ? 0 : activeChapter / (BENEFITS.length - 1) } as React.CSSProperties}
    >
      <ol className="benefit-rail__list">
        {BENEFITS.map((benefit, index) => (
          <li key={benefit.id}>
            <button
              type="button"
              className={`benefit-rail__button ${activeChapter === index ? 'is-active' : ''}`}
              tabIndex={showRail ? 0 : -1}
              onClick={() => {
                audioManager.play('benefits');
                onNavigateChapter(index);
              }}
              aria-label={benefit.title}
              aria-current={activeChapter === index ? 'step' : undefined}
            >
              <BenefitIcon type={benefit.iconType} />
            </button>
          </li>
        ))}
      </ol>
    </nav>

    {BENEFITS.map((benefit, index) => (
      <section
        key={benefit.id}
        id={benefit.id}
        className={`home-section benefit benefit--${benefit.iconType} ${activeChapter === index ? 'is-active' : ''}`}
        aria-labelledby={`${benefit.id}-title`}
      >
        <div className="section-copy">
          {/* The label's hexagon badge, drawn in when the chapter becomes active. */}
          <span className="hex-emblem" aria-hidden="true">
            <svg className="hex-emblem__frame" viewBox="0 0 100 100">
              <polygon className="hex-emblem__outline" points="50,4 90,27 90,73 50,96 10,73 10,27" pathLength={1} />
              <polygon className="hex-emblem__inner" points="50,14 81,32 81,68 50,86 19,68 19,32" pathLength={1} />
            </svg>
            <BenefitIcon type={benefit.iconType} size={34} className="hex-emblem__icon" />
          </span>
          {/* Zamzam in Arabic calligraphy beside the emblem: decorative (the title says it), rendered from the chapter
              before so the Arabic font has arrived by the time it is written in. */}
          {benefit.iconType === 'zamzam' && activeChapter >= index - 1 && (
            <span className="zamzam-script" lang="ar" dir="rtl" aria-hidden="true">
              زمزم
            </span>
          )}
          <p className="benefit-count" aria-hidden="true">
            <span className="benefit-count__now">{String(index + 1).padStart(2, '0')}</span>
            <span className="benefit-count__of">/ {String(BENEFITS.length).padStart(2, '0')}</span>
          </p>
          <p className="replaced-tag">
            <span className="replaced-tag__box" aria-hidden="true">
              <BenefitIcon type={benefit.iconType} size={14} />
            </span>
            <span className="replaced-tag__label">{publicText(benefit.spec, 'Source to be confirmed')}</span>
          </p>
          <RevealText
            id={`${benefit.id}-title`}
            className="section-copy__title display"
            lines={benefit.titleLine2 ? [benefit.titleLine1, benefit.titleLine2] : [benefit.titleLine1]}
          />
          <RevealLines className="section-copy__text" text={publicText(benefit.description)} />
          {benefit.iconType === 'zamzam' && <HalalSeal inline />}
        </div>
      </section>
    ))}
  </>
);
