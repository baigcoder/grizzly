import React from 'react';
import { PRODUCTS, PLACEHOLDER_PRICING, formatPrice, getProductThumbUrl } from '../data/products';
import { BRAND, BADGES } from '../data/brand';
import { ButtonLabel } from './ButtonLabel';
import { useLocale } from '../locale';

interface ShopPageProps {
  onNavigate: (url: string) => void;
}

/**
 * The range as a shop page: one card per flavor with the can, the taste line and the starting
 * price, plus a way into the mix-your-own pack. Every card is a real link (crawlable, keyboard
 * friendly); the cards share the flavor accent tokens with the rest of the site.
 */
export const ShopPage: React.FC<ShopPageProps> = ({ onNavigate }) => {
  const { t } = useLocale();
  return (
  <section className="shop-page" aria-labelledby="shop-title">
    <header className="shop-page__head">
      <h1 id="shop-title" className="display shop-page__title">{t('shopTitle')}</h1>
      <p className="shop-page__lead">
        Eight flavors of {BRAND.productType.toLowerCase()}, {BRAND.volume} cans. {BADGES.join(' · ')}. {BRAND.origin}.
      </p>
    </header>

    <ul className="shop-grid">
      {PRODUCTS.map((product) => (
        <li key={product.slug} data-accent={product.accentToken}>
          <a
            className="shop-card"
            href={`/products/${product.slug}`}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(`/products/${product.slug}`);
            }}
          >
            <img className="shop-card__can" src={getProductThumbUrl(product)} alt={`${product.name} can`} width={187} height={491} loading="lazy" decoding="async" />
            <span className="shop-card__body">
              {product.edition && <span className="shop-card__tag">{product.edition}</span>}
              <span className="shop-card__name display">{product.name}</span>
              <span className="shop-card__taste">{product.tagline}</span>
              <span className="shop-card__price">
                From {formatPrice(product.packOptions[0].price)}
                {PLACEHOLDER_PRICING && <span className="shop-card__note"> · placeholder price</span>}
              </span>
              <span className="shop-card__cta">{t('viewAndAdd')}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>

    <aside className="shop-page__mix" aria-label="Mix your own pack">
      <p>Can't pick one? Fill a 6, 12 or 24 can pack with any mix of flavors.</p>
      <a
        className="button-primary"
        href="/mix"
        onClick={(event) => {
          event.preventDefault();
          onNavigate('/mix');
        }}
      >
        <ButtonLabel>{t('mixOwn')}</ButtonLabel>
      </a>
    </aside>
  </section>
  );
};
