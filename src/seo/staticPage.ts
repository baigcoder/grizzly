/**
 * Static HTML for every route, written into the page at build time (scripts/prerender.mjs).
 * It is what crawlers, assistants, no-JS visitors and the first paint see: real headings, copy,
 * product facts, FAQ and internal links, with a still can image and no dependence on WebGL.
 * React replaces it as soon as the app mounts. Only confirmed facts appear here.
 */
import { ABOUT_PAGE, BADGES, BRAND, GRIZZLY_BENEFITS, NUTRITION, isTodo } from '../data/brand';
import { FAQ_ITEMS } from '../data/faq';
import { PRIVACY } from '../data/privacy';
import { PRODUCTS, getProductBySlug, getProductThumbUrl } from '../data/products';
import { pageMeta, productFacts, type SeoRoute } from './meta';

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAV: Array<[string, string]> = [
  ['/shop', 'Shop'],
  ['/mix', 'Mix your pack'],
  ['/limited', 'Limited editions'],
  ['/halal-zamzam', 'Halal and Zamzam'],
  ['/stores', 'Find a store'],
  ['/about', 'About us'],
];

/**
 * Minimal inline styling. With scripts on, the static page is only for crawlers: the first paint is the plain black
 * screen the loader opens on (its content would otherwise flash up for a moment before the app replaces it). Without
 * scripts NOSCRIPT_CSS shows it as a calm dark page, not unstyled HTML.
 */
export const STATIC_CSS = `
html,body{background:black}
.pre{box-sizing:border-box;min-height:100vh;background:black;color:white;font-family:Geist,Arial,sans-serif;font-weight:300;line-height:1.5;padding:2rem 1.25rem 4rem}
.pre__in{visibility:hidden}
.pre *{box-sizing:border-box}.pre a{color:inherit}.pre__in{max-width:60rem;margin:0 auto}
.pre__bar{display:flex;flex-wrap:wrap;gap:1rem 2rem;align-items:baseline;justify-content:space-between;margin-bottom:3rem}
.pre__brand{font:italic 900 1.5rem/1 'Libre Franklin',Arial Black,sans-serif;text-decoration:none;text-transform:uppercase}
.pre nav{display:flex;flex-wrap:wrap;gap:.5rem 1.5rem;font-size:.9rem}
.pre h1{font:italic 900 clamp(2.2rem,6vw,4.2rem)/1 'Libre Franklin',Arial Black,sans-serif;text-transform:uppercase;margin:.5rem 0 1rem}
.pre h2{font:italic 900 1.5rem/1.1 'Libre Franklin',Arial Black,sans-serif;text-transform:uppercase;margin:2.5rem 0 1rem}
.pre h3{font-size:1.05rem;font-weight:500;margin:1.25rem 0 .25rem}
.pre p{margin:.25rem 0 .75rem;color:rgba(255,255,255,.78);max-width:42rem}.pre__eyebrow{letter-spacing:.3em;text-transform:uppercase;font-size:.75rem;color:rgba(255,255,255,.6)}
.pre__can{float:right;height:min(46vh,24rem);width:auto;margin:0 0 1rem 1rem}
.pre ul{padding:0;list-style:none;display:grid;gap:.75rem;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))}
.pre li a{display:block;border:1px solid rgba(255,255,255,.25);border-radius:.5rem;padding:1rem;text-decoration:none}
.pre dl{display:grid;grid-template-columns:max-content 1fr;gap:.35rem 1.5rem;margin:1rem 0}.pre dt{color:rgba(255,255,255,.6)}.pre dd{margin:0}
.pre table{border-collapse:collapse;width:100%;max-width:32rem}.pre td{border-bottom:1px solid rgba(255,255,255,.18);padding:.35rem 0}
`;

/** Without scripts the static page is the page: shown, over the night stage. */
export const NOSCRIPT_CSS = `.pre{background:black url(/brand/night-stage.jpg) center/cover fixed}.pre__in{visibility:visible}`;

function header(): string {
  return `<header class="pre__bar"><a class="pre__brand" href="/">${escapeHtml(BRAND.name)}</a><nav aria-label="Primary">${NAV.map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`).join('')}</nav></header>`;
}

function range(): string {
  return `<ul>${PRODUCTS.map((p) => `<li><a href="/products/${p.slug}"><strong>${escapeHtml(p.name)}</strong><br>${escapeHtml(p.tagline)}</a></li>`).join('')}</ul>`;
}

function faq(): string {
  return FAQ_ITEMS.map((item) => `<h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p>`).join('');
}

function footer(): string {
  const bits = [`${escapeHtml(BRAND.company.name)}`, escapeHtml(BRAND.origin)];
  if (!isTodo(BRAND.contactEmail)) bits.push(`<a href="mailto:${escapeHtml(BRAND.contactEmail)}">${escapeHtml(BRAND.contactEmail)}</a>`);
  bits.push('<a href="/privacy">Privacy</a>');
  return `<footer><p>${bits.join(' · ')}</p></footer>`;
}

function body(route: SeoRoute): string {
  switch (route.type) {
    case 'HOME':
      return `${header()}<main id="main">
