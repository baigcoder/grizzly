# Low-network, rendering and Zamzam audit

Scope: the Zamzam chapter and `/halal-zamzam` page, a design pass over every home section and route (1440×900, 1280×720,
1024×768, 820×1180, 390×844), and a performance and slow-network pass. Measured with Playwright + Chromium (software
WebGL), CDP network emulation (Fast 3G 1.6 Mbit/s 150 ms, Slow 3G 400 kbit/s 400 ms) and a local HTTP/2 server.

## Design findings and fixes

| # | Finding | Fix |
|---|---|---|
| 1 | **Zamzam chapter, desktop:** the title ("ADDED ZAMZAM WATER", the longest of the four) and description ran into the can's left edge at 1440, 1280 and 1024 px. The copy is laid out in CSS pixels and the can in world units, so the overlap grew as the window narrowed. | `benefitCanShift` (`webgl/sceneStates.ts`): the benefit chapters slide the can right by exactly the overlap plus a 28 px gap, measured from the real DOM (the title's `scrollWidth`, the rail's left edge), capped so the can never runs into the rail. Cached; re-measured on resize and when the display font lands, never per frame. Applies to all four chapters so the can does not sway between them. Phones and portrait tablets stack the copy under the can and are unchanged. |
| 2 | **Zamzam chapter:** the Halal seal was practically invisible: hairline stroke ≈ 0.4 px at badge size and an inner "HALAL" about 3 px tall. | Heavier stroke for the compact seal (1.15 vs 0.5 in viewBox units), inner Latin text dropped (the caption beside it says the word), badge 5.5 → 6 rem. Counter given room under the Arabic script. |
| 3 | `/halal-zamzam`, phones: the can fan was 400 px wide on a 390 px screen (sideways scroll). | Smaller floor for the can width and `overflow-x: clip` on the fan. Page width is now exactly the viewport on every route. |
| 4 | `/halal-zamzam`: the large seal's strokes were faint against the glow. | `--stroke-seal: 0.8` on that page. |
| 5 | Empty checkout, phones: the can fan crashed into the "Shop the range" button (its bottom margin was overridden by a shorter rule). | Correct bottom margin and side padding. |

Checked and left alone: hero, flavor profile, argument, lineup, FAQ, newsletter, shop, limited, about, stores, mix, product,
cart, privacy, 404. Observed but deliberate (reference-faithful): the cans overlapping "THE PACK" in the newsletter title and
the giant "FUEL YOUR WILD SIDE" headline sitting behind the can.

## Network findings (emulated Slow 3G, phone, cold cache)

| Metric | Before | After |
|---|---|---|
| First paint (HTML + inline CSS only) | ≈ 7.0 s | **≈ 0.6 s** |
| Loader holding the page | ≈ 19–20 s | **≈ 9 s** (page usable on a static stage; scene joins later) |

Causes and changes:

1. **Blank screen until JavaScript.** The prerendered content is deliberately `visibility:hidden` (so it does not flash before
   the loader), and the app stylesheet in `<head>` blocks first paint. On a slow link that was seconds of nothing.
   - `scripts/prerender.mjs` moves the app stylesheet to just after the static markup.
   - `seo/staticPage.ts` adds a **boot screen** (the same wordmark the loader draws, inline CSS only) on the routes that open
     with the loader (home, product). React replaces it at mount.
   - Verified safe: with the stylesheet delayed 5 s on a fast link the app still waited for it before mounting
     (module scripts wait for pending stylesheets), so it can never mount unstyled.
2. **The loader waited for the 3D scene however long that took.** `Preloader` takes `giveUpAfterMs` (8 s from navigation
   start) on thin links only. Past it the loader finishes, the page opens on the same static stage the no-WebGL page uses, and
   the scene replaces it once the can in front has its label (`SceneManager.firstLabelReady`), so a black placeholder can never
   be revealed. The intro is not armed for a scene that arrives after the loader has gone. Fast links are unchanged.
3. **3G was not treated as thin.** One classifier (`devicePower.classifyNetwork`, unit-tested) now drives both the render tier
   and the download policy: data saver / 2g still take the cheap tier; `3g` additionally keeps to the small label textures
   (no 4k, no full 2k on phones, no speculative prefetch) without lowering how a capable phone renders. On a thin link the two
   neighbouring cans' surface maps (≈ 800 KB) wait for the first interaction instead of competing with the focused label.

Not a defect: the 488 KB Basis transcoder looked downloaded twice in a cache-disabled run. With a normal cache it is fetched
once (the warm-up `fetch` fills the HTTP cache).

### A trap worth recording
The first version of the late-scene hand-over hid the canvas with `opacity: 0` until it was ready. A WebGL canvas that keeps
rendering while hidden piles up unpresented frames, and revealing it froze a software-rendered browser's main thread for
**88 s** (CPU profile: all native GL time). The canvas is never hidden now: an opaque stand-in covers it, then fades out.

## Rendering audit

No change needed: the frame loop allocates no `THREE` objects per frame (the only constructions in the per-frame methods are
lazily created, once), `dispose()` releases listeners, timers, geometries, materials, textures, post-processing, the
environment and the renderer, and the repo's leak/cleanup e2e tests cover it. Labels already stream by need (1k first, 2k for
the focused can, 4k only for close-ups on capable high-density screens).

## Not done / follow-ups

- **Texture weight:** the 4k KTX2 files are 2.1–2.9 MB each. They are only fetched on HIGH-tier desktops in close-ups, but a
  1.5k intermediate level would help mid-range laptops on slow links.
- **Service worker:** repeat visits already rely on long-lived HTTP caching (`vercel.json`); an offline shell would help flaky
  links but adds a cache-invalidation surface and was left out.
- **Hidden-scene rendering:** while the stand-in covers a late scene it renders underneath. Pausing it until reveal would save
  battery on exactly the devices that are slow; the cover makes that safe to add.
- **Real hardware:** everything here ran on software WebGL. Check the Zamzam chapter at 1920×1080 and on a real phone over a
  real 3G connection.

## Validation
lint ✓ · typecheck ✓ · vitest (unit) ✓ · production build + prerender ✓ · Playwright: see the task summary.
