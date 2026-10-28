import React, { useEffect, useId, useRef, useState } from 'react';
import {
  formatPrice,
  getProductBySlug,
  getProductThumbUrl,
  getRelatedProducts,
  PLACEHOLDER_PRICING,
  type PackOption,
} from '../data/products';
import { BENEFITS } from '../data/benefits';
import { BRAND, POLICIES, REVIEWS, confirmed, isTodo, publicText } from '../data/brand';
import { productFacts } from '../seo/meta';
import { useCart } from '../store/cart';
import { audioManager } from '../audio/audioManager';
import { QuantityStepper } from './QuantityStepper';
import { RevealText } from './RevealText';
import { ButtonLabel } from './ButtonLabel';
import { BenefitIcon } from './BenefitIcons';
import { flyToBag } from './flyToBag';
import { prefersReducedMotion } from '../hooks/useSmoothScroll';

/** Phones and narrow tablets (the stacked layout, the 3D stage above the purchase panel). */
const isStacked = () => typeof window !== 'undefined' && window.innerWidth < 1024;
/** The pack shown first: one can everywhere (the can is the hero; a picked pack then assembles in its place). */
const defaultPackId = (): PackOption['id'] => 'single';

/**
 * Glides the page to the top over `duration` ms (ease in-out), driven here rather than by native smooth scrolling,
 * which some browsers skip or cut short. Returns a cancel function; a touch or wheel from the visitor cancels it too.
 */
function glideToTop(duration: number): () => void {
  const from = window.scrollY;
  const start = performance.now();
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('wheel', stop);
  };
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    window.scrollTo(0, Math.round(from * (1 - eased)));
    if (t < 1) frame = requestAnimationFrame(step);
    else stop();
  };
  window.addEventListener('touchstart', stop, { passive: true });
  window.addEventListener('wheel', stop, { passive: true });
  frame = requestAnimationFrame(step);
  return stop;
}
import { InfoDrawer } from './InfoDrawer';
import { LimitedCountdown } from './LimitedCountdown';
import { sharePoster, type ShareOutcome } from './sharePoster';

interface ProductDetailPageProps {
  slug: string;
  onNavigate: (url: string) => void;
  onRotate: (deltaX: number, deltaY: number) => void;
  /** Release speed of a drag (px per ms): the can keeps spinning and slows down. */
  onFling: (velocityX: number) => void;
  /** The chosen pack's can count: the 3D scene shows that many cans in a tray behind the hero can. */
  onPackChange: (count: number) => void;
  onView: (view: 'FRONT' | 'BACK') => void;
  onHighlightBenefit: (index: number) => void;
  isWebglAvailable: boolean;
}

type AddState = 'idle' | 'adding' | 'added' | 'error';

const ADD_LABEL: Record<AddState, string> = {
  idle: 'Add to bag',
  adding: 'Adding…',
  added: 'Added to bag',
  error: 'Add to bag',
};

