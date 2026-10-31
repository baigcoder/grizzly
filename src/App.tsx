import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { FLAVORS } from './data/flavors';
import { getProductBySlug } from './data/products';
import { applyHead } from './seo/applyHead';
import type { SceneManager } from './webgl/sceneManager';
import { Preloader } from './components/Preloader';
import { SiteHeader } from './components/SiteHeader';
import { MenuDrawer } from './components/MenuDrawer';
import { ChapterRail } from './components/ChapterRail';
import { DebugHud } from './components/DebugHud';
import { SiteFrame } from './components/SiteFrame';
import { SCENE_SEQUENCE } from './webgl/sceneStates';
import { StageBackdrop } from './components/StageBackdrop';
import { Atmosphere } from './components/Atmosphere';
import { HeroCarousel } from './components/HeroCarousel';
import { ProfileSection } from './components/ProfileSection';
import { BenefitsSection } from './components/BenefitsSection';
import { ArgumentSection } from './components/ArgumentSection';
import { FullGammeSection } from './components/FullGammeSection';
import { FaqSection } from './components/FaqSection';
import { NewsletterFooter, SiteFooter } from './components/NewsletterFooter';
import { FallbackStage } from './components/FallbackStage';
import { ProductDetailPage } from './components/ProductDetailPage';
import { CartDrawer } from './components/CartDrawer';
import { NotFoundPage } from './components/NotFoundPage';
import { FlavorFinder } from './components/FlavorFinder';
import { PointerFX } from './components/PointerFX';
import { CookieNotice } from './components/CookieNotice';
import { LimitedTeaser } from './components/LimitedTeaser';
import './styles/limited.css';
import type { MenuItem } from './components/MenuDrawer';
import { useCart } from './store/cart';
import { useSmoothScroll, prefersReducedMotion } from './hooks/useSmoothScroll';
import { useHomeScroll } from './hooks/useHomeScroll';
import { useCanKeys } from './hooks/useCanKeys';
import { isLowPowerDevice, pickQuality, readDeviceSignals } from './webgl/devicePower';
import { scrollVar } from './hooks/scrollVar';
import { versioned } from './data/assetVersion';

