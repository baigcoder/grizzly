import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FLAVORS } from '../data/flavors';
import { PACK_OPTIONS, formatPrice, PLACEHOLDER_PRICING } from '../data/products';
import { useCart } from '../store/cart';
import { CanTop } from './CanTop';
import { ButtonLabel } from './ButtonLabel';
import { flyBetween, flyToBag } from './flyToBag';
import { audioManager } from '../audio/audioManager';

interface PackBuilderProps {
  onNavigate: (url: string) => void;
  /** The 3D scene is up: the pack is built in 3D in the stage box, and the slot grid becomes its compact control. */
  show3d?: boolean;
  /** Every change of size or slot, for the 3D pack. */
  onMixChange?: (size: number, slots: (string | null)[]) => void;
  /** The stage box the 3D pack stands in (null when it unmounts). */
  onStage?: (element: HTMLElement | null) => void;
}

const SIZES = PACK_OPTIONS.filter((pack) => pack.count >= 6);

/**
 * Mix your own pack: pick 6, 12 or 24, then fill the slots (drag a flavor onto a
 * slot, or click/press Enter on a flavor to fill the next empty slot). Clicking a
 * filled slot empties it. One Add to bag for the whole pack.
 *
 * The slots are a carton seen in perspective: a picked flavor arcs from the list into its well and drops in with a
 * small bounce, and the carton lights up once every slot is full. With the 3D scene up, the real pack is built above
 * the slots (webgl/packDisplay.ts, mix mode): the tray or clip waits, each picked flavor drops its can into place, and
 * the pack closes when full; the slot grid stays as its compact, accessible control.
 */
