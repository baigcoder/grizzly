import React from 'react';
import { FLAVORS } from '../data/flavors';
import { RevealText } from './RevealText';
import { ButtonLabel } from './ButtonLabel';

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
          <p className="section-copy__text">{flavor.description}</p>
        </div>
        <a
          className="button-primary button-primary--small detail-link--left"
          aria-label={`View product: ${flavor.name}, details and order`}
          href={`/products/${flavor.id}`}
          onClick={(event) => {
            event.preventDefault();
            onViewDetails(flavor.id);
          }}
        >
          <ButtonLabel>View product</ButtonLabel>
        </a>
      </div>
    </section>
  );
};
