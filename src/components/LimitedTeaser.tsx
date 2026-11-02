import React, { useEffect, useState } from 'react';
import { versioned } from '../data/assetVersion';
import { PRODUCTS, formatPrice } from '../data/products';
import { useCart } from '../store/cart';
import { audioManager } from '../audio/audioManager';

const SEEN_KEY = 'grizzly_limited_teaser_v2';
const DELAY_MS = 5000;
/** Every flavor marked as an edition in grizzly.json: a new drop joins the card on its own. */
const LIMITED = PRODUCTS.filter((product) => product.edition);

/**
 * A once-per-visit teaser for the limited editions on the home page, all on sale: a small glass card in the corner
 * where the visitor picks a can and adds it to the bag right there, or opens /limited (on phones a slim pill that
 * opens /limited, so it never covers the hero's flavor name). It comes in once the hero has settled, sitting above
 * the storage notice when that is up (--notice-h); closing or following it hides it for the rest of this visit
 * (sessionStorage), so the next visit shows it again.
 */
export const LimitedTeaser: React.FC<{ isReady: boolean; isHome: boolean; onNavigate: (url: string) => void }> = ({ isReady, isHome, onNavigate }) => {
  const [visible, setVisible] = useState(false);
  const [pick, setPick] = useState(0);
  const [added, setAdded] = useState(false);
  const { addItem, toggleCart } = useCart();

  useEffect(() => {
    if (!isReady || !isHome) return;
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(SEEN_KEY) === '1';
    } catch {
      seen = false;
    }
    if (seen) return;
    const timer = window.setTimeout(() => setVisible(true), DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isReady, isHome]);

  useEffect(() => {
    if (!isHome) setVisible(false);
  }, [isHome]);

  const close = () => {
    try {
      window.sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      // still hide it for this visit
    }
    setVisible(false);
  };

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  if (!visible || LIMITED.length === 0) return null;
  const product = LIMITED[Math.min(pick, LIMITED.length - 1)];
  const single = product.packOptions.find((option) => option.count === 1) ?? product.packOptions[0];
  const middle = (LIMITED.length - 1) / 2;
  return (
    <aside className="limited-teaser" aria-label="Limited editions" data-accent={product.accentToken}>
      <span className="limited-teaser__cans" role="group" aria-label="Choose a limited flavor">
        {LIMITED.map((item, index) => (
          <button
            key={item.slug}
            type="button"
            className="limited-teaser__can"
            aria-pressed={item.slug === product.slug}
            aria-label={item.name}
            onClick={() => {
              setPick(index);
              setAdded(false);
            }}
            style={{ '--i': index - middle } as React.CSSProperties}
          >
            <img src={versioned(`/products/thumbs/${item.slug}.webp`)} alt="" width={187} height={491} />
          </button>
        ))}
      </span>
      <span className="limited-teaser__copy">
        <span className="limited-teaser__eyebrow">Limited editions · Available now</span>
        <span className="limited-teaser__title display">{product.name}</span>
        <span className="limited-teaser__price">
          {formatPrice(single.price)} {single.count === 1 ? 'a can' : `for ${single.label}`}
        </span>
        <span className="limited-teaser__actions">
          <button
            type="button"
            className={`button-primary button-primary--small limited-teaser__add ${added ? 'is-success' : ''}`}
            onClick={() => {
              const outcome = addItem(product, single.id, 1);
              if (!outcome.ok) return;
              setAdded(true);
              audioManager.play('open');
              toggleCart(true);
            }}
          >
            {added ? 'Added to bag' : 'Add to bag'}
          </button>
          <a
            className="limited-teaser__link"
            href="/limited"
            onClick={(event) => {
              event.preventDefault();
              close();
              onNavigate('/limited');
            }}
          >
            See the drops →
          </a>
        </span>
      </span>
      <button type="button" className="limited-teaser__close" onClick={close} aria-label="Close">
        ×
      </button>
    </aside>
  );
};
