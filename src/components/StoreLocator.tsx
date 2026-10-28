import React, { useId, useMemo, useState } from 'react';
import { STORES, COMMERCE, type Store } from '../data/brand';
import { PRODUCTS, getProductThumbUrl } from '../data/products';
import { ButtonLabel } from './ButtonLabel';

/** The three cans standing in the radar: the first flavors of the range, centre can first. */
const HERO_CANS = [PRODUCTS[1], PRODUCTS[0], PRODUCTS[2]].filter(Boolean);

const provinceOf = (store: Store) => COMMERCE.provinces.find((name) => store.address.includes(name)) ?? '';

/**
 * Where to buy. The store list lives in grizzly.json (stores.items). While it is empty the page says so plainly and
 * offers the two ways to get Grizzly today (online with cash on delivery, or a mixed pack) instead of showing
 * invented locations or filters with nothing behind them. With stores: a search, province chips (only provinces that
 * have a store, with their counts) and one card per store with directions.
 */
export const StoreLocator: React.FC<{ onNavigate: (url: string) => void; stores?: Store[] }> = ({ onNavigate, stores = STORES }) => {
  const [query, setQuery] = useState('');
  const [province, setProvince] = useState('');
  const searchId = useId();

  const provinces = useMemo(() => {
    const counts = new Map<string, number>();
    stores.forEach((store) => {
      const name = provinceOf(store);
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return COMMERCE.provinces.filter((name) => counts.has(name)).map((name) => ({ name, count: counts.get(name) ?? 0 }));
  }, [stores]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stores.filter(
      (store) =>
        (!q || `${store.name} ${store.city} ${store.address}`.toLowerCase().includes(q)) &&
        (!province || provinceOf(store) === province)
    );
  }, [stores, query, province]);

  const empty = stores.length === 0;
  const cities = new Set(stores.map((store) => store.city)).size;
  const go = (url: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    onNavigate(url);
  };

  return (
    <article className="stores" aria-labelledby="stores-title">
      <header className="stores__hero">
        <div className="stores__intro">
          <p className="stores__eyebrow">Store locator</p>
          <h1 id="stores-title" className="display stores__title">Find Grizzly</h1>
          <p className="stores__lead">Shops and partners stocking Grizzly Energy across Pakistan.</p>
          <p className={`stores__status ${empty ? 'is-pending' : ''}`}>
            <span className="stores__status-dot" aria-hidden="true" />
            {empty ? 'Retail partners launching soon' : `${stores.length} ${stores.length === 1 ? 'store' : 'stores'} in ${cities} ${cities === 1 ? 'city' : 'cities'}`}
          </p>
        </div>
        <div className="stores__radar" aria-hidden="true">
          <span className="stores__sweep" />
          <span className="stores__cans">
            {HERO_CANS.map((product) => (
              <img key={product.slug} src={getProductThumbUrl(product)} alt="" width="187" height="491" />
            ))}
          </span>
        </div>
      </header>

      {empty ? (
        <section className="stores__soon" aria-labelledby="stores-now-title">
          <h2 id="stores-now-title" className="stores__section-title">Get it now</h2>
          <p className="stores__soon-text">We’re lining up our first retail partners. Until they’re on the shelf, Grizzly comes to you.</p>
          <ul className="stores__ways">
            <li className="stores-way">
              <span className="stores-way__index" aria-hidden="true">01</span>
              <h3 className="stores-way__title">Order online</h3>
              <p className="stores-way__text">Pick a flavor and a pack size, and pay cash on delivery at your door.</p>
              <a className="button-primary button-primary--small" href="/shop" onClick={go('/shop')}>
                <ButtonLabel>Shop flavors</ButtonLabel>
              </a>
            </li>
            <li className="stores-way">
              <span className="stores-way__index" aria-hidden="true">02</span>
              <h3 className="stores-way__title">Mix your pack</h3>
              <p className="stores-way__text">Can’t pick one? Fill a pack of 6, 12 or 24 with any flavors you like.</p>
              <a className="stores-way__link" href="/mix" onClick={go('/mix')}>
                Build a pack
                <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4" /></svg>
              </a>
            </li>
          </ul>
        </section>
      ) : (
        <section className="stores__finder" aria-labelledby="stores-list-title">
          <h2 id="stores-list-title" className="sr-only">Stores</h2>
          <form className="stores__filters" role="search" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor={searchId} className="sr-only">Search by city or shop name</label>
            <span className="stores__search">
              <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4.5 4.5" /></svg>
              <input
                id={searchId}
                className="stores__search-input"
                type="search"
                placeholder="City or shop name"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </span>
            {provinces.length > 1 && (
              <div className="stores__chips" role="group" aria-label="Province">
                {[{ name: '', count: stores.length }, ...provinces].map(({ name, count }) => (
                  <button
                    key={name || 'all'}
                    type="button"
                    className="stores__chip"
                    aria-pressed={province === name}
                    onClick={() => setProvince(name)}
                  >
                    {name || 'All'} <span className="stores__chip-count">{count}</span>
                  </button>
                ))}
              </div>
            )}
          </form>

          <div role="status" className="stores__count">
            {results.length === 0
              ? `No stores match${query ? ` “${query}”` : ''}. Try another city or clear the filters.`
              : `${results.length} ${results.length === 1 ? 'store' : 'stores'}${province ? ` in ${province}` : ''}`}
          </div>
          {results.length > 0 && (
            <ul className="stores__list">
              {results.map((store) => (
                <li key={`${store.name}-${store.address}`} className="store-card">
                  <span className="store-card__city">{store.city}</span>
                  <h3 className="store-card__name">{store.name}</h3>
                  <p className="store-card__address">{store.address}</p>
                  {store.mapUrl && (
                    <a className="store-card__directions" href={store.mapUrl} target="_blank" rel="noopener noreferrer">
                      Directions
                      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4" /></svg>
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </article>
  );
};
