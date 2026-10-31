import React from 'react';
import { getProductBySlug } from '../data/products';
import { LimitedCountdown } from './LimitedCountdown';
import { ButtonLabel } from './ButtonLabel';


interface Edition {
  slug: string;
  name: string;
  tag: string;
  story: string;
  facts: string[];
  /** On sale (links to its product page) or announced. */
  status: 'available' | 'soon';
  field: string;
  ink: string;
  metal: string;
}

/**
 * The limited editions. Blackout Berry is on sale (grizzly.json limitedEdition); Falsa Frost and Cold Coffee are the
 * next drops, shown with their cans but not yet orderable (they are not in the product data).
 */
const EDITIONS: Edition[] = [
  {
    slug: 'blackout-berry',
    name: 'Blackout Berry',
    tag: 'Drop 01 · On sale now',
    story: 'Dark berries in a deep purple can: the night batch. Bold and juicy with a smooth finish, here while it lasts.',
    facts: ['250 ml', 'Natural caffeine', 'Added Zamzam water'],
    status: 'available',
    field: '#9b5de5',
    ink: '#2a1747',
    metal: '#dfe3e8',
  },
  {
    slug: 'falsa-frost',
    name: 'Falsa Frost',
    tag: 'Batch 001 · Coming soon',
    story: 'Falsa, the sweet-tart berry of a Pakistani summer, served ice cold. A night-plum can with a gold bear, in numbered batches.',
    facts: ['250 ml', 'Natural caffeine', 'Added Zamzam water'],
    status: 'soon',
    field: '#241029',
    ink: '#e8559c',
    metal: '#e6c47e',
  },
  {
    slug: 'cold-coffee',
    name: 'Cold Coffee',
    tag: 'Café batch · Coming soon',
    story: 'Cold coffee with milk and natural caffeine from green coffee beans. A caramel can with a copper bear. Contains milk.',
    facts: ['250 ml', 'With milk', 'Added Zamzam water'],
    status: 'soon',
    field: '#9a6440',
    ink: '#22120a',
    metal: '#ebbd93',
  },
];

const thumb = (slug: string) => `/products/thumbs/${slug}.webp`;

/**
 * Limited editions: a cinematic hero (the three cans fanned over their colour glows), then one panel per edition in
 * its own can's world (field colour, the label's claw slashes, a turning ring of light round the can), alternating
 * sides, and a way back to the range. CSS only: transforms and opacity; reduced motion keeps everything still.
 */
export const LimitedPage: React.FC<{ onNavigate: (url: string) => void }> = ({ onNavigate }) => {
  const go = (url: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    onNavigate(url);
  };

  return (
    <article className="limited" aria-labelledby="limited-title">
      <header className="limited__hero">
        <div className="limited__glows" aria-hidden="true">
          {EDITIONS.map((edition, index) => (
            <span key={edition.slug} style={{ '--glow': edition.field, '--i': index } as React.CSSProperties} />
          ))}
        </div>
        <p className="limited__eyebrow">Grizzly Energy</p>
        <h1 id="limited-title" className="display limited__title">
          <span className="limited__title-outline">Limited</span>
          <span>editions</span>
        </h1>
        <p className="limited__lead">Small batches. Bold flavors. Gone when they’re gone.</p>
        <ul className="limited__fan" aria-hidden="true">
          {EDITIONS.map((edition, index) => (
            <li key={edition.slug} style={{ '--i': index - 1, '--glow': edition.field } as React.CSSProperties}>
              <img src={thumb(edition.slug)} alt="" width={187} height={491} decoding="async" />
            </li>
          ))}
        </ul>
        <a className="limited__scroll" href={`#edition-${EDITIONS[0].slug}`}>
          Meet the drops
        </a>
      </header>

      {EDITIONS.map((edition, index) => {
        const product = edition.status === 'available' ? getProductBySlug(edition.slug) : undefined;
        return (
          <section
            key={edition.slug}
            id={`edition-${edition.slug}`}
            className={`edition ${index % 2 ? 'edition--flip' : ''}`}
            style={{ '--field': edition.field, '--ink': edition.ink, '--metal': edition.metal } as React.CSSProperties}
            aria-labelledby={`edition-${edition.slug}-name`}
          >
            <div className="edition__copy">
              <p className="edition__number display" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </p>
              <p className="edition__tag">{edition.tag}</p>
              <h2 id={`edition-${edition.slug}-name`} className="display edition__name">
                {edition.name}
              </h2>
              <p className="edition__story">{edition.story}</p>
              <ul className="edition__facts">
                {edition.facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
              {product ? (
                <>
                  <LimitedCountdown slug={edition.slug} />
                  <a className="button-primary edition__cta" href={`/products/${product.slug}`} onClick={go(`/products/${product.slug}`)}>
                    <ButtonLabel>Get it now</ButtonLabel>
                  </a>
                </>
              ) : (
                <p className="edition__soon">Coming soon</p>
              )}
            </div>
            <div className="edition__stage" aria-hidden="true">
              <span className="edition__ring" />
              <img className="edition__can" src={thumb(edition.slug)} alt="" width={187} height={491} loading="lazy" decoding="async" />
            </div>
          </section>
        );
      })}

      <footer className="limited__outro">
        <p className="display limited__outro-title">Can’t wait?</p>
        <p className="limited__lead">The original six are always on.</p>
        <a className="button-primary" href="/shop" onClick={go('/shop')}>
          <ButtonLabel>Shop the range</ButtonLabel>
        </a>
      </footer>
    </article>
  );
};