export const ProductDetailPage: React.FC<ProductDetailPageProps> = ({ slug, onNavigate, onRotate, onFling, onPackChange, onView, onHighlightBenefit, isWebglAvailable }) => {
  const product = getProductBySlug(slug);
  const { addItem, persistent } = useCart();
  const [packId, setPackId] = useState<PackOption['id']>(defaultPackId);
  /** Set when the visitor picks a pack (not on load or product change): only a pick scrolls the stage into view. */
  const packPickedRef = useRef(false);
  const [quantity, setQuantity] = useState(1);
  const [addState, setAddState] = useState<AddState>('idle');
  const [message, setMessage] = useState('');
  const [hotspot, setHotspot] = useState(-1);
  const [infoOpen, setInfoOpen] = useState(false);
  const [shareState, setShareState] = useState<ShareOutcome | 'working' | 'idle'>('idle');
  const timers = useRef<number[]>([]);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // The sticky buy bar shows only once the main Add to bag button has scrolled up out of view, so it never covers
  // the pack sizes and price it repeats. An IntersectionObserver whose area runs far below the screen reports it
  // without a layout read on every scroll frame: "out of the area" can only mean "passed through the top", so a jump
  // from below the button straight back to the top (which a plain viewport observer missed) still flips it.
  const [showBuyBar, setShowBuyBar] = useState(false);
  useEffect(() => {
    const button = addButtonRef.current;
    if (!button) return;
    const observer = new IntersectionObserver(([entry]) => setShowBuyBar(!entry.isIntersecting), {
      rootMargin: '0px 0px 100000px 0px',
    });
    observer.observe(button);
    return () => observer.disconnect();
  }, [slug]);
  // The can turns to its back label (nutrition and facts) while the facts section is on screen, and back to the
  // front above it. A manual Front / Back choice or a drag still works in between.
  const factsRef = useRef<HTMLElement>(null);
  const autoViewRef = useRef<'FRONT' | 'BACK'>('FRONT');
  const packGroupId = useId();

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  // Reset the purchase panel and the can when switching product.
  useEffect(() => {
    setPackId(defaultPackId());
    setQuantity(1);
    setAddState('idle');
    setMessage('');
    setHotspot(-1);
    onHighlightBenefit(-1);
  }, [slug, onHighlightBenefit]);

  useEffect(() => () => onHighlightBenefit(-1), [onHighlightBenefit]);

  // the 3D scene shows the chosen pack (the selected option's can count); back to a single can when the page closes
  const chosenCount = product?.packOptions.find((option) => option.id === packId)?.count ?? 1;
  // On phones the pack options sit below the 3D stage: a pick scrolls back up to it. The scene holds the new pack
  // until the stage is on screen (sceneManager.renderProduct), so the visitor always watches it assemble, even when
  // the glide is interrupted or slow.
  useEffect(() => {
    onPackChange(chosenCount);
    const picked = packPickedRef.current;
    packPickedRef.current = false;
    if (!picked || !isStacked() || window.scrollY < 60) return;
    if (prefersReducedMotion()) {
      window.scrollTo(0, 0);
      return;
    }
    return glideToTop(Math.min(900, 380 + window.scrollY * 0.5));
  }, [chosenCount, onPackChange]);
  useEffect(() => () => onPackChange(1), [onPackChange]);

  useEffect(() => {
    const facts = factsRef.current;
    if (!facts || typeof IntersectionObserver === 'undefined') return;
    autoViewRef.current = 'FRONT';
    const observer = new IntersectionObserver(
      ([entry]) => {
        const next = entry.isIntersecting ? 'BACK' : entry.boundingClientRect.top > 0 ? 'FRONT' : autoViewRef.current;
        if (next === autoViewRef.current) return;
        autoViewRef.current = next;
        onView(next);
      },
      { threshold: 0.25 }
    );
    observer.observe(facts);
    return () => observer.disconnect();
  }, [slug, onView]);

  if (!product) {
    return (
      <section className="pdp-missing" aria-labelledby="missing-title">
        <h1 id="missing-title" className="display pdp-missing__title">Flavor not found</h1>
        <p>We don’t have a flavor at this address. It may have been renamed.</p>
        <a className="button-primary" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/#gamme'); }}>
          <ButtonLabel>See all flavors</ButtonLabel>
        </a>
      </section>
    );
  }

  const pack = product.packOptions.find((option) => option.id === packId) ?? product.packOptions[0];
  const related = getRelatedProducts(product.slug);
  const lineTotal = pack.price * quantity;

  const handleAdd = () => {
    if (addState === 'adding') return;
    setAddState('adding');
    setMessage('');
    timers.current.push(
      window.setTimeout(() => {
        const result = addItem(product, pack.id, quantity);
        if (!result.ok) {
          setAddState('error');
          setMessage(
            result.reason === 'line-full'
              ? 'You already have the maximum of this pack in your bag.'
              : 'This pack size is unavailable right now. Choose another size.'
          );
          return;
        }
        audioManager.play('open');
        setAddState('added');
        setMessage(`${product.name}, ${pack.label} × ${quantity} added to your bag.`);
        if (addButtonRef.current) flyToBag(getProductThumbUrl(product), addButtonRef.current);
        timers.current.push(window.setTimeout(() => setAddState('idle'), 2200));
      }, 320)
    );
  };

  const openHotspot = (index: number) => {
    const next = hotspot === index ? -1 : index;
    setHotspot(next);
    onView(next >= 0 ? 'BACK' : 'FRONT');
    onHighlightBenefit(next);
  };

  return (
    <article className="pdp" data-accent={product.accentToken} aria-labelledby="pdp-title">
      <section className="pdp-hero">
        {isWebglAvailable ? (
          <DragStage onRotate={onRotate} onFling={onFling} label={`${product.name} can`}>
            <div className={`pdp-hotspots ${chosenCount > 1 && hotspot < 0 ? 'is-pack' : ''}`} role="group" aria-label="What’s on the label">
              {BENEFITS.map((benefit, index) => (
                <button
                  key={benefit.id}
                  type="button"
                  className={`hotspot ${hotspot === index ? 'is-active' : ''}`}
                  style={{ '--i': index } as React.CSSProperties}
                  aria-expanded={hotspot === index}
                  aria-controls="hotspot-panel"
                  onClick={() => openHotspot(index)}
                >
                  <span className="hotspot__dot" aria-hidden="true"><BenefitIcon type={benefit.iconType} size={16} /></span>
                  <span className="hotspot__label">{benefit.title}</span>
                </button>
              ))}
            </div>
            <div id="hotspot-panel" className="hotspot-panel" role="status">
              {hotspot >= 0 && (
                <>
                  <p className="hotspot-panel__title">{BENEFITS[hotspot].title}</p>
                  <p className="hotspot-panel__text">{publicText(BENEFITS[hotspot].description)}</p>
                </>
              )}
            </div>
            <p className="pdp-stage__hint" id="drag-hint">
              <svg viewBox="0 0 24 12" aria-hidden="true"><path d="M3 6h18M7 2 3 6l4 4M17 2l4 4-4 4" /></svg>
              <span className="pdp-stage__hint-pointer">Drag to turn</span>
              <span className="pdp-stage__hint-touch">Swipe to turn</span>
            </p>
          </DragStage>
        ) : (
          <div className="pdp-stage pdp-stage--static">
            <img src={getProductThumbUrl(product)} alt={`${product.name} can`} />
          </div>
        )}

        <div className="pdp-panel">
          <a className="back-link" href="/shop" onClick={(event) => { event.preventDefault(); onNavigate('/shop'); }}>
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M8 2 4 6l4 4" /></svg>
            All flavors
          </a>

          <RevealText key={product.slug} id="pdp-title" as="h1" className="pdp-panel__title display" lines={[product.line1, product.line2].filter(Boolean)} label={product.name} joiner={product.name.includes(' ') ? ' ' : ''} />
          {product.edition && <p className="pdp-price__note pdp-panel__edition">{product.edition}</p>}
          <LimitedCountdown slug={product.slug} />
          <p className="pdp-panel__tagline">{product.tagline}</p>

          <ul className="trust-badges" aria-label="Certifications">
            <li className="trust-badge">
              <span className="trust-badge__icon" aria-hidden="true">حلال</span>
              <span>Halal certified</span>
            </li>
            <li className="trust-badge">
              <span className="trust-badge__icon" aria-hidden="true"><BenefitIcon type="zamzam" size={16} /></span>
              <span>Added Zamzam water</span>
            </li>
          </ul>

          <div className="pdp-price">
            <span className="pdp-price__total" aria-live="polite">{formatPrice(lineTotal)}</span>
            <span className="pdp-price__unit">{formatPrice(pack.unitPrice)} per can</span>
            {PLACEHOLDER_PRICING && <span className="pdp-price__note">Placeholder price</span>}
          </div>

          <fieldset className="pack-picker">
            <legend id={packGroupId} className="field-legend">Pack size</legend>
            <div className="pack-picker__options">
              {product.packOptions.map((option) => (
                <label key={option.id} className={`pack-option ${option.id === pack.id ? 'is-selected' : ''} ${option.inStock ? '' : 'is-disabled'}`}>
                  <input
                    type="radio"
                    name={`pack-${product.slug}`}
                    value={option.id}
                    checked={option.id === pack.id}
                    disabled={!option.inStock}
                    onChange={() => {
                      packPickedRef.current = true;
                      setPackId(option.id);
                      if (addState === 'error') setAddState('idle');
                    }}
                  />
                  <span className="pack-option__label">{option.label}</span>
                  <span className="pack-option__price">{formatPrice(option.price)}</span>
                  {option.badge && <span className="pack-option__badge">{option.badge}</span>}
                  {!option.inStock && <span className="pack-option__badge">Sold out</span>}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="pdp-buy">
            <div>
              <span className="field-legend" aria-hidden="true">Quantity</span>
              <QuantityStepper value={quantity} onChange={setQuantity} label={`${product.name}, ${pack.label}`} />
            </div>
            <button
              ref={addButtonRef}
              type="button"
              className={`button-primary button-primary--block pdp-buy__add ${addState === 'added' ? 'is-success' : ''} ${addState === 'adding' ? 'is-loading' : ''}`}
              onClick={handleAdd}
              aria-busy={addState === 'adding'}
              aria-describedby="pdp-status"
            >
              <ButtonLabel>{ADD_LABEL[addState]}</ButtonLabel>
            </button>
          </div>

          <p id="pdp-status" className={`pdp-status ${addState === 'error' ? 'is-error' : ''}`} role="status">
            {message}
            {!persistent && ' Your bag will be kept for this visit only (browser storage is blocked).'}
          </p>

          <button type="button" className="info-toggle" onClick={() => setInfoOpen(true)} aria-haspopup="dialog">
            <span>Nutrition and ingredients</span>
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4" /></svg>
          </button>

          <div className="pdp-share">
            <button
              type="button"
              className="button-outline"
              aria-busy={shareState === 'working'}
              disabled={shareState === 'working'}
              onClick={async () => {
                setShareState('working');
                setShareState(await sharePoster(product.slug, product.name));
              }}
            >
              Share poster
            </button>
            <span className="pdp-share__status" role="status">
              {shareState === 'downloaded' && 'Poster saved to your downloads.'}
              {shareState === 'shared' && 'Thanks for sharing.'}
              {shareState === 'failed' && 'The poster couldn’t be created. Try again.'}
            </span>
          </div>

          <ul className="pdp-facts">
            {!/to be confirmed/i.test(product.leadTime) && <li>{product.leadTime}</li>}
            <li>{product.origin}</li>
            <li>{product.volume}</li>
            <li>Cash on delivery</li>
          </ul>
        </div>
      </section>

      <section ref={factsRef} className="pdp-section" aria-labelledby="facts-title">
        <h2 id="facts-title" className="pdp-section__title display">{product.name} facts</h2>
        <dl className="facts">
          {/* only confirmed facts are public (unconfirmed rows read "To be confirmed") */}
          {productFacts(product).filter((fact) => fact.confirmed).map((fact) => (
            <div key={fact.label} className="facts__row">
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Delivery, returns and help appears once any of it is published (payment is listed under the buy box) */}
      {(!POLICIES.delivery.includes('TODO') || !POLICIES.returns.includes('TODO') || !isTodo(BRAND.contactEmail)) && (
        <section className="pdp-section" aria-labelledby="trust-title">
          <h2 id="trust-title" className="pdp-section__title display">Delivery, returns and help</h2>
          {/* only settled policies are shown: unpublished ones stay out of view instead of reading "coming soon" */}
          <div className="trust-grid">
            {!POLICIES.delivery.includes('TODO') && (
              <div className="trust-card">
                <h3>Delivery</h3>
                <p>{POLICIES.delivery}</p>
              </div>
            )}
            {!POLICIES.returns.includes('TODO') && (
              <div className="trust-card">
                <h3>Returns</h3>
                <p>{POLICIES.returns}</p>
              </div>
            )}
            <div className="trust-card">
              <h3>Payment</h3>
              <p>Cash on delivery.</p>
            </div>
            {!isTodo(BRAND.contactEmail) && (
              <div className="trust-card">
                <h3>Contact</h3>
                <p>{BRAND.contactEmail}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* reviews appear with the first review (an empty "no reviews yet" block undersold the product) */}
      {REVIEWS.length > 0 && (
        <section className="pdp-section" aria-labelledby="reviews-title">
          <h2 id="reviews-title" className="pdp-section__title display">Reviews</h2>
          <ul className="reviews">
            {REVIEWS.map((review) => (
              <li key={review.author} className="review">
                <p className="review__rating" aria-label={`${review.rating} out of 5`}>{'★'.repeat(review.rating)}</p>
                <p>{review.text}</p>
                <p className="review__author">{review.author}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="pdp-section pdp-section--related" aria-labelledby="related-title">
        <h2 id="related-title" className="pdp-section__title display">Try another flavor</h2>
        <ul className="related">
          {related.map((item) => (
            <li key={item.slug} data-accent={item.accentToken}>
              <a
                className="related__card"
                href={`/products/${item.slug}`}
                onPointerMove={tiltCard}
                onPointerLeave={resetCard}
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate(`/products/${item.slug}`);
                }}
              >
                <img src={getProductThumbUrl(item)} alt="" loading="lazy" width="120" height="213" />
                <span className="related__name">{item.name}</span>
                <span className="related__price">From {formatPrice(item.packOptions[0].price)}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <div className={`pdp-buybar ${showBuyBar ? 'is-visible' : ''}`} aria-hidden={!showBuyBar}>
        <div className="pdp-buybar__info">
          <span className="pdp-buybar__name">{product.name}</span>
          <span className={`pdp-buybar__meta ${addState === 'error' ? 'is-error' : ''}`}>
            {addState === 'error' && message ? message : `${pack.label} × ${quantity} · ${formatPrice(lineTotal)}`}
          </span>
        </div>
        <button
          type="button"
          className={`button-primary ${addState === 'added' ? 'is-success' : ''} ${addState === 'adding' ? 'is-loading' : ''}`}
          onClick={handleAdd}
          tabIndex={showBuyBar ? 0 : -1}
          aria-busy={addState === 'adding'}
        >
          <ButtonLabel>{ADD_LABEL[addState]}</ButtonLabel>
        </button>
      </div>

      <InfoDrawer isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={`${product.name}: nutrition and ingredients`}>
        <h3 className="field-legend">Ingredients</h3>
        <p className="pdp-inside__text">{confirmed(product.ingredients, 'The full ingredient list will be added here soon.')}</p>
        <table className="nutrition">
          <caption className="field-legend">Nutrition, {product.nutrition.serving.toLowerCase()}</caption>
          <tbody>
            {product.nutrition.rows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value === 'TODO' ? 'To be confirmed' : value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="pdp-features">
          {product.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </InfoDrawer>
    </article>
  );
};

/**
 * Related cards lean toward the pointer (a few degrees) with a sheen that follows it: CSS variables only, set on the
 * card itself, so nothing re-renders. Mouse and pen only; touch and reduced motion keep the flat card (see shop.css).
 */
function tiltCard(event: React.PointerEvent<HTMLAnchorElement>) {
  if (event.pointerType === 'touch') return;
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  card.style.setProperty('--tilt-x', `${((0.5 - y) * 8).toFixed(2)}deg`);
  card.style.setProperty('--tilt-y', `${((x - 0.5) * 10).toFixed(2)}deg`);
  card.style.setProperty('--sheen-x', `${(x * 100).toFixed(1)}%`);
  card.style.setProperty('--sheen-y', `${(y * 100).toFixed(1)}%`);
}

function resetCard(event: React.PointerEvent<HTMLAnchorElement>) {
  const card = event.currentTarget;
  card.style.removeProperty('--tilt-x');
  card.style.removeProperty('--tilt-y');
}

/**
 * Left half of the product hero: the can is the control. Drag (mouse) or swipe (touch) turns it a full 360°, and a
 * quick release keeps it spinning until it slows to a stop. Horizontal swipes turn the can while vertical ones still
 * scroll the page (touch-action: pan-y). The hint fades after the first turn.
 */
const DragStage: React.FC<{
  onRotate: (dx: number, dy: number) => void;
  onFling: (velocityX: number) => void;
  label: string;
  children: React.ReactNode;
}> = ({ onRotate, onFling, label, children }) => {
  const last = useRef<{ id: number; x: number; y: number; t: number; vx: number } | null>(null);
  const [used, setUsed] = useState(false);
  const end = () => {
    const drag = last.current;
    last.current = null;
    // only a release that was still moving flings (a drag that stopped before letting go just stays put)
    if (drag && performance.now() - drag.t < 80) onFling(drag.vx);
  };
  return (
    <div
      className={`pdp-stage ${used ? 'is-used' : ''}`}
      role="group"
      aria-label={label}
      aria-describedby="drag-hint"
      tabIndex={0}
      onKeyDown={(event) => {
        const step = { ArrowLeft: [-40, 0], ArrowRight: [40, 0], ArrowUp: [0, -30], ArrowDown: [0, 30] }[event.key];
        if (!step) return;
        event.preventDefault();
        setUsed(true);
        onRotate(step[0], step[1]);
      }}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        last.current = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now(), vx: 0 };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = last.current;
        if (!drag || drag.id !== event.pointerId) return;
        const now = performance.now();
        const dx = event.clientX - drag.x;
        const dt = Math.max(1, now - drag.t);
        // smoothed release speed, so one jittery last sample never decides the fling
        drag.vx = drag.vx * 0.6 + (dx / dt) * 0.4;
        onRotate(dx, event.clientY - drag.y);
        if (!used && Math.abs(dx) > 2) setUsed(true);
        last.current = { ...drag, x: event.clientX, y: event.clientY, t: now };
      }}
      onPointerUp={end}
      onPointerCancel={() => {
        last.current = null;
      }}
    >
      {children}
    </div>
  );
};