// Secondary routes load on demand (their own chunks), so the home story's first download stays small.
const CartPage = lazy(() => import('./components/CartPage').then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() => import('./components/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const ShopPage = lazy(() => import('./components/ShopPage').then((m) => ({ default: m.ShopPage })));
const PackBuilder = lazy(() => import('./components/PackBuilder').then((m) => ({ default: m.PackBuilder })));
const HalalPage = lazy(() => import('./components/HalalPage').then((m) => ({ default: m.HalalPage })));
const LimitedPage = lazy(() => import('./components/LimitedPage').then((m) => ({ default: m.LimitedPage })));
const AboutPage = lazy(() => import('./components/AboutPage').then((m) => ({ default: m.AboutPage })));
const PrivacyPage = lazy(() => import('./components/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const StoreLocator = lazy(() => import('./components/StoreLocator').then((m) => ({ default: m.StoreLocator })));

/**
 * Starts a download the 3D scene will make anyway, while the loader is up and the scene chunk is still arriving (the
 * texture transcoder and the first label used to wait until the scene was built). The responses land in the HTTP
 * cache (these files are cached for a month), where three's loaders find them.
 *
 * A plain fetch, not <link rel="preload">: browsers report preloads to extensions as type "other", and download
 * managers (Neat Download Manager among them) grab any "other" request whose extension is not a web page type, so
 * every visit popped a download of the .ktx2 label. Script fetches they leave alone (except audio and video).
 */
const warmed = new Set<string>();
function preloadForScene(href: string) {
  if (warmed.has(href)) return;
  warmed.add(href);
  void fetch(href, { credentials: 'same-origin' })
    .then((response) => response.arrayBuffer())
    .catch(() => undefined);
}

/** Home loader minimum: long enough for the mark to fill as a moment (the reference counts up visibly). */
const MIN_LOADER_MS = 1600;

/** Resolves after the browser has painted a frame (or after a short timeout in a hidden tab). */
const afterNextPaint = () =>
  new Promise<void>((resolve) => {
    const fallback = window.setTimeout(resolve, 400);
    requestAnimationFrame(() =>
      window.setTimeout(() => {
        window.clearTimeout(fallback);
        resolve();
      }, 0)
    );
  });
/** A product page only waits for the scene's first frame (its can), not for a cinematic. */
const PRODUCT_LOADER_MS = 250;

/**
 * Which loader a hard load of a route gets. Only the home story has the cinematic opening; a product page
 * holds a short, plain loader until its can is on screen; every other route (shop, bag, checkout, halal,
 * stores, privacy, 404) is plain content and never waits for the 3D scene.
 */
type LoaderMode = 'cinematic' | 'product' | 'none';
const loaderModeFor = (route: AppRoute): LoaderMode => (route.type === 'HOME' ? 'cinematic' : route.type === 'PRODUCT' ? 'product' : 'none');

export type AppRoute =
  | { type: 'HOME' }
  | { type: 'CART' }
  | { type: 'CHECKOUT' }
  | { type: 'SHOP' }
  | { type: 'MIX' }
  | { type: 'HALAL' }
  | { type: 'LIMITED' }
  | { type: 'ABOUT' }
  | { type: 'STORES' }
  | { type: 'PRIVACY' }
  | { type: 'NOT_FOUND' }
  | { type: 'PRODUCT'; slug: string };

const STATIC_ROUTES: Record<string, AppRoute> = {
  '/': { type: 'HOME' },
  '/cart': { type: 'CART' },
  '/checkout': { type: 'CHECKOUT' },
  '/shop': { type: 'SHOP' },
  '/mix': { type: 'MIX' },
  '/halal-zamzam': { type: 'HALAL' },
  '/limited': { type: 'LIMITED' },
  '/about': { type: 'ABOUT' },
  '/stores': { type: 'STORES' },
  '/privacy': { type: 'PRIVACY' },
};

function parseCurrentRoute(): AppRoute {
  if (typeof window === 'undefined') return { type: 'HOME' };
  const path = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  if (STATIC_ROUTES[path]) return STATIC_ROUTES[path];
  const product = path.match(/^\/products?\/([^/]+)$/);
  if (product) return { type: 'PRODUCT', slug: product[1] };
  return { type: 'NOT_FOUND' };
}

/**
 * Does this route need the 3D scene? The home story and product pages are the scene. The plain pages (shop, bag,
 * checkout, mix, halal, stores, privacy, 404) only use it as a backdrop, so phones skip it there: the buying funnel
 * loads no WebGL. If the visitor then opens the home page or a product, the scene is created on demand.
 */
const wantsScene = (route: AppRoute) => route.type === 'HOME' || route.type === 'PRODUCT' || route.type === 'MIX' || !isLowPowerDevice();

/** Scene mode per route: the home story, a single product can, or nothing (plain pages). */
const sceneRoute = (route: AppRoute) => (route.type === 'PRODUCT' ? 'PRODUCT' : route.type === 'HOME' ? 'HOME' : route.type === 'MIX' ? 'MIX' : 'PAGE');

function getInitialFlavorIndex(): number {
  if (typeof window === 'undefined') return 0;
  const slug = window.location.hash.toLowerCase().match(/(?:^|[#&])flavor=([^&]+)/)?.[1];
  const index = slug ? FLAVORS.findIndex((flavor) => flavor.id === slug) : -1;
  return index >= 0 ? index : 0;
}



export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);

  const [isReady, setIsReady] = useState(false);
  // ?debug=1: frame-rate readout for checks on real devices
  const [showDebugHud] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1');
  const [route, setRoute] = useState<AppRoute>(parseCurrentRoute);
  const [loaderMode] = useState<LoaderMode>(() => (typeof window === 'undefined' ? 'none' : loaderModeFor(parseCurrentRoute())));
  useEffect(() => {
    if (loaderMode === 'none') document.documentElement.dataset.loader = 'none';
  }, [loaderMode]);
  const [activeIndex, setActiveIndex] = useState<number>(getInitialFlavorIndex);
  const initialFlavorIndexRef = useRef(activeIndex);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFinderOpen, setIsFinderOpen] = useState(false);
  const [webGlAvailable, setWebGlAvailable] = useState(true);
  // Once the scene has been wanted it stays (it is never torn down on navigation).
  const [sceneWanted, setSceneWanted] = useState(() => typeof window !== 'undefined' && wantsScene(parseCurrentRoute()));
  const [sceneUp, setSceneUp] = useState(false);

  const { isOpen: isCartOpen, toggleCart } = useCart();
  const isHome = route.type === 'HOME';
  // phones page one chapter per swipe from the hero to the lineup, then scroll freely (useSmoothScroll)
  const { scrollToElement } = useSmoothScroll(
    isHome && isReady,
    '.home > .home-section:not(.faq)',
    isHome && webGlAvailable,
    '.home > .home-section',
    '#full-gamme'
  );
  const { scene, chapter, sectionIndex } = useHomeScroll(isHome, sceneManagerRef);
  useCanKeys(isHome ? 'HOME' : route.type === 'PRODUCT' ? 'PRODUCT' : 'OTHER', sceneManagerRef);

  const navigate = useCallback((targetUrl: string) => {
    const previous = parseCurrentRoute();
    window.history.pushState(null, '', targetUrl);
    const next = parseCurrentRoute();
    const sm = sceneManagerRef.current;
    // Coming back from a product: focus that flavor in the ring.
    if (previous.type === 'PRODUCT' && next.type === 'HOME') {
      const index = FLAVORS.findIndex((flavor) => flavor.id === previous.slug);
      if (index >= 0) {
        sm?.setInitialFlavor(index);
        setActiveIndex(index);
      }
    }
    setRoute(next);
    if (wantsScene(next)) setSceneWanted(true);
    sm?.setRoute(sceneRoute(next), next.type === 'PRODUCT' ? next.slug : undefined);
    window.scrollTo({ top: 0, behavior: 'instant' });
    const hash = new URL(targetUrl, window.location.origin).hash.slice(1);
    if (hash) {
      // Wait for the target route to render, then jump to the section.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'instant' }))
      );
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const next = parseCurrentRoute();
      setRoute(next);
      if (wantsScene(next)) setSceneWanted(true);
      sceneManagerRef.current?.setRoute(sceneRoute(next), next.type === 'PRODUCT' ? next.slug : undefined);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // WebGL scene (client only), loaded as its own chunk so the page's text and UI paint first.
  // Falls back to the static stage when WebGL is unavailable or the chunk fails.
  useEffect(() => {
    if (!sceneWanted) {
      // Plain page on a phone: no scene, nothing to wait for.
      setIsReady(true);
      return;
    }
    const canvas = canvasRef.current;
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!canvas || !gl) {
      setWebGlAvailable(false);
      setIsReady(true);
      return;
    }

    let cancelled = false;
    let readyFrame = 0;
    let readyTimer = 0;
    let teardown: () => void = () => {};
    const startRoute = parseCurrentRoute();
    const productFlavor = startRoute.type === 'PRODUCT' ? FLAVORS.find((flavor) => flavor.id === startRoute.slug)?.id : undefined;
    const firstFlavor = productFlavor ?? FLAVORS[initialFlavorIndexRef.current % FLAVORS.length].id;
    ['/basis/basis_transcoder.js', '/basis/basis_transcoder.wasm', versioned(`/textures/grizzly/ktx2/${firstFlavor}-1k.ktx2`)].forEach(preloadForScene);
    performance.mark('grizzly:scene-import-start');
    import('./webgl/sceneManager')
      .then(async ({ SceneManager }) => {
        if (cancelled) return;
        performance.mark('grizzly:scene-import-end');
        // Let the loader and the page's first paint land before the (long) scene construction starts: the
        // text must never wait for WebGL.
        await afterNextPaint();
        if (cancelled) return;
        const sm = new SceneManager(canvas);
        performance.mark('grizzly:scene-created');
        sceneManagerRef.current = sm;
        // Reduced motion keeps the 3D scene but drops to the light tier, with no intro, spin or tilt.
        const quality = pickQuality(readDeviceSignals(prefersReducedMotion()));
        sm.reducedMotion = prefersReducedMotion();
        sm.setQuality(quality);
        document.documentElement.dataset.quality = quality;
        sm.onQualityChange = (level) => {
          document.documentElement.dataset.quality = level;
        };
        const initial = parseCurrentRoute();
        sm.setRoute(sceneRoute(initial), initial.type === 'PRODUCT' ? initial.slug : undefined);
        sm.setInitialFlavor(initialFlavorIndexRef.current);
        sm.setProductPack(packCountRef.current);
        sm.setMix(mixRef.current.size, mixRef.current.slots);
        sm.setMixStage(mixStageRef.current);
        // The cans are only held back for the loader's cinematic; a scene created later has no loader to release them.
        if (initial.type === 'HOME' && loaderMode === 'cinematic') sm.armIntro();
        // While the ring travels to a chosen flavor it passes the ones in between: those are not selections, so only
        // the flavor the ring is heading for becomes active (the slider announces the choice at once, not on arrival).
        const unsubscribe = sm.carousel.onChanged(({ index }) => {
          const heading = Math.round(sm.carousel.target / sm.carousel.spacing);
          if (index === ((heading % FLAVORS.length) + FLAVORS.length) % FLAVORS.length) setActiveIndex(index);
        });
        const markReady = () => {
          window.clearTimeout(readyTimer);
          performance.mark('grizzly:scene-first-frames');
          setSceneUp(true);
          setIsReady(true);
        };
        // ready after two drawn frames, or after 1.5 s at the latest: a browser that holds frames back (a tab
        // opened behind another) must never leave the loader up
        readyTimer = window.setTimeout(markReady, 1500);
        readyFrame = requestAnimationFrame(() => {
          readyFrame = requestAnimationFrame(markReady);
        });
        teardown = () => {
          unsubscribe();
          if (sceneManagerRef.current === sm) sceneManagerRef.current = null;
          sm.dispose();
        };
      })
      .catch(() => {
        if (cancelled) return;
        setWebGlAvailable(false);
        setIsReady(true);
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(readyFrame);
      window.clearTimeout(readyTimer);
      teardown();
    };
  }, [sceneWanted, loaderMode]);

  // Flavor drives the colour tokens ([data-flavor]) and a shareable hash.
  useEffect(() => {
    const flavor = FLAVORS[activeIndex % FLAVORS.length];
    const productFlavor = route.type === 'PRODUCT' ? getProductBySlug(route.slug)?.slug : undefined;
    document.documentElement.dataset.flavor = productFlavor ?? flavor.id;
    if (isHome && !/#(faq|newsletter|benefits)/i.test(window.location.hash)) {
      window.history.replaceState(null, '', `#flavor=${flavor.id}`);
    }
  }, [activeIndex, route, isHome]);

  // Title, description, canonical, Open Graph and JSON-LD per route (src/seo/meta.ts).
  useEffect(() => {
    applyHead(route);
  }, [route]);

  // Product page scroll: the can moves away with the hero on narrow screens, and lifts clear of the footer on wide ones.
  useEffect(() => {
    if (route.type !== 'PRODUCT') return;
    let frame = 0;
    // written on the pinned stage only (on <html> it re-styled the whole page every scroll frame)
    const exitVar = scrollVar('--pdp-exit', '.pdp-stage');
    let pageEnd = false;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const sm = sceneManagerRef.current;
        sm?.setProductScroll(window.scrollY / window.innerHeight);
        // The pinned can (and its hotspots and hint) lift away as the full-width related flavors arrive: from their
        // top entering the screen until it is 40% up (it used to wait for the page's last 0.8 screens, so the can sat
        // over the related cards). Falls back to the page end when there is no related section.
        const related = document.querySelector('.pdp-section--related');
        const height = window.innerHeight;
        const exit = related
          ? Math.min(1, Math.max(0, (height - related.getBoundingClientRect().top) / (height * 0.6)))
          : Math.min(1, Math.max(0, 1 - (document.documentElement.scrollHeight - window.scrollY - height) / height / 0.8));
        sm?.setProductExit(exit);
        exitVar.set(exit.toFixed(3));
        if (exit > 0.35 !== pageEnd) {
          pageEnd = exit > 0.35;
          document.documentElement.toggleAttribute('data-pdp-end', pageEnd);
        }
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      exitVar.clear();
      document.documentElement.removeAttribute('data-pdp-end');
    };
  }, [route]);

  // Narrow product pages: the can is framed inside the measured DOM stage, whatever its height is.
  useEffect(() => {
    if (route.type !== 'PRODUCT') return;
    let frame = 0;
    let observer: ResizeObserver | undefined;
    const measure = () => {
      const stage = document.querySelector<HTMLElement>('.pdp-stage');
      const sm = sceneManagerRef.current;
      if (!stage || !sm) return;
      const rect = stage.getBoundingClientRect();
      // the can fits below the header's dark fade (it runs over the stage's top), not under it: fitted to the whole
      // stage, its lid sat inside the header band on phones
      const header = document.querySelector('.site-header');
      const scrim = header ? parseFloat(getComputedStyle(header, '::before').height) || 0 : 0;
      const top = Math.max(rect.top, scrim + 6) + window.scrollY;
      const bottom = rect.bottom + window.scrollY;
      sm.setProductStage(window.innerWidth < 1024 ? { top, height: Math.max(120, bottom - top) } : null);
    };
    // The stage mounts with the page and the scene may still be loading: retry for a few frames.
    let tries = 0;
    const attach = () => {
      const stage = document.querySelector<HTMLElement>('.pdp-stage');
      if (stage && sceneManagerRef.current) {
        measure();
        observer = new ResizeObserver(measure);
        observer.observe(stage);
        return;
      }
      if (tries++ < 120) frame = requestAnimationFrame(attach);
    };
    attach();
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      sceneManagerRef.current?.setProductStage(null);
    };
  }, [route, sceneUp]);

  // Keep the focused hero can between the header logo and the flavor title at every viewport size.
  useEffect(() => {
    if (!isHome) return;
    const title = document.querySelector<HTMLElement>('.hero__title-wrap');
    if (!title) return;
    const update = () => {
      const top = title.getBoundingClientRect().top + window.scrollY;
      const logo = document.querySelector<HTMLElement>('.site-logo');
      sceneManagerRef.current?.setHeroSafeBottom(top, logo ? logo.getBoundingClientRect().bottom : 0);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(title);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [isHome, isReady]);

  // The roar: once per visit, the first scroll away from the top.
  useEffect(() => {
    if (!isHome || !isReady) return;
    const onScroll = () => {
      if (window.scrollY < 24) return;
      window.removeEventListener('scroll', onScroll);
      sceneManagerRef.current?.roar();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHome, isReady]);

  // Benefit chapters light one block of the can label in the flavor colour.
  useEffect(() => {
    sceneManagerRef.current?.setBenefitGlow(chapter);
  }, [chapter]);

  const selectFlavor = useCallback((index: number) => {
    sceneManagerRef.current?.carousel.goTo(index);
    setActiveIndex(index);
  }, []);

  const stepFlavor = useCallback((direction: 1 | -1) => {
    const sm = sceneManagerRef.current;
    if (sm) {
      if (direction > 0) sm.carousel.next();
      else sm.carousel.previous();
    } else {
      setActiveIndex((previous) => (previous + direction + FLAVORS.length) % FLAVORS.length);
    }
  }, []);

  const scrollToSection = useCallback(
    (sectionId: string) => {
      const element = document.getElementById(sectionId);
      if (element) scrollToElement(element);
    },
    [scrollToElement]
  );

  const goToSection = useCallback(
    (sectionId: string) => (isHome ? scrollToSection(sectionId) : navigate(`/#${sectionId}`)),
    [isHome, navigate, scrollToSection]
  );

  const menuItems: MenuItem[] = [
    { key: 'range', href: '/shop', onSelect: () => navigate('/shop') },
    { key: 'limited', href: '/limited', onSelect: () => navigate('/limited') },
    { key: 'benefits', href: '/#benefits-1', onSelect: () => goToSection('benefits-1') },
    { key: 'mix', href: '/mix', onSelect: () => navigate('/mix') },
    { key: 'finder', href: '/#gamme', onSelect: () => setIsFinderOpen(true) },
    { key: 'halal', href: '/halal-zamzam', onSelect: () => navigate('/halal-zamzam') },
    { key: 'stores', href: '/stores', onSelect: () => navigate('/stores') },
    { key: 'about', href: '/about', onSelect: () => navigate('/about') },
    { key: 'faq', href: '/#FAQ', onSelect: () => goToSection('FAQ') },
    { key: 'newsletter', href: '/#newsletter', onSelect: () => goToSection('newsletter') },
  ];

  // Where the visitor is now, for the menu's current marker: the route, or on the home page the section in view
  // (sections 2–5 are the benefit chapters, 8 the FAQ, 9 the newsletter).
  const menuActiveKey =
    route.type === 'SHOP' || route.type === 'PRODUCT'
      ? 'range'
      : route.type === 'MIX'
        ? 'mix'
        : route.type === 'HALAL'
          ? 'halal'
          : route.type === 'LIMITED'
            ? 'limited'
          : route.type === 'STORES'
            ? 'stores'
            : route.type === 'ABOUT'
              ? 'about'
            : isHome
              ? sectionIndex >= 9
                ? 'newsletter'
                : sectionIndex === 8
                  ? 'faq'
                  : sectionIndex >= 2 && sectionIndex <= 5
                    ? 'benefits'
                    : undefined
              : undefined;

  // The finder recommends from anywhere: go home and spin the ring to the match.
  const handleRecommend = useCallback(
    (index: number) => {
      if (!isHome) navigate('/#gamme');
      requestAnimationFrame(() => selectFlavor(index));
    },
    [isHome, navigate, selectFlavor]
  );

  const handlePreloaderDone = useCallback(() => setIsReady(true), []);
  // stable, so the product page's pack effect runs only when the chosen pack changes
  // (remembered, so a scene built after the product page mounted still shows the chosen pack)
  const packCountRef = useRef(1);
  const handlePackChange = useCallback((count: number) => {
    packCountRef.current = count;
    sceneManagerRef.current?.setProductPack(count);
  }, []);
  // Mix your pack: the slots and the stage box go to the 3D pack (remembered, so a scene built after the page mounted
  // still shows the mix)
  const mixRef = useRef<{ size: number; slots: (string | null)[] }>({ size: 6, slots: [] });
  const mixStageRef = useRef<HTMLElement | null>(null);
  const handleMixChange = useCallback((size: number, slots: (string | null)[]) => {
    mixRef.current = { size, slots };
    sceneManagerRef.current?.setMix(size, slots);
  }, []);
  const handleMixStage = useCallback((element: HTMLElement | null) => {
    mixStageRef.current = element;
    sceneManagerRef.current?.setMixStage(element);
  }, []);
  const handlePreloaderLeave = useCallback(() => sceneManagerRef.current?.playIntro(), []);
  const handleTilt = useCallback((x: number, y: number) => sceneManagerRef.current?.setDeviceTilt(x, y), []);
  const highlightBenefit = useCallback((index: number) => sceneManagerRef.current?.setBenefitGlow(index), []);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      {loaderMode !== 'none' && (
        <Preloader
          isReady={isReady}
          onDone={handlePreloaderDone}
          onLeave={handlePreloaderLeave}
          minDurationMs={loaderMode === 'product' ? PRODUCT_LOADER_MS : MIN_LOADER_MS}
        />
      )}

      {(!webGlAvailable || !sceneWanted) && (
        <>
          <StageBackdrop scene={isHome ? scene : route.type === 'PRODUCT' ? 'flavor' : 'faq'} flavorLines={isHome ? [FLAVORS[activeIndex % FLAVORS.length].line1, FLAVORS[activeIndex % FLAVORS.length].line2] : []} />
          <Atmosphere
            scene={isHome ? scene : 'page'}
            flavorSlug={FLAVORS[activeIndex % FLAVORS.length].id}
            accentToken={FLAVORS[activeIndex % FLAVORS.length].accentToken}
          />
        </>
      )}

      {webGlAvailable && sceneWanted ? (
        <canvas
          ref={canvasRef}
          className="webgl-canvas"
          role="img"
          aria-label="Grizzly Energy cans in a cold mountain night: Blue Raspberry, Mango Fuego, Watermelon, Strawberry Kiwi, Peach and Blackout Berry. Everything shown here is also written on the page."
        />
      ) : (
        <FallbackStage activeIndex={activeIndex} showCan={!sceneWanted ? false : true} />
      )}
      {/* plain pages: a calm studio backdrop over the canvas (the halal story in dawn gold) */}
      {!isHome && route.type !== 'PRODUCT' && !(route.type === 'MIX' && webGlAvailable && sceneWanted) && (
        <div className="page-backdrop" data-variant={route.type === 'HALAL' ? 'halal' : undefined} aria-hidden="true" />
      )}


      <SiteFrame scene={isHome ? scene : 'page'} chapter={isHome ? sectionIndex : undefined} chapters={SCENE_SEQUENCE.length - 1} />
      {isHome && isReady && <ChapterRail active={sectionIndex} onJump={scrollToSection} />}

      <SiteHeader
        isMenuOpen={isMenuOpen}
        onToggleMenu={() => setIsMenuOpen((open) => !open)}
        onNavigateHome={() => (isHome ? scrollToSection('gamme') : navigate('/'))}
        onOpenBag={() => toggleCart(true)}
      />
      <MenuDrawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} items={menuItems} activeKey={menuActiveKey} />
      <FlavorFinder isOpen={isFinderOpen} onClose={() => setIsFinderOpen(false)} onRecommend={handleRecommend} />

      <CartDrawer isOpen={isCartOpen} onClose={() => toggleCart(false)} onNavigate={navigate} />

      {route.type === 'CART' ? (
        <main id="main" className="page">
          <Suspense fallback={null}><CartPage onNavigate={navigate} /></Suspense>
        </main>
      ) : route.type === 'CHECKOUT' ? (
        <main id="main" className="page">
          <Suspense fallback={null}><CheckoutPage onNavigate={navigate} /></Suspense>
        </main>
      ) : route.type === 'SHOP' ? (
        <main id="main" className="page">
          <Suspense fallback={null}><ShopPage onNavigate={navigate} /></Suspense>
        </main>
      ) : route.type === 'MIX' ? (
        <main id="main" className="page">
          <Suspense fallback={null}>
            <PackBuilder onNavigate={navigate} show3d={webGlAvailable && sceneWanted} onMixChange={handleMixChange} onStage={handleMixStage} />
          </Suspense>
        </main>
      ) : route.type === 'LIMITED' ? (
        <main id="main" className="page">
          <Suspense fallback={null}><LimitedPage onNavigate={navigate} /></Suspense>
        </main>
      ) : route.type === 'HALAL' ? (
        <main id="main" className="page">
          <Suspense fallback={null}><HalalPage /></Suspense>
        </main>
      ) : route.type === 'ABOUT' ? (
        <main id="main" className="page">
          <Suspense fallback={null}><AboutPage onNavigate={navigate} /></Suspense>
        </main>
      ) : route.type === 'PRIVACY' ? (
        <main id="main" className="page">
          <Suspense fallback={null}><PrivacyPage /></Suspense>
        </main>
      ) : route.type === 'STORES' ? (
        <main id="main" className="page">
          <Suspense fallback={null}><StoreLocator onNavigate={navigate} /></Suspense>
        </main>
      ) : route.type === 'NOT_FOUND' ? (
        <main id="main" className="page">
          <NotFoundPage onNavigate={navigate} />
        </main>
      ) : route.type === 'PRODUCT' ? (
        <main id="main" className="page page--product">
          <ProductDetailPage
            slug={route.slug}
            onNavigate={navigate}
            onRotate={(dx, dy) => sceneManagerRef.current?.rotateProduct(dx, dy)}
            onFling={(vx) => sceneManagerRef.current?.flingProduct(vx)}
            onPackChange={handlePackChange}
            onView={(view) => sceneManagerRef.current?.setProductView(view)}
            onHighlightBenefit={highlightBenefit}
            isWebglAvailable={webGlAvailable}
          />
        </main>
      ) : (
        <main id="main" className="home">
          <HeroCarousel
            activeIndex={activeIndex}
            isActive={scene === 'hero'}
            onSelectFlavor={selectFlavor}
            onPrev={() => stepFlavor(-1)}
            onNext={() => stepFlavor(1)}
          />
          <ProfileSection activeIndex={activeIndex} isActive={scene === 'flavor'} onViewDetails={(slug) => navigate(`/products/${slug}`)} />
          <BenefitsSection
            activeChapter={chapter}
            showRail={scene === 'flavor' || scene === 'benefit'}
            onNavigateChapter={(index) => scrollToSection(`benefits-${index + 1}`)}
          />
          <ArgumentSection isActive={scene === 'argument'} />
          <FullGammeSection isActive={scene === 'lineup'} onShop={() => navigate('/shop')} />
          <FaqSection isActive={sectionIndex >= 8} />
          <NewsletterFooter />
        </main>
      )}
      <SiteFooter />
      {/* The loop segment: the scene returns to the hero here, then the page wraps to the top (useSmoothScroll). */}
      {isHome && (
        <div id="loop" className="home-loop" aria-hidden="true">
          <p className="home-loop__cue">
            <span>Keep scrolling</span>
            <span className="home-loop__cue-line" />
            <span>back to the start</span>
          </p>
        </div>
      )}
      <PointerFX onTilt={handleTilt} />
      {showDebugHud && <DebugHud />}
      <CookieNotice isReady={isReady} />
      <LimitedTeaser isReady={isReady} isHome={isHome} onNavigate={navigate} />
    </>
  );
};
