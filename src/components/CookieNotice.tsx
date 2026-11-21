import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NOTICE_LAYOUT_EVENT } from './noticeLayout';

const NOTICE_KEY = 'grizzly_notice_v1';

/**
 * Storage notice. The site only keeps essential data in this browser (bag, saved
 * items, language) and runs no tracking, so there is nothing to opt in to: this
 * says so plainly and remembers that it was read.
 *
 * It never sits on top of the page's controls: while it is shown it publishes its height as
 * --notice-h (and html[data-notice]), and bottom-anchored UI adds that to its own offset.
 * Reading on counts as seeing it: scrolling past the first screen also marks it as read.
 */
export const CookieNotice: React.FC<{ isReady: boolean }> = ({ isReady }) => {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isReady) return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(NOTICE_KEY) === '1';
    } catch {
      seen = false;
    }
    if (!seen) setVisible(true);
  }, [isReady]);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(NOTICE_KEY, '1');
    } catch {
      // still hide it for this visit
    }
    setVisible(false);
  }, []);

  // Publish the space the bar takes (its height plus the gap below it) so other fixed UI makes room.
  useEffect(() => {
    if (!visible) return;
    const root = document.documentElement;
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      root.style.setProperty('--notice-h', `${Math.ceil(window.innerHeight - rect.top)}px`);
      window.dispatchEvent(new Event(NOTICE_LAYOUT_EVENT));
    };
    measure();
    root.dataset.notice = 'true';
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--notice-h');
      delete root.dataset.notice;
      window.dispatchEvent(new Event(NOTICE_LAYOUT_EVENT));
    };
  }, [visible]);

  // Scrolling past the first screen counts as having seen it.
  useEffect(() => {
    if (!visible) return;
    const onScroll = () => {
      if (window.scrollY > window.innerHeight * 0.75) dismiss();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <aside ref={ref} className="cookie-notice" aria-label="Storage notice">
      <p className="cookie-notice__text">
        We store only your bag, saved items and language here. No tracking, no ad cookies.{' '}
        <a href="/privacy">Privacy policy</a>
      </p>
      <button type="button" className="button-outline" onClick={dismiss}>
        Got it
      </button>
    </aside>
  );
};
