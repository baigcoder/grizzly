import React from 'react';
import { SCENE_SEQUENCE } from '../webgl/sceneStates';
import { BENEFITS } from '../data/benefits';

interface ChapterRailProps {
  /** Index into SCENE_SEQUENCE of the section in view. */
  active: number;
  onJump: (sectionId: string) => void;
}

/** Short chapter names for the rail (the loop segment after the footer is not a chapter). */
const LABELS: Record<string, string> = {
  gamme: 'Flavors',
  profile: 'Taste',
  'benefits-1': BENEFITS[0]?.title ?? 'Benefit',
  'benefits-2': BENEFITS[1]?.title ?? 'Benefit',
  'benefits-3': BENEFITS[2]?.title ?? 'Benefit',
  'benefits-4': BENEFITS[3]?.title ?? 'Benefit',
  argument: 'Wild side',
  'full-gamme': 'Line-up',
  FAQ: 'FAQ',
  newsletter: 'Join',
};

const CHAPTERS = SCENE_SEQUENCE.filter(({ sectionId }) => sectionId in LABELS);

/**
 * Where you are in the story, and a way to jump: a slim vertical rail of chapter marks on the left edge (desktop).
 * The active chapter's mark grows and its name shows; hovering or focusing any mark shows its name. Replaces the
 * frame's bare "03 – 10" index on wide screens. Plain buttons, so keyboard and screen readers get a real chapter list.
 */
export const ChapterRail: React.FC<ChapterRailProps> = ({ active, onJump }) => (
  <nav className="chapter-rail" aria-label="Chapters">
    <ol>
      {CHAPTERS.map(({ sectionId }, index) => {
        const isActive = Math.min(active, CHAPTERS.length - 1) === index;
        return (
          <li key={sectionId}>
            <button
              type="button"
              className={`chapter-rail__mark ${isActive ? 'is-active' : ''}`}
              aria-current={isActive ? 'step' : undefined}
              onClick={() => onJump(sectionId)}
            >
              <span className="chapter-rail__num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <span className="chapter-rail__label">{LABELS[sectionId]}</span>
            </button>
          </li>
        );
      })}
    </ol>
  </nav>
);
