import React, { useEffect, useId, useRef, useState } from 'react';
import { BRAND, NEWSLETTER_OFFER, isTodo } from '../data/brand';
import { ButtonLabel } from './ButtonLabel';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Newsletter sign-up. There is no mailing backend yet, so nothing is sent or stored: the form
 * validates the address and then says so plainly (never claims a subscription that didn't happen).
 */
export const NewsletterFooter: React.FC = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const inputId = useId();
  const messageId = useId();
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!EMAIL_PATTERN.test(email.trim())) {
      setStatus('error');
      setError('Enter an email address like name@example.com.');
      return;
    }
    setStatus('submitting');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setStatus('success');
      setEmail('');
    }, 800);
  };

  return (
    <section id="newsletter" className="home-section newsletter" aria-labelledby="newsletter-title">
      <div className="newsletter__card">
        <h2 id="newsletter-title" className="newsletter__title display">Join us</h2>
        <p className="newsletter__intro">
          Join the pack and be the first to hear about Grizzly Energy news and new flavors.
        </p>
        {/* the offer line appears once there is a real offer (no public "coming soon") */}
        {!isTodo(NEWSLETTER_OFFER) && (
          <p className="newsletter__offer">
            <span className="newsletter__offer-badge">Subscriber offer</span>
            {NEWSLETTER_OFFER}
          </p>
        )}

        <form className="newsletter__form" onSubmit={handleSubmit} noValidate>
          <div className={`field ${status === 'error' ? 'is-invalid' : ''}`}>
            <input
              id={inputId}
              className="field__input"
              type="email"
              autoComplete="email"
              placeholder=" "
              value={email}
              disabled={status === 'submitting'}
              aria-invalid={status === 'error'}
              aria-describedby={messageId}
              onChange={(event) => {
                setEmail(event.target.value);
                if (status === 'error' || status === 'success') setStatus('idle');
              }}
            />
            <label htmlFor={inputId} className="field__label">Your email address</label>
          </div>

          <button type="submit" className="button-primary button-primary--block" disabled={status === 'submitting'} aria-busy={status === 'submitting'}>
            <ButtonLabel>{status === 'submitting' ? 'Subscribing…' : 'Subscribe'}</ButtonLabel>
          </button>

          <p id={messageId} className={`newsletter__message ${status === 'error' ? 'is-error' : ''}`} role={status === 'error' ? 'alert' : 'status'}>
            {status === 'error' && error}
            {status === 'success' && 'Thanks! Sign-ups open soon. We haven’t saved your address, so check back here to join the pack.'}
          </p>

          <p className="newsletter__legal">
            By subscribing you accept our <a href="/privacy">privacy policy</a>.
          </p>
        </form>
      </div>
    </section>
  );
};

const FOOTER_LINKS: Array<[string, string]> = [
  ['/shop', 'Shop'],
  ['/limited', 'Limited editions'],
  ['/mix', 'Mix your pack'],
  ['/halal-zamzam', 'Halal and Zamzam'],
  ['/stores', 'Find a store'],
  ['/about', 'About us'],
];

/** Page footer (contentinfo): the brand and its claim, every page, the confirmed trust points, then legal / social. */
export const SiteFooter: React.FC<{ onNavigate?: (url: string) => void }> = ({ onNavigate }) => (
  <footer id="site-footer" className="site-footer">
    <div className="site-footer__brand">
      <p className="site-footer__wordmark display">{BRAND.wordmark.join(' ')}</p>
      <p className="site-footer__claim">{BRAND.claim.join(' ')}</p>
      <ul className="site-footer__trust">
        <li>Halal certified</li>
        <li>{BRAND.origin}</li>
        <li>Cash on delivery</li>
      </ul>
    </div>
    <nav className="site-footer__pages" aria-label="Pages">
      {FOOTER_LINKS.map(([href, label]) => (
        <a
          key={href}
          className="site-footer__page"
          href={href}
          onClick={(event) => {
            if (!onNavigate) return;
            event.preventDefault();
            onNavigate(href);
          }}
        >
          {label}
        </a>
      ))}
    </nav>
    <p className="site-footer__copyright">© 2026 {BRAND.name}. {BRAND.company.name}, {BRAND.origin.replace('Made in ', '')}.</p>
    <nav className="site-footer__bar" aria-label="Footer">
      {!isTodo(BRAND.social.tiktok) && <a className="button-outline" href={BRAND.social.tiktok} target="_blank" rel="noopener noreferrer">TikTok</a>}
      <a className="site-footer__link" href={`https://${BRAND.company.website}`} target="_blank" rel="noopener noreferrer">{BRAND.company.website}</a>
      {/* Legal notice and terms appear once their text is supplied (see grizzly.json TODO list). */}
      <a className="site-footer__link" href="/privacy">Privacy policy</a>
      {!isTodo(BRAND.social.instagram) && <a className="button-outline" href={BRAND.social.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}
    </nav>
  </footer>
);
