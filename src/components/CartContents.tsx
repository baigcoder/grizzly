import React, { useId, useState } from 'react';
import { formatPrice, getProductBySlug, getProductThumbUrl, PLACEHOLDER_PRICING, PRODUCTS } from '../data/products';
import { MIX_SLUG, useCart } from '../store/cart';
import { QuantityStepper } from './QuantityStepper';
import { ButtonLabel } from './ButtonLabel';
import { CanTop } from './CanTop';

interface CartContentsProps {
  onNavigate: (url: string) => void;
  headingId: string;
  /** The checkout page shows a read-only summary instead of controls. */
  readOnly?: boolean;
  /** The heading level: h1 when this is the whole page (/cart), h2 inside the drawer and checkout. */
  headingAs?: 'h1' | 'h2';
}

type PromoState = 'idle' | 'error' | 'success';

/** Bag line items, delivery progress, promo, totals; shared by drawer, /cart and checkout. */
export const CartContents: React.FC<CartContentsProps> = ({ onNavigate, headingId, readOnly = false, headingAs: Heading = 'h2' }) => {
  const { items, totalCount, totals, updateQuantity, removeItem, undoRemove, removed, promo, applyPromo, removePromo, persistent, saved, saveForLater, moveToBag, removeSaved } = useCart();
  const [code, setCode] = useState('');
  const [promoState, setPromoState] = useState<PromoState>('idle');
  const [promoMessage, setPromoMessage] = useState('');
  const promoId = useId();

  const submitPromo = (event: React.FormEvent) => {
    event.preventDefault();
    const result = applyPromo(code);
    if (result.ok) {
      setPromoState('success');
      setPromoMessage(`Code applied: ${result.percent}% off.`);
      setCode('');
    } else {
      setPromoState('error');
      setPromoMessage(result.reason === 'empty' ? 'Enter a promo code.' : 'That code isn’t valid. Check the spelling and try again.');
    }
  };

  return (
    <div className="bag">
      <Heading id={headingId} className="bag__title display">
        {readOnly ? 'Order summary' : 'Your bag'} <span className="bag__count">{totalCount > 0 ? `(${totalCount})` : ''}</span>
      </Heading>

      {!readOnly && (
        <div className="bag__undo-region" role="status">
          {removed && (
            <div className="bag__undo">
              <span>Removed {removed.item.productName}.</span>
              <button type="button" className="text-button" onClick={undoRemove}>Undo</button>
            </div>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="bag__empty">
          {/* the range, fanned out: each can opens its flavor */}
          <ul className="bag__empty-cans">
            {PRODUCTS.map((product, index) => (
              <li key={product.slug} style={{ '--i': index - (PRODUCTS.length - 1) / 2 } as React.CSSProperties}>
                <a
                  href={`/products/${product.slug}`}
                  aria-label={product.name}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(`/products/${product.slug}`);
                  }}
                >
                  <img src={getProductThumbUrl(product)} alt="" width={187} height={491} loading="lazy" decoding="async" />
                </a>
              </li>
            ))}
          </ul>
          <p className="bag__empty-title">Your bag is empty.</p>
          <p className="bag__empty-text">Pick a flavor to get started.</p>
          <a
            className="button-primary"
            href="/#gamme"
            onClick={(event) => {
              event.preventDefault();
              onNavigate('/#gamme');
            }}
          >
            <ButtonLabel>Explore the range</ButtonLabel>
          </a>
        </div>
      ) : (
        <>
          {!readOnly && (
            <div className="delivery-progress">
              <p className="delivery-progress__text">
                {totals.toFreeDelivery > 0
                  ? `Add ${formatPrice(totals.toFreeDelivery)} more for free delivery.`
                  : 'You’ve unlocked free delivery.'}
              </p>
              <span
                className="delivery-progress__bar"
                role="progressbar"
                aria-label="Progress to free delivery"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(totals.freeDeliveryProgress * 100)}
                style={{ '--progress': totals.freeDeliveryProgress } as React.CSSProperties}
              />
            </div>
          )}

          <ul className="bag__items">
            {items.map((item) => {
              const product = item.productSlug === MIX_SLUG ? undefined : getProductBySlug(item.productSlug);
              const name = `${item.productName}, ${item.packLabel}`;
              return (
                <li key={item.id} className="bag-item" data-accent={product?.accentToken}>
                  {item.mix ? (
                    <span className="bag-item__mix" aria-hidden="true">
                      {item.mix.slice(0, 4).map((entry) => (
                        <CanTop key={entry.slug} slug={entry.slug} size="small" />
                      ))}
                    </span>
                  ) : (
                    <img className="bag-item__image" src={getProductThumbUrl({ slug: item.productSlug })} alt="" width="54" height="96" />
                  )}
                  <div className="bag-item__body">
                    {product ? (
                      <a
                        className="bag-item__name"
                        href={`/products/${item.productSlug}`}
                        onClick={(event) => {
                          event.preventDefault();
                          onNavigate(`/products/${item.productSlug}`);
                        }}
                      >
                        {item.productName}
                      </a>
                    ) : (
                      <span className="bag-item__name">{item.productName}</span>
                    )}
                    <span className="bag-item__meta">
                      {item.packLabel} at {formatPrice(item.price)}
                      {item.mix && <span className="bag-item__mix-list">{item.flavor}</span>}
                    </span>
                    {readOnly ? (
                      <span className="bag-item__meta">Quantity {item.quantity}</span>
                    ) : (
                      <div className="bag-item__actions">
                        <QuantityStepper value={item.quantity} onChange={(value) => updateQuantity(item.id, value)} label={name} min={0} size="compact" />
                        <button type="button" className="text-button" onClick={() => saveForLater(item.id)} aria-label={`Save ${name} for later`}>
                          Save for later
                        </button>
                        <button type="button" className="text-button" onClick={() => removeItem(item.id)} aria-label={`Remove ${name}`}>
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="bag-item__total">{formatPrice(item.price * item.quantity)}</span>
                </li>
              );
            })}
          </ul>

          {!readOnly && (
            <form className="promo" onSubmit={submitPromo} noValidate>
              {promo ? (
                <p className="promo__applied">
                  Code <strong>{promo.code}</strong> applied ({promo.percent}% off).{' '}
                  <button type="button" className="text-button" onClick={removePromo}>Remove code</button>
                </p>
              ) : (
                <>
                  <label htmlFor={promoId} className="field-legend">Promo code</label>
                  <div className={`promo__row ${promoState === 'error' ? 'is-invalid' : ''}`}>
                    <input
                      id={promoId}
                      className="promo__input"
                      value={code}
                      autoComplete="off"
                      aria-invalid={promoState === 'error'}
                      aria-describedby={`${promoId}-message`}
                      onChange={(event) => {
                        setCode(event.target.value);
                        if (promoState !== 'idle') setPromoState('idle');
                      }}
                    />
                    <button type="submit" className="button-outline">Apply</button>
                  </div>
                </>
              )}
              <p id={`${promoId}-message`} className={`promo__message ${promoState === 'error' ? 'is-error' : ''}`} role={promoState === 'error' ? 'alert' : 'status'}>
                {promoState !== 'idle' && promoMessage}
              </p>
            </form>
          )}

          <dl className="bag__summary">
            <div className="bag__row"><dt>Subtotal</dt><dd>{formatPrice(totals.subtotal)}</dd></div>
            {totals.discount > 0 && <div className="bag__row"><dt>Discount</dt><dd>−{formatPrice(totals.discount)}</dd></div>}
            <div className="bag__row"><dt>Delivery</dt><dd>{totals.delivery === 0 ? 'Free' : formatPrice(totals.delivery)}</dd></div>
            <div className="bag__row bag__row--total"><dt>Total</dt><dd className="bag__subtotal">{formatPrice(totals.total)}</dd></div>
          </dl>
          <p className="bag__note">
            {PLACEHOLDER_PRICING && 'Prices and delivery fees are placeholders. '}
            {!persistent && 'Your bag is kept for this visit only.'}
          </p>
          {!readOnly && (
            <a
              className="button-primary button-primary--block"
              href="/checkout"
              onClick={(event) => {
                event.preventDefault();
                onNavigate('/checkout');
              }}
            >
              <ButtonLabel>Check out</ButtonLabel>
            </a>
          )}
        </>
      )}

      {!readOnly && saved.length > 0 && (
        <section className="saved" aria-labelledby={`${headingId}-saved`}>
          <h3 id={`${headingId}-saved`} className="saved__title">Saved for later ({saved.length})</h3>
          <ul className="saved__list">
            {saved.map((item) => {
              const name = `${item.productName}, ${item.packLabel}`;
              return (
                <li key={item.id} className="saved__item">
                  {item.mix ? (
                    <span className="bag-item__mix" aria-hidden="true">
                      {item.mix.slice(0, 2).map((entry) => (
                        <CanTop key={entry.slug} slug={entry.slug} size="small" />
                      ))}
                    </span>
                  ) : (
                    <img className="saved__image" src={getProductThumbUrl({ slug: item.productSlug })} alt="" width="32" height="56" />
                  )}
                  <span className="saved__name">
                    {name}
                    <span className="bag-item__meta">{item.quantity} × {formatPrice(item.price)}</span>
                  </span>
                  <span className="saved__actions">
                    <button type="button" className="button-outline" onClick={() => moveToBag(item.id)} aria-label={`Move ${name} to bag`}>
                      Move to bag
                    </button>
                    <button type="button" className="text-button" onClick={() => removeSaved(item.id)} aria-label={`Delete ${name} from saved items`}>
                      Delete
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
};
