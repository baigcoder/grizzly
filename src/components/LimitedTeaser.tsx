import React, { useEffect, useState } from 'react';
import { versioned } from '../data/assetVersion';

const SEEN_KEY = 'grizzly_limited_teaser_v2';
const DELAY_MS = 5000;
const SLUGS = ['blackout-berry', 'falsa-frost', 'cold-coffee'];

/**
 * A once-per-visit teaser for the limited editions on the home page: a small glass card in the corner (a slim bar
 * on phones) that opens /limited. It comes in once the hero has settled, sitting above the storage notice when that
 * is up (--notice-h); closing or following it hides it for the rest of this visit (sessionStorage), so the next visit
 * shows it again. (Once per browser, and waiting for the notice to go, it was easy to never see at all.)
 */
export const LimitedTeaser: React.FC<{ isReady: boolean; isHome: boolean; onNavigate: (url: string) => void }> = ({ isReady, isHome, onNavigate }) => {
  const [visible, setVisible] = useState(false);

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

  if (!visible) return null;
  return (
    <aside className="limited-teaser" aria-label="Limited editions">
      <span className="limited-teaser__cans" aria-hidden="true">
        {SLUGS.map((slug, index) => (
          <img key={slug} src={versioned(`/products/thumbs/${slug}.webp`)} alt="" width={187} height={491} style={{ '--i': index - 1 } as React.CSSProperties} />
        ))}
      </span>
      <span className="limited-teaser__copy">
        <span className="limited-teaser__eyebrow">New</span>
        <span className="limited-teaser__title display">Limited editions</span>
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
      <button type="button" className="limited-teaser__close" onClick={close} aria-label="Close">
        ×
      </button>
    </aside>
  );
};
