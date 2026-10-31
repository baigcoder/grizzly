import React from 'react';
import { HALAL_PAGE, BRAND, isTodo } from '../data/brand';
import { BenefitIcon } from './BenefitIcons';
import { HalalSeal } from './HalalSeal';
import { PRODUCTS, getProductThumbUrl } from '../data/products';

/**
 * Halal and Zamzam story, in the dawn gold of the home page's Zamzam chapter. Only confirmed facts are shown: each
 * card carries a confirmed line, and the brand's verified details (certificate, sourcing, production) join it once
 * they are supplied. Until then one quiet note says so, instead of a row of empty "to be confirmed" boxes.
 */
export const HalalPage: React.FC = () => {
  const pending = [HALAL_PAGE.certificate, HALAL_PAGE.zamzam, HALAL_PAGE.process].some(isTodo);
  const detail = (value: string) => (isTodo(value) ? null : <p className="story-block__text">{value}</p>);

  return (
    <article className="story story--halal is-active" aria-labelledby="story-title">
      <header className="story__hero">
        <div className="story__heading">
          <p className="story__script" lang="ar" dir="rtl" aria-hidden="true">
            حلال · زمزم
          </p>
          <h1 id="story-title" className="display story__title">{HALAL_PAGE.title}</h1>
          <p className="story__lead">{HALAL_PAGE.intro}</p>
        </div>
        <div className="story__seal"><HalalSeal /></div>
      </header>

      {/* the range, fanned on the water line in the golden light: every one of them halal, every one with Zamzam */}
      <ul className="story__cans" aria-hidden="true">
        {PRODUCTS.map((product, index) => (
          <li key={product.slug} style={{ '--i': index - (PRODUCTS.length - 1) / 2 } as React.CSSProperties}>
            <img src={getProductThumbUrl(product)} alt="" width={187} height={491} loading="lazy" decoding="async" />
          </li>
        ))}
      </ul>

      <div className="story__grid">
        <section className="story-block">
          <h2 className="story-block__title display"><span className="trust-badge__icon" aria-hidden="true">حلال</span>Halal certified</h2>
          <p className="story-block__text">Every can of {BRAND.name} is halal certified.</p>
          {detail(HALAL_PAGE.certificate)}
        </section>
        <section className="story-block">
          <h2 className="story-block__title display"><BenefitIcon type="zamzam" size={28} />Zamzam water</h2>
          <p className="story-block__text">Every can is made with added Zamzam water.</p>
          {detail(HALAL_PAGE.zamzam)}
        </section>
        <section className="story-block">
          <h2 className="story-block__title display">Made in Pakistan</h2>
          <p className="story-block__text">Made by {BRAND.company.name}.</p>
          {detail(HALAL_PAGE.process)}
        </section>
      </div>

      {pending && <p className="story__note">The certificate, sourcing and production details are published here once verified.</p>}
    </article>
  );
};