export const PackBuilder: React.FC<PackBuilderProps> = ({ onNavigate, show3d = false, onMixChange, onStage }) => {
  const [packId, setPackId] = useState(SIZES[0].id);
  const pack = SIZES.find((option) => option.id === packId) ?? SIZES[0];
  const [slots, setSlots] = useState<(string | null)[]>(() => Array(SIZES[0].count).fill(null));
  const [state, setState] = useState<'idle' | 'added' | 'error'>('idle');
  const { addMix } = useCart();
  const slotRefs = useRef<(HTMLLIElement | null)[]>([]);
  /** The slot that just received a can (replays its drop). */
  const [landed, setLanded] = useState<{ index: number; key: number } | null>(null);

  useEffect(() => {
    onMixChange?.(pack.count, slots);
  }, [pack.count, slots, onMixChange]);

  const filled = slots.filter(Boolean).length;
  const isFull = filled === pack.count;

  const resize = (id: string) => {
    const next = SIZES.find((option) => option.id === id);
    if (!next) return;
    setPackId(next.id);
    setSlots((previous) => Array.from({ length: next.count }, (_, i) => previous[i] ?? null));
    setState('idle');
  };

  const place = (slug: string, at?: number, from?: HTMLElement) => {
    const index = at ?? slots.findIndex((slot) => slot === null);
    if (index < 0) return;
    const well = slotRefs.current[index];
    // (with the 3D pack the can drops into the real pack instead of a flat image flying across the page)
    if (from && well && !show3d) flyBetween(`/products/thumbs/${slug}.webp`, from, well, { duration: 560, endScale: 0.55, fade: true, lift: 90 });
    setSlots((previous) => {
      const next = [...previous];
      next[index] = slug;
      return next;
    });
    setLanded({ index, key: Date.now() });
    audioManager.play('click');
    setState('idle');
  };

  const clear = (index: number) => {
    setSlots((previous) => previous.map((slot, i) => (i === index ? null : slot)));
    setState('idle');
  };

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    slots.forEach((slot) => slot && map.set(slot, (map.get(slot) ?? 0) + 1));
    return map;
  }, [slots]);

  const add = (event: React.MouseEvent<HTMLButtonElement>) => {
    const mix = Array.from(counts, ([slug, count]) => ({ slug, count }));
    const result = addMix(mix, 1);
    if (!result.ok) {
      setState('error');
      return;
    }
    setState('added');
    audioManager.play('open');
    flyToBag(`/products/thumbs/${mix[0].slug}.webp`, event.currentTarget);
    setSlots(Array(pack.count).fill(null));
  };

  return (
    <section className={`builder ${show3d ? 'builder--3d' : ''}`} aria-labelledby="builder-title">
      <h1 id="builder-title" className="display builder__title">Mix your pack</h1>
      <p className="builder__lead">Choose a size, then fill every slot with the flavors you want.</p>

      <fieldset className="builder__sizes">
        <legend className="field-legend">Pack size</legend>
        <div className="builder__size-options">
          {SIZES.map((option) => (
            <label key={option.id} className={`pack-option ${option.id === pack.id ? 'is-selected' : ''}`}>
              <input type="radio" name="mix-size" value={option.id} checked={option.id === pack.id} onChange={() => resize(option.id)} />
              <span className="pack-option__label">{option.label}</span>
              <span className="pack-option__price">{formatPrice(option.price)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="builder__layout">
        <div className="builder__flavors">
          <p className="field-legend" id="palette-label">Flavors</p>
          <ul className="builder__palette" aria-labelledby="palette-label">
            {FLAVORS.map((flavor) => (
              <li key={flavor.id}>
                <button
                  type="button"
                  className="palette-item"
                  data-accent={flavor.accentToken}
                  draggable
                  disabled={isFull}
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', flavor.id)}
                  onClick={(event) => place(flavor.id, undefined, event.currentTarget)}
                  aria-label={`Add ${flavor.name}${counts.get(flavor.id) ? `, ${counts.get(flavor.id)} in pack` : ''}`}
                >
                  <CanTop slug={flavor.id} size="small" />
                  <span className="palette-item__name">{flavor.name}</span>
                  {counts.get(flavor.id) ? <span className="palette-item__count" aria-hidden="true">{counts.get(flavor.id)}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="builder__pack">
          {show3d && (
            <div className={`builder__stage ${isFull ? 'is-full' : ''}`} ref={onStage} aria-hidden="true">
              <span className="builder__stage-label">{isFull ? `${pack.count}-pack ready` : `${filled} / ${pack.count}`}</span>
            </div>
          )}
          <p className="field-legend" aria-live="polite">{filled} of {pack.count} filled</p>
          <div className={`carton ${isFull ? 'is-full' : ''}`}>
            <ol className={`builder__slots builder__slots--${pack.count}`} aria-label="Pack slots">
              {slots.map((slot, index) => (
                <li
                  key={index}
                  ref={(element) => {
                    slotRefs.current[index] = element;
                  }}
                  className={`slot ${slot ? 'is-filled' : ''}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const slug = event.dataTransfer.getData('text/plain');
                    if (FLAVORS.some((flavor) => flavor.id === slug)) place(slug, index);
                  }}
                >
                  {slot ? (
                    <button
                      type="button"
                      key={landed?.index === index ? landed.key : 'still'}
                      className={`slot__button ${landed?.index === index ? 'is-landing' : ''}`}
                      onClick={() => clear(index)}
                      aria-label={`Slot ${index + 1}: ${FLAVORS.find((f) => f.id === slot)?.name}. Remove`}
                    >
                      <CanTop slug={slot} />
                    </button>
                  ) : (
                    <span className="slot__empty" role="img" aria-label={`Slot ${index + 1}: empty`} />
                  )}
                </li>
              ))}
            </ol>
            <span className="carton__band" aria-hidden="true">{pack.count}-pack ready</span>
          </div>
        </div>
      </div>

      <div className="builder__footer">
        <p className="builder__price">
          <span className="pdp-price__total">{formatPrice(pack.price)}</span>
          {PLACEHOLDER_PRICING && <span className="pdp-price__note">Placeholder price</span>}
        </p>
        <button type="button" className={`button-primary ${state === 'added' ? 'is-success' : ''}`} disabled={!isFull} onClick={add}>
          <ButtonLabel>{state === 'added' ? 'Added to bag' : isFull ? 'Add pack to bag' : `Fill ${pack.count - filled} more`}</ButtonLabel>
        </button>
        {state === 'error' && <p className="field__error" role="alert">This mix couldn’t be added. Refresh and try again.</p>}
        {state === 'added' && (
          <a className="text-button" href="/cart" onClick={(event) => { event.preventDefault(); onNavigate('/cart'); }}>View bag</a>
        )}
      </div>
    </section>
  );
};