<div class="pre__eyebrow">${escapeHtml(BRAND.tagline)}</div>
<h1>Grizzly Energy, natural energy drinks in six flavors</h1>
<img class="pre__can" src="${getProductThumbUrl(PRODUCTS[0])}" alt="Grizzly Energy Blue Raspberry can" width="187" height="491" fetchpriority="high">
<p>${escapeHtml(BRAND.summary)}</p>
<p>${escapeHtml(BADGES.join(' · '))} · ${escapeHtml(BRAND.origin)}</p>
<h2>The range</h2>${range()}
<h2>What is in every can</h2><ul>${GRIZZLY_BENEFITS.map((b) => `<li><strong>${escapeHtml(b.title)}</strong><br>${escapeHtml(b.description)}</li>`).join('')}</ul>
<h2>Frequently asked questions</h2>${faq()}
</main>${footer()}`;
    case 'SHOP':
      return `${header()}<main id="main"><h1>Shop Grizzly Energy</h1><p>${escapeHtml(BRAND.summary)}</p>${range()}<p><a href="/mix">Mix your own pack</a></p></main>${footer()}`;
    case 'PRODUCT': {
      const product = getProductBySlug(route.slug);
      if (!product) return body({ type: 'NOT_FOUND' });
      const rows = NUTRITION.rows.map(([name, value]) => `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(isTodo(value) ? 'To be confirmed' : value)}</td></tr>`).join('');
      return `${header()}<main id="main">
<nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/shop">Shop</a> / ${escapeHtml(product.name)}</nav>
<h1>${escapeHtml(product.name)}</h1>
<img class="pre__can" src="${getProductThumbUrl(product)}" alt="${escapeHtml(product.name)} can" width="187" height="491" fetchpriority="high">
<p>${escapeHtml(product.description)}</p>
<h2>${escapeHtml(product.name)} facts</h2>
<dl>${productFacts(product).map((f) => `<dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value)}</dd>`).join('')}</dl>
<h2>Nutrition (${escapeHtml(NUTRITION.serving)})</h2><table>${rows}</table>
<p>Prices and ordering load with the page; add to bag needs JavaScript.</p>
<h2>Other flavors</h2><ul>${product.relatedSlugs.map((slug) => getProductBySlug(slug)).filter(Boolean).map((p) => `<li><a href="/products/${p!.slug}">${escapeHtml(p!.name)}</a></li>`).join('')}</ul>
</main>${footer()}`;
    }
    case 'HALAL':
      return `${header()}<main id="main"><h1>Halal and Zamzam</h1><p>${escapeHtml(BRAND.name)} is halal certified and made with added Zamzam water.</p><p>The certifier, licence and the Zamzam sourcing details will be published here once confirmed.</p></main>${footer()}`;
    case 'LIMITED':
      return `${header()}<main id="main"><h1>Limited editions</h1><p>Small batches. Bold flavors. Gone when they're gone.</p><h2>Blackout Berry</h2><p>Drop 01, on sale now. <a href="/products/blackout-berry">Get it now</a></p><h2>Falsa Frost</h2><p>Batch 001, coming soon.</p><h2>Cold Coffee</h2><p>Café batch, coming soon. Contains milk.</p></main>${footer()}`;
    case 'ABOUT':
      return `${header()}<main id="main"><h1>Our story</h1><p>${escapeHtml(ABOUT_PAGE.intro)}</p><h2>Founder</h2><p>${escapeHtml(ABOUT_PAGE.founder.name)} founded ${escapeHtml(BRAND.company.name)}, the company behind ${escapeHtml(BRAND.name)}.</p><p>${escapeHtml(BRAND.summary)}</p>${range()}</main>${footer()}`;
    case 'MIX':
      return `${header()}<main id="main"><h1>Mix your pack</h1><p>Build a 6, 12 or 24 can pack from any mix of the six flavors.</p>${range()}</main>${footer()}`;
    case 'STORES':
      return `${header()}<main id="main"><h1>Find a store</h1><p>The store list is coming soon. You can order online in the meantime.</p><p><a href="/shop">Shop the range</a></p></main>${footer()}`;
    case 'PRIVACY':
      return `${header()}<main id="main"><h1>${escapeHtml(PRIVACY.title)}</h1><p>${escapeHtml(PRIVACY.intro)}</p>${PRIVACY.sections
        .map((section) => `<h2>${escapeHtml(section.heading)}</h2>${section.items.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}`)
        .join('')}<p>${escapeHtml(PRIVACY.note)}</p></main>${footer()}`;
    case 'CART':
      return `${header()}<main id="main"><h1>Your bag</h1><p><a href="/shop">Shop the range</a></p></main>`;
    case 'CHECKOUT':
      return `${header()}<main id="main"><h1>Checkout</h1><p><a href="/shop">Shop the range</a></p></main>`;
    default:
      return `${header()}<main id="main"><h1>Page not found</h1><p>This page doesn't exist. <a href="/shop">Head back to the range.</a></p></main>`;
  }
}

/** The full static markup for a route: the styled shell and its content. */
export function staticHtml(route: SeoRoute): string {
  return `<div class="pre" data-prerender><div class="pre__in">${body(route)}</div></div>`;
}

export { pageMeta };
