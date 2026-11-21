import React, { useEffect, useRef, useState } from 'react';
import { versioned } from '../data/assetVersion';
import { PRODUCTS, formatPrice } from '../data/products';
import { useCart } from '../store/cart';
import { audioManager } from '../audio/audioManager';
import { NOTICE_LAYOUT_EVENT } from './noticeLayout';

const SEEN_KEY = 'grizzly_limited_teaser_v2';
const DELAY_MS = 5000;
/** Every flavor marked as an edition in grizzly.json: a new drop joins the card on its own. */
const LIMITED = PRODUCTS.filter((product) => product.edition);
/** Clear space kept between the card and the hero slider, and the narrowest the slider is ever squeezed to. */
const SLIDER_GAP_PX = 24;
const SLIDER_MIN_PX = 160;

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
  const cardRef = useRef<HTMLElement>(null);

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

  // lets the hero step its bottom hint aside on phones while the pill is up (limited.css)
  useEffect(() => {
    if (!visible) return;
    document.documentElement.dataset.teaser = '';
    return () => {
      delete document.documentElement.dataset.teaser;
    };
  }, [visible]);

  // The card sits bottom-right and the hero slider is centred: on laptop widths they share a row and the card sat on
  // the slider's right end. When (and only when) they overlap vertically, publish how wide the centred slider may be
  // so it stops short of the card (--slider-clear-w, used by .flavor-slider in home.css). It is derived from the card's
  // edge, never from the slider's current width, so squeezing the slider cannot feed back into the measurement.
  useEffect(() => {
    if (!visible) return;
    const root = document.documentElement;
    const card = cardRef.current;
    if (!card) return;
    const update = () => {
      const slider = document.querySelector<HTMLElement>('.flavor-slider');
      const cardBox = card.getBoundingClientRect();
      const sliderBox = slider?.getBoundingClientRect();
      const shareRow = !!sliderBox && window.innerWidth >= 1024 && sliderBox.top < cardBox.bottom && sliderBox.bottom > cardBox.top;
      if (!shareRow) {
        root.style.removeProperty('--slider-clear-w');
        return;
      }
      const room = 2 * (cardBox.left - SLIDER_GAP_PX - window.innerWidth / 2);
      root.style.setProperty('--slider-clear-w', `${Math.max(SLIDER_MIN_PX, Math.floor(room))}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(card);
    window.addEventListener('resize', update);
    window.addEventListener(NOTICE_LAYOUT_EVENT, update); // the notice lifts the card and the HUD together
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener(NOTICE_LAYOUT_EVENT, update);
      root.style.removeProperty('--slider-clear-w');
    };
  }, [visible]);

  if (!visible || LIMITED.length === 0) return null;
  const product = LIMITED[Math.min(pick, LIMITED.length - 1)];
  const single = product.packOptions.find((option) => option.count === 1) ?? product.packOptions[0];
  const middle = (LIMITED.length - 1) / 2;
  return (
    <aside ref={cardRef} className="limited-teaser" aria-label="Limited editions" data-accent={product.accentToken}>
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
