import React from 'react';
import { FLAVORS } from '../data/flavors';
import { RevealText } from './RevealText';
import { RevealLines } from './RevealLines';

interface ProfileSectionProps {
  activeIndex: number;
  isActive: boolean;
  onViewDetails: (slug: string) => void;
}

/**
 * Flavor intro: title and description on the left (the scattered flavor letters
 * live in StageBackdrop, behind the can), the big tilted can (WebGL) in the centre.
 * The benefit icon rail on the right is shared with the benefit chapters.
 */
export const ProfileSection: React.FC<ProfileSectionProps> = ({ activeIndex, isActive, onViewDetails }) => {
  const flavor = FLAVORS[activeIndex % FLAVORS.length];

  return (
    <section
      id="profile"
      className={`home-section flavor-intro ${isActive ? 'is-active' : ''}`}
      aria-labelledby="flavor-title"
    >
      <div className="section-copy">
        <RevealText key={flavor.id} id="flavor-title" className="section-copy__title display" lines={[flavor.line1, flavor.line2].filter(Boolean)} label={flavor.name} joiner={flavor.name.includes(' ') ? ' ' : ''} />
        <div className="section-copy__body framed">
          <RevealLines key={flavor.id} className="section-copy__text" text={flavor.description} />
        </div>
        <a
          className="detail-link detail-link--left"
          aria-label={`View details and order ${flavor.name}`}
          href={`/products/${flavor.id}`}
          onClick={(event) => {
            event.preventDefault();
            onViewDetails(flavor.id);
          }}
        >
          View details & order
        </a>
      </div>
    </section>
  );
};
