import React, { useEffect, useState } from 'react';
import { LIMITED_EDITION, isTodo } from '../data/brand';

const UNITS: Array<[label: string, ms: number]> = [
  ['days', 86_400_000],
  ['hrs', 3_600_000],
  ['min', 60_000],
  ['sec', 1_000],
];

/**
 * Limited edition timer. Until the end date is confirmed (TODO in grizzly.json) it shows nothing, rather than a
 * placeholder or a count to an invented time.
 */
export const LimitedCountdown: React.FC<{ slug: string; compact?: boolean }> = ({ slug, compact = false }) => {
  const endsAt = isTodo(LIMITED_EDITION.endsAt) ? null : Date.parse(LIMITED_EDITION.endsAt);
  const valid = endsAt !== null && !Number.isNaN(endsAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!valid || slug !== LIMITED_EDITION.slug) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [valid, slug]);

  if (slug !== LIMITED_EDITION.slug) return null;

  // no public "to be announced": the timer appears once the end date is confirmed
  if (!valid) return null;

  let body: React.ReactNode;
  if (endsAt! <= now) {
    body = <span className="countdown__tba">This limited edition has ended</span>;
  } else {
    let left = endsAt! - now;
    body = (
      <span className="countdown__units" aria-hidden="true">
        {UNITS.map(([label, ms]) => {
          const value = Math.floor(left / ms);
          left -= value * ms;
          return (
            <span key={label} className="countdown__unit">
              <span className="countdown__value">{String(value).padStart(2, '0')}</span>
              <span className="countdown__label">{label}</span>
            </span>
          );
        })}
      </span>
    );
  }

  return (
    <p className={`countdown ${compact ? 'countdown--compact' : ''}`}>
      {body}
      {valid && endsAt! > now && (
        <span className="sr-only">Ends {new Date(endsAt!).toLocaleString('en-PK', { dateStyle: 'long', timeStyle: 'short' })}</span>
      )}
    </p>
  );
};
