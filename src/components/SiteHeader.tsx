import React, { useEffect, useState } from 'react';
import { ButtonLabel } from './ButtonLabel';
import { audioManager } from '../audio/audioManager';
import { useCart } from '../store/cart';
import { BrandMark } from './BrandMark';
import { BRAND, isTodo } from '../data/brand';
import { useLocale } from '../locale';

interface SiteHeaderProps {
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onNavigateHome: () => void;
  onOpenBag: () => void;
  /** Opens the shop (the header's one always-visible way to buy). */
  onShop?: () => void;
}

/**
 * Top chrome: sound toggle (off by default), centred logo, MENU and CONTACT,
 * plus the hairline scroll progress with a glowing head. Progress width is read
 * from the --scroll-progress custom property, so scrolling never re-renders this.
 */
export const SiteHeader: React.FC<SiteHeaderProps> = ({ isMenuOpen, onToggleMenu, onNavigateHome, onOpenBag, onShop }) => {
  const [isMuted, setIsMuted] = useState<boolean>(audioManager.isMuted());
  const { totalCount, isOpen: isBagOpen } = useCart();
  const { t } = useLocale();
  const [bump, setBump] = useState(false);
  const previousCount = React.useRef(totalCount);

  // Brief pulse on the bag when its count goes up.
  useEffect(() => {
    if (totalCount > previousCount.current) {
      setBump(true);
      const timer = window.setTimeout(() => setBump(false), 600);
      previousCount.current = totalCount;
      return () => window.clearTimeout(timer);
    }
    previousCount.current = totalCount;
  }, [totalCount]);

  useEffect(() => audioManager.subscribe((muted) => setIsMuted(muted)), []);

  return (
    <header className="site-header">
      <div className="scroll-progress" aria-hidden="true">
        <span className="scroll-progress__track" />
        <span className="scroll-progress__fill" />
      </div>

      <div className="site-header__bar">
        <button
          type="button"
          className={`sound-toggle ${isMuted ? '' : 'is-on'}`}
          onClick={() => audioManager.toggleMute()}
          aria-pressed={!isMuted}
          aria-label={isMuted ? 'Sound off' : 'Sound on'}
        >
          <span className="sound-toggle__label" aria-hidden="true">{isMuted ? 'OFF' : 'ON'}</span>
          <span className="sound-toggle__bars" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        </button>

        <button type="button" className="site-logo" onClick={onNavigateHome} aria-label={`${BRAND.name}, back to top`}>
          <BrandMark />
        </button>

        <div className="site-header__actions">
          {onShop && (
            <a
              className="header-shop"
              href="/shop"
              onClick={(event) => {
                event.preventDefault();
                audioManager.play('click');
                onShop();
              }}
            >
              Shop
            </a>
          )}
          <button
            type="button"
            className="menu-toggle"
            onClick={() => {
              audioManager.play('click');
              onToggleMenu();
            }}
            aria-expanded={isMenuOpen}
            aria-controls="site-menu"
          >
            <svg className="menu-toggle__icon" viewBox="0 0 10 10" aria-hidden="true">
              <circle cx="1.5" cy="1.5" r="1.25" />
              <circle cx="8.5" cy="1.5" r="1.25" />
              <circle cx="1.5" cy="8.5" r="1.25" />
              <circle cx="8.5" cy="8.5" r="1.25" />
            </svg>
            <span>{isMenuOpen ? t('close') : t('menu')}</span>
          </button>

          <button
            type="button"
            className={`bag-toggle ${bump ? 'is-bumped' : ''}`}
            onClick={onOpenBag}
            aria-haspopup="dialog"
            aria-expanded={isBagOpen}
            aria-label={totalCount > 0 ? `Bag, ${totalCount} ${totalCount === 1 ? 'item' : 'items'}` : 'Bag, empty'}
          >
            <svg className="bag-toggle__icon" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 5.5h10l-.8 8.5H3.8L3 5.5Z" />
              <path d="M5.5 5.5V4.5a2.5 2.5 0 0 1 5 0v1" />
            </svg>
            <span className="bag-toggle__count" aria-hidden="true">{totalCount}</span>
          </button>
          <span className="sr-only" role="status">{totalCount > 0 ? `${totalCount} ${totalCount === 1 ? 'item' : 'items'} in your bag` : ''}</span>

          {/* No dead-end action: the header Contact button appears once a real contact email exists
              (grizzly.json → brand.contactEmail). Until then the menu's Contact entry points to the footer. */}
          {!isTodo(BRAND.contactEmail) && (
            <a href={`mailto:${BRAND.contactEmail}`} className="button-primary button-primary--small">
              <ButtonLabel>{t('contact')}</ButtonLabel>
            </a>
          )}
        </div>
      </div>
    </header>
  );
};
