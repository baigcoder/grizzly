import React from 'react';
import { ABOUT_PAGE, BRAND, BADGES, isTodo, publicText } from '../data/brand';
import { BENEFITS } from '../data/benefits';
import { PRODUCTS, getProductThumbUrl } from '../data/products';
import { BenefitIcon } from './BenefitIcons';
import { ButtonLabel } from './ButtonLabel';

const known = (value: string) => (isTodo(value) ? null : value);

/** "Hassan Baig" → "HB": the founder's monogram stands in until a photo is supplied. */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .slice(0, 2)
    .join('');

/**
 * Our story: who makes Grizzly, who founded it and what goes into every can. Built from confirmed facts only (the
 * brand data and the founder's name); the founding year, hometown, story, quote and photo appear once they are
 * filled in grizzly.json (aboutPage), and until then one quiet note says so instead of empty boxes.
 */
export const AboutPage: React.FC<{ onNavigate: (url: string) => void }> = ({ onNavigate }) => {
  const { founder } = ABOUT_PAGE;
  const founded = known(ABOUT_PAGE.founded);
  const hometown = known(ABOUT_PAGE.hometown);
  const story = known(ABOUT_PAGE.story);
  const quote = known(founder.quote);
  const bio = known(founder.bio);
  const photo = known(founder.photo);
  const pending = [ABOUT_PAGE.founded, ABOUT_PAGE.hometown, ABOUT_PAGE.story, founder.quote, founder.bio, founder.photo].some(isTodo);
  const go = (url: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    onNavigate(url);
  };

  const facts = [
    { value: String(PRODUCTS.length), label: 'Flavors' },
    { value: BRAND.volume.replace(/\s+/g, ''), label: 'Every can' },
    { value: String(BENEFITS.length), label: 'Benefits on the label' },
    ...(founded ? [{ value: founded, label: 'Founded' }] : []),
  ];

  return (
    <article className="about" aria-labelledby="about-title">
      <header className="about__hero">
        <div className="about__art" aria-hidden="true">
          <img src="/textures/grizzly/bear/blue-raspberry.webp" alt="" width="1024" height="614" decoding="async" />
        </div>
        <div className="about__intro">
          <p className="about__eyebrow">{ABOUT_PAGE.title}</p>
          <h1 id="about-title" className="display about__title">
            <span>Made in Pakistan.</span>
            <span className="about__title-accent">Made wild.</span>
          </h1>
          <p className="about__lead">{ABOUT_PAGE.intro}</p>
          {story && <p className="about__story">{story}</p>}
        </div>
      </header>

      <section className="about-founder" aria-labelledby="founder-title">
        <div className="about-founder__portrait">
          {photo ? (
            <img src={photo} alt={founder.name} />
          ) : (
            <span className="about-founder__monogram" aria-hidden="true">{initials(founder.name)}</span>
          )}
        </div>
        <div className="about-founder__body">
          <p className="about__eyebrow">{founder.role}</p>
          <h2 id="founder-title" className="display about-founder__name">{founder.name}</h2>
          <p className="about-founder__text">
            {founder.name} founded {BRAND.company.name}, the company behind {BRAND.name}
            {hometown ? `, in ${hometown}` : ''}.
          </p>
          {bio && <p className="about-founder__text">{bio}</p>}
          {quote && (
            <blockquote className="about-founder__quote">
              <p>“{quote}”</p>
              <footer>{founder.name}</footer>
            </blockquote>
          )}
        </div>
      </section>

      <ul className="about-facts" aria-label="Grizzly in numbers">
        {facts.map((fact) => (
          <li key={fact.label} className="about-facts__item">
            <span className="about-facts__value">{fact.value}</span>
            <span className="about-facts__label">{fact.label}</span>
          </li>
        ))}
      </ul>

      <section className="about-values" aria-labelledby="values-title">
        <h2 id="values-title" className="about__section-title display">What goes into every can</h2>
        <ul className="about-values__grid">
          {BENEFITS.map((benefit) => (
            <li key={benefit.id} className="about-value">
              <span className="about-value__icon"><BenefitIcon type={benefit.iconType} size={26} /></span>
              <h3 className="about-value__title">{benefit.title}</h3>
              <p className="about-value__text">{publicText(benefit.description)}</p>
            </li>
          ))}
        </ul>
        <ul className="about-values__badges" aria-label="Also">
          <li>Halal certified</li>
          {BADGES.map((badge) => (
            <li key={badge}>{badge}</li>
          ))}
        </ul>
      </section>

      <section className="about-range" aria-labelledby="range-title">
        <h2 id="range-title" className="about__section-title display">The range</h2>
        <ul className="about-range__cans">
          {PRODUCTS.map((product) => (
            <li key={product.slug}>
              <a href={`/products/${product.slug}`} onClick={go(`/products/${product.slug}`)}>
                <img src={getProductThumbUrl(product)} alt="" width="187" height="491" loading="lazy" />
                <span>{product.name}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="about-cta" aria-labelledby="cta-title">
        <h2 id="cta-title" className="display about-cta__title">{BRAND.tagline}</h2>
        <div className="about-cta__actions">
          <a className="button-primary" href="/shop" onClick={go('/shop')}>
            <ButtonLabel>Shop the range</ButtonLabel>
          </a>
          <a className="about-cta__link" href="/halal-zamzam" onClick={go('/halal-zamzam')}>
            Halal and Zamzam
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4" /></svg>
          </a>
        </div>
      </section>

      {pending && <p className="about__note">More of our story, including when and where Grizzly began, is added here as it is confirmed.</p>}
    </article>
  );
};
