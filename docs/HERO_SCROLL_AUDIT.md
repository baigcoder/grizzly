# Hero Scroll Audit — reference vs. current (2026-10-17)

Compared `referenceoriginal/`, `reference/live/` (01-hero, hero-transition-*, scroll-01) against the running dev build at
1024×768 and 375×812.

## Findings

| # | Reference behaviour | What we had | Severity |
|---|---|---|---|
| 1 | Scrolling out of the hero is one continuous dive: the ring opens, neighbours sweep outward past the lens, the focused can pushes toward the camera and settles into the tilted flavor pose. | Neighbours switched off (`visible = false`) once `wave` dropped below 0.8, about 20% into the transition. The focused can only got 85% of the way to its pose before the single-can layout took over, so it jumped at the hand-off. The result read as a cut. | High |
| 2 | Ring has a clear depth hierarchy: the focused can leads, neighbours are smaller and float with individual tilts. | Neighbours at 82% scale with zero scatter read as a flat product shelf. | Medium |
| 3 | Flavor chapter: one can plus a copy block, with little else competing. | Six spec callouts with leader lines fanned over the can. Below about 1280 px they overlapped it, and the can ran off the right edge into the benefit rail. | Medium |

## Changes

- **Dive transition** (`sceneManager.layoutCans`, hero-ring branch), all scrubbed by scroll and deterministic:
  - `collapse = clamp((1 - wave) / 0.85)`. Only the focused can collapses. It lands exactly on the single-can pose at
    `wave = 0.15`, where the feature layout takes over, so the hand-off has no jump.
  - Focused can: a `sin(π·collapse)` push toward the lens (+2.4 z) with a roll and part of a turn.
  - Neighbours keep their ring pose and move out to their own side and toward the camera, leaning away and dimming. They
    hide only once `exodus ≥ 0.97`, after they have left the frame.
  - Reduced motion: no push, no rush toward the lens and no lean. Neighbours just slide aside.
- **Ring depth** (`sceneManagerConfig`): `neighbourScale` 0.82 → 0.76, desktop `scatter` 0 → 0.22.
- **Narrow desktops**: `fitFeatureX` limits how far a side-placed feature can sits from the camera axis to
  `4.2 × min(1, aspect / 1.9)`, so it stays whole at 1024–1700 px. Benefit poses sit inside the limit and don't move.
  The 1920 composition is unchanged.
- **Flavor chapter re-posed to match the reference** (`sceneStates.profile`): one big can (scale 2.5, was 1.5), centred
  and leaning 28°, its lid under the header and its base running off the bottom edge. The camera is straight on and
  the floor and reflection drop away. This replaces the earlier pose, where the whole can sat on the right.
  - Below 1920×920, `fitFeatureX` slides this can right as the frame narrows (`(1.9 − aspect) × 3.8`, blended with the
    scroll around the section) so it clears the copy.
  - Phones: the can rides 1.1 units higher at 85% size, above the copy at the bottom.
- **Cinema bars removed** (`.cine-bars` in `App.tsx`, `fx.css`, `--cine-bar-height`, and the bar logic in
  `SceneManager.updateCinema`). These were black bars, 11vh each, that slid in from the top and bottom on every fast
  scroll. The reference keeps the frame open while scrolling. The extra fast-scroll blur (`rush`) went with them. The
  soft-box light sweep when the scroll settles on a chapter stays.
- **Spec callouts removed** (`SpecCallouts.tsx`, its CSS, `SceneManager.canEdgeOnScreen`). The reference flavor
  chapter has none, a centred can leaves no room for them, and every fact still appears in the benefit chapters.

## Investigation answers (dive)
Trigger: scroll (section 0 → 1). Persists: the focused can. Scroll-driven: everything in the dive. Pointer: unchanged
tilt and hover. State: `wave` from the master timeline. WebGL: all motion. DOM: copy and scattered letters. Fallback: reduced
motion as above. The non-WebGL fallback is unchanged.

## Validation
lint ✓ · typecheck ✓ · vitest 25/25 ✓ · production build + prerender ✓ · visual checks at 1024×768 (hero, 30/45/60%
dive, profile, profile→benefit, benefits) and 375×812 (hero, mid-dive, profile). No console errors after a fresh load.

## Not yet done
- No 1920×1080 check: the in-app browser pane is limited to 1024 px. Check the dive on a large monitor.
- At 1024 px the tip of the can's lid comes close to the last letter of long flavor titles. It's fine at 375 px.

## Round 3 — hero, cans and loader closer to the original
- **Render sharpness**: the frame-rate governor dropped the canvas to 0.75× CSS resolution (soft, jagged cans). It now
  never renders below 1×, needs two slow windows (< 40 fps) in a row, ignores hidden tabs, and sheds effects
  (bloom and lens passes, then the low tier) before resolution. MSAA is on for every post tier, not only HIGH.
- **Cans**: varnish clearcoat 1.0 / roughness 0.08. The studio key strip is wider and brighter, and the frontal fill
  is low (0.7, was 1.6), so each can carries one crisp vertical gloss streak with a dark face between the streaks.
  Ring blur dropped to 0.12 (blurred side cans read as low-resolution labels). Side cans dim to about 0.5–0.7 focus
  and the centre can leads.
- **Hero studio**: the flavor colour moved off the wall (a broad halo had tinted the whole upper frame blue) into a
  pool at the foot of the frame. The ring tilts as in the reference (`ringWave` 0.4: lower left, higher right).
- **Pedestals** (`webgl/pedestals.ts`): lathe-turned chrome disc behind the logo and a podium under the flavor name,
  placed in screen space per frame. They slide out of frame during the dive and are hidden off the home route.
- **Hero UI**: removed the "click the can to open · hold to pick it up" hint row. The prev/next arrows sit beside the
  centre can at mid-height.
- **Loader** rebuilt to the reference: opaque black, the brand mark filling white from the bottom with a soft
  gradient edge, a spaced percentage, nothing else. Removed the see-through 3D opening that played under it
  (`moments/opening.ts`, `openingConfig.ts`, the 3 s minimum). The home loader minimum is now 1.6 s. The cans still
  rise into the ring when it leaves.
- **Removed particles and drops** (as asked): fruit slices (`fruitField`), bubbles and floating fruit
  (`effervescence`), flung droplets (`coldSpray`), ice crystals (`iceDust`), frost and wet beads (`frostMelt`), and the
  can shader's condensation beads and running drops.
- **Cinema bars and fast-scroll blur** removed (see above).

Note: in the in-app preview pane the loader can take 10–20 s, because the pane throttles frames while the 3D scene
compiles. This needs a check in a normal browser window.

## Round 4 — deep pass against every original frame (`reference/live/*`)
| Section | Original | Ours before | Now |
|---|---|---|---|
| Hero | side cans near-black, only the centre can lit | side cans at 50–70% brightness | side cans ≈12% (focus 0.3–0.38), chrome ends lit |
| Benefits | one huge dark can, centred and cropped, the lit block at mid-screen | whole can on the right | scale 2.4, centred (x 0.35), lit block placed at mid-screen per chapter from `LABEL.benefitBlocks` |
| Every section | grey studio or flavor field, never a night scene | night stage (mountains, moon, stars, aurora) under tagline, FAQ, footer | `STAGE` defaults to the studio, with mountains, moon and stars off |
| Lineup | one tight twisting row past both frame edges, no effects | row inside the frame, a particle bear above it, glow sprites | camera z 32 → 28.5; `bearSwarm` and `finaleGlow` removed |
| FAQ | cans hang along the top over grey, giant title below | camera lifted into an empty night sky | camera y −4.2 under the row, grey studio |

Also fixed: the quality governor now reacts to very slow frames (it skipped frames over 250 ms as hitches, so the
slowest devices never stepped down).

Pane note: when the in-app browser pane is hidden it runs as a background page and frames nearly stop, which is why
the earlier "loader takes 30 s" readings happened. With the pane visible the scene's first frames land at about
0.4 s and the loader leaves on time.

## Round 5: finish quality
- Removed the anamorphic flare pass (dotted horizontal streaks). Bloom is weaker and higher (0.12 / 0.3 / 2.4). The
  square glow blocks on the lineup came from the removed `finaleGlow` sprites.
- Side cans: gloss, clearcoat and the metal ends now fall off with focus² (bright white ends and streaks on dark
  labels read as glass tubes). The key strip is at 4.0.
- Ring: each side can has its own stable yaw, pitch and roll tumble, so some show their sides or backs as in the
  reference. `scatter` is 0.4.
- Podium: dark satin (only its rims catch light), 80% size, just under the flavor name. The chrome disc stays behind
  the logo.
- Hero HUD: the order link is gone (the reference hero has none; the flavor chapter keeps it). The e2e tests now
  click `#profile`'s link.

## Round 6: product page and the home loop
Product page (`ProductDetailPage.tsx`, `shop.css`, `sceneManager.renderProduct`):
1. Sticky buy bar: driven by the main button's position on scroll. It appears only after Add to bag has scrolled
   above the viewport (the IntersectionObserver version stayed up over the buy box after jumping back to the top).
2. Unconfirmed content is hidden: "To be confirmed" fact rows, the delivery lead time, unpublished delivery, returns
   and contact cards, "card payment coming soon", and the empty reviews block. The placeholder-price note stays on
   purpose, because prices must not read as final until they are.
3. Backdrop: the grey studio with the flavor pool at the floor (no night ridge). The floor sits under the can's base.
4. Hotspots keep visible labels from 1200 px (was 1600 px). The drag hint sits in the Front / Back row instead of
   over the can's base.
5. Flavor swatches carry a "Flavor: <name>" label (the choice no longer relies on colour alone).
6. The can turns to its back label while the facts section is on screen, and back to the front above it.
7. Can: scale 1.7, centred at 37% of the frame width on any aspect (computed per frame, no allocation).
8. Related flavors run full width with large cards and display names. The end gap is 3xl (was 5xl).

Home loop (as in the reference): a final `#loop` screen after the footer maps to the hero state in
`SCENE_SEQUENCE`, so the scene glides back into the ring (cans fly back in, pedestals return). At the bottom,
`useSmoothScroll(…, wrapAtEnd)` jumps Lenis to the top on a downward scroll, where the frame is identical. Off under
reduced motion and without WebGL.

## Round 7: the can is the control (product page)
- Front / Back buttons removed. Drag (mouse) or swipe (touch) turns the can. A quick release flings it, and the spin
  decays (`SceneManager.flingProduct`, `productSpin`, e^(−2.2t)). Grabbing the can stops the spin. Off under reduced motion.
- Hotspots and the scroll into the facts section still turn the can, the short way round from wherever it was spun.
- One quiet hint under the can ("Drag to turn", or "Swipe to turn" on touch screens) fades after the first turn.
- The pinned can, hotspots and hint now lift away as the full-width related flavors arrive (exit is tied to that
  section, not the page's last 0.8 screens), so nothing overlaps the cards.
- The hero podium is removed entirely; only the chrome disc behind the logo remains.
- "Delivery, returns and help" shows once a real policy is published. "Cash on delivery" sits in the facts under the
  buy box.

## Round 8: experience and speed plan
Speed (measured on the production build):
5. GSAP removed. The scroll timeline is a built-in seek (`SceneManager.seekTimeline`) with the same windows and
   power2.inOut ease. The motion chunk went from 35.0 to 7.4 KB gzipped.
6. Shop, bag, checkout, mix-a-pack, halal, privacy and store locator are `React.lazy` chunks. The main app chunk went
   from 42.9 to 38.9 KB gzipped.
7. Idle rendering: after 2.5 s without scroll, pointer, drag, spin or ring travel (and with the camera settled), the
   scene renders at 30 fps. Any input restores full rate. The quality governor ignores these throttled frames.
8. The basis transcoder (JS and wasm) and the first flavor's 1k label are preloaded while the loader is up, in the
   same request mode three's loaders use.

Experience:
1. During the hero → flavor dive, the hero title swells and dissolves within the first third (a glide toward the
   flavor title crossed the can).
2. Product page direct visit: the can rises from below with most of a turn. Coming from the home ring, it is still
   carried over. Fixed a bug where the first route always counted as "from home".
3. Hovering or focusing a flavor swatch previews its label on the 3D can, with a quick turn and the stage accent.
   Leaving restores the page's flavor.
4. Related cards tilt toward the pointer with a following sheen (mouse and pen only; off on touch screens and
   under reduced motion).

Also: the hero's top chrome ring is removed (no pedestals remain).

## Round 9: hero flavor stage and scroll aesthetics
A. Hero
- `moments/heroWord.ts`: the focused flavor's name as giant two-line type far behind the ring, wider than the frame,
  with a silver edge and a fill tinted by the flavor. It cross-fades on a flavor change (out, redraw, in, ≈0.45 s;
  instant under reduced motion) and sinks back and fades during the dive. One plane and a reused canvas, redrawn only
  on change.
- The flavor-change glint now sweeps the whole ring in the hero (a 32-unit pass instead of 14 over one can).
- A soft pointer key light (`pointerKey`) follows the cursor over the ring on desktop and fades with the ring. It is
  always in the scene, so no material ever recompiles.
B. Scroll
- Chapter body copy (tags, text, links) rises behind a mask once its chapter is active, staggered after the
  per-character title reveal. Transform, clip-path and opacity only; static under reduced motion.
- `ChapterRail.tsx`: a chapter rail on desktop (≥1024 px) with real buttons that jump to each chapter. The active
  mark grows in the flavor accent and shows its name. It replaces the bare "03 – 10" index there.
- Scroll-speed feel: a fast flick widens the lens by up to 2.2° and the side cans sway against it, then settle.
- The loop screen carries a quiet "Keep scrolling — back to the start" cue.

Round 9 follow-up: the giant flavor word behind the hero ring (`heroWord.ts`) was removed at review: it cluttered the ring
and long names ("Strawberry Kiwi") squeezed and clipped. The ring-wide sweep and the pointer key light stay.

## Round 10: can ends
The lids and bases read as white plastic: rough (0.38–0.42), strongly anisotropic aluminium spread the overhead
softbox into one uniform band. They are now polished machined aluminium (roughness 0.32 × a generated ring map of
0.45–1, so about 0.14–0.32 along the profile; anisotropy 0.08; env 0.85). They mirror the dark studio in crisp
concentric rings, with a thin bright rim. The ring map is a 4×256 DataTexture along the lathe profile (uv.y), shared
by every can, with no download.

Round 10 follow-up: the pointer key light was removed. As a real light it re-lit every can in the ring whenever the
cursor moved over the centre can, so the whole line-up appeared to flicker. The ring keeps its fixed studio lighting.

## Round 11: hero polish (six issues from review)
1. Centre can facing: the geometry already faced the art centre (u 0.556 at −0.35 rad, measured 0.95 facing). The
   pointer and hover turned it up to ±0.09 rad, which pushed the very wide "GRIZZLY" logo off one edge and pulled the
   side panel in. Pointer and hover now lean the cans (roll) and never turn them. Measured −0.350 rad with the cursor
   beside the can.
2. Title gap: the hero fit keeps 40 px between the can's base and the title (was 14). Measured 38 px at 1280×580.
3. Side tumble turns ±0.35 rad (was ±1.25), so the ring shows fronts and sides, not nutrition backs.
4. Side-can varnish: clearcoat and env fall off harder with focus, and the clearcoat roughens on side cans, so the
   key strip reads as a soft sheen instead of a sharp white line.
5. Side-can ends: darker (0.16–1×), env 0.1–1×, and up to 0.3 rougher, so their rims stop glinting.
6. Chapter rail names show on hover or focus only (the active name sat over the first can). The hero HUD sits higher,
   so "Scroll to discover" is never clipped on short windows.

## Round 12: end lighting (top and bottom)
- The base fill (a directional light aimed up at the can bottoms) drops from 0.2–0.9 to 0.06–0.26 in the hero and
  from 0.5 to 0.18 on the product page. At full strength every base read as thick white rings.
- Can ends get a touch of satin (roughness 0.42 × the ring map, about 0.19–0.42; base 0.46) and less reflection
  (env 0.6, was 0.85). The rim light and overhead softbox now give the neck and lid a soft sheen instead of a white
  glare. Label lighting is unchanged.

## Round 13: no glow across the ring on flavor change
Moving the ring left or right lit every can at once, for two reasons:
- The flavor glint is a directional light, so it flashed all twelve cans (and round 9 had widened its sweep).
- The back rim light took the new flavor's colour, re-tinting every can's edge glow.

In the hero ring both are now off: the glint scales by `1 − 1.5·wave`, and the rim tint by `1 − wave`. They still
play in the single-can chapters, where one can is on screen. Round 9's ring-wide sweep is reverted.
- The flavor-coloured fresnel rim drops from 0.08–0.45 to 0–0.1, so it is a faint edge on dark side cans only. It
  read as a coloured glow round every can in the ring and in the line-up below.
- The back light keeps a touch of flavor colour only in single-can chapters (0.25, was 0.55), none in the line-up,
  and 0.2 on the product page (was 0.55).
- Product page: the can's pose turned +0.3 rad and showed the nutrition side. It is now −0.35 rad (front art centred,
  the same maths as the hero). The Back label turn still lands on the right panel, since it is computed from the pose.

## Round 14: lighting noise and the drag hint
- Bloom is removed. On the polished can ends it blew single-pixel highlights up into soft white squares (visible as
  specks along the line-up). It also costs a few full-screen passes per frame.
- The animated film grain is off (0.035 → 0). It crawled over the dark labels as noise. The 1/255 dither stays
  against banding.
- Product page: the "Drag to turn / Swipe to turn" hint sits under the label hotspots on wide screens and below the
  can's stage on narrow ones (it sat on the can's base).

## Round 15: the four benefit chapters
- Pinned copy: the four chapters share one on-screen spot (`.benefit .section-copy` is fixed). The active chapter's
  copy swaps in (per-character title, masked rise for the rest), so the frame is never empty between chapters. The
  scroll-driven title drift is off for these pinned titles (its timeline froze part-way and pushed them 32 px right).
- No dark spin between chapters 1 → 2 → 3: the can holds its pose and steps while the lit block slides down the
  label. The turn stays for the flavor intro, Zamzam and the tagline.
- A chapter counter ("01 / 04") rolls up by the emblem.
- The icon rail has a thin progress line that fills to the active chapter (anchored to the button size on desktop
  and phones).

## Round 16: full analysis against the original, then A → C → B → D
A. Bugs
- Tagline can faced its nutrition side (rotY +0.26 → −0.25).
- The "mountain ridge" darkening in the flavor colour field drew a wave band across flavor, benefit and tagline
  backgrounds. Removed; the field is one smooth gradient as in the reference.
- Zamzam seal: drawn stroke by stroke, it was often caught with only the outer ring, which read as an empty circle.
  The inline seal now shows complete with the pinned copy.
- Line-up: on narrower desktops the whole row grows up to 1.35× around the line-up section, blending back to 1× by
  the FAQ. The FAQ camera sits at −3.6, so the cans' lower halves hang into the frame.
- Newsletter: the offer line shows only once there is a real offer (no "details coming soon").

C. Performance
- The first sharp (2k) label (≈1.3 MB) waits for an idle moment after the first frames; later flavors load at once.
- Source label fronts (5.8 MB) moved from `public/` to `assets/label-front/` (build input for the bear and social
  images, no longer deployed). `build-labels`, `build-bear` and `build-social` were updated.
- `?debug=1` shows a live readout (fps, render scale, quality tier) for checks on real devices.
- CSS splitting was skipped on purpose: the shop rules are shared with the home bag drawer and the product page,
  and the whole stylesheet is about 21 KB gzipped, so the risk outweighs the gain.

B. Closer to the original
- Tagline type: soft, solid, translucent letters with a gentle glow (was outlined glass).
- The flavor intro's spaced letter grid is now drawn in WebGL behind the can (`moments/flavorLetters.ts`). The DOM
  version sat behind the opaque canvas and never showed. Wide frames only (aspect ≥ 1.4), so it never runs through
  the copy.
- Hero ring curves toward the viewer at its edges (concave, like the reference) on desktop.

D. Beyond the original
- Product page pack picker in 3D: the spare cans wear the product's label and rise into a tiered case behind the hero
  can (1, 6, 12 or 24; up to 11 spares). They sink away for a single can, and every can's own label is restored when
  the product page closes (verified: 0 mismatched).
- Hero flavor change feels physical: the camera eases back while the ring travels (up to 1.4 units, measured
  29.00 → 29.73 → 29.00).

## Round 17: line-up cans no longer intersect
Measured before: every neighbouring pair overlapped by 0.2 units axis to axis. The fixed 1.68-unit step was narrower
than a can (1.65 wide plus lean and pitch), and on phones the positions shrank to 30% while the cans only shrank to
46%. The step is now derived from the cans' real scale (about 12% of a diameter of air between neighbours), and the
pitch range eases from ±0.8 to ±0.6. Measured after: +0.17 on mobile, +0.18 at 1280×613. The tagline type fades out
earlier (6.15–6.5), before the row drops in.

## Round 18: product page polish
- The pack tray shows on the wide layout only (the narrow stage is too small, and the cans crowded the hero can).
  Tray spacing is 1.8 × k (was 1.45, narrower than a can's 1.59 diameter). Measured clearance +0.22.
- The "Limited edition" badge is compact in the stacked narrow layout (`align-self: flex-start`; it stretched into a
  full-width bar).
- The limited-edition timer shows nothing until the end date is confirmed (no public "end date to be announced").
  The e2e test is updated to match.

## Round 19: real packs on the product page (replaces the round 16/18 tray)
The pack you pick is the pack you see, built the way it leaves the line (`src/webgl/packDisplay.ts`):
- 1 can: the hero can.
- 6 cans: two rows of three under a printed paperboard top clip, pressed down onto the lids (lids and tabs show
  through the holes; two finger holes).
- 12 and 24 cans: warehouse case packs. A printed tray blank slides in and its walls fold up, the cans drop in back
  row first, then clear film drops over and heat-shrinks tight. The film dips between the cans, gathers in pleats at
  the corners and leaves the oval "bullseye" opening at each end. The tray print (wordmark, flavor in its own colour,
  pack size) and the clip print redraw for the flavor shown, including swatch previews.
- Changing pack plays the current one out (reversed, faster) and the new one in. The hero can steps out first and
  comes back for 1 can. Opening a label hotspot also brings the single can back (the hotspot points at its label),
  and closing it rebuilds the pack.
- The pack fits between the hotspot dots and the purchase panel (wide) or the screen edges (narrow). While a pack is
  shown, the hotspot pills fold to their dots (labels stay readable by screen readers). Drag and fling turn the pack.
  The facts section's automatic back-panel turn is ignored by the pack.

How it is built:
- Cans: four instanced meshes (shell, lid, base, tab), up to 24 cans in four draw calls. They share the can
  geometry and the product's label maps.
- Film: a procedural tube with bullseye ends. The material is transparent and gets its alpha from fresnel, the
  reflected light and two mirrored studio softboxes, broken up by a generated crinkle normal map.
- Tray, clip and shadow: procedural, with canvas prints.
- Everything is built on first use per pack size and freed in `dispose()`. Instance matrices are only rewritten
  while a pack assembles, and the scene keeps full frame rate until it settles. Reduced motion switches packs
  instantly.

Checked at 1280×640 and 375×812: each pack, mid-assembly, hotspot open and closed. No console errors. Lint,
typecheck, 25 tests and the build pass.

## Round 20: the Zamzam chapter
The last benefit used to be a cold teal pool. It is now its own reverent moment, abstract and quiet, with no sacred
buildings or text depicted (`moments/zamzamPool.ts`):
- First light (fajr): a warm dawn band low over the still water, deep teal above it, night at the top of the frame.
- Light falls through a faint carved lattice screen (mashrabiya: interlaced eight-point stars, procedural) onto the can.
- Behind the can, a gold sixteen-point rosette (interlaced squares, petals and a ring of dots, drawn once into a
  canvas texture) catches a slow sweep of light. The water mirrors it, broken up by the swell.
- The rings, the falling drop and the motes stay, recoloured to the dawn light.
- The copy: beside the emblem, زمزم in Amiri (a classical Naskh face, self-hosted via @fontsource/amiri, Arabic
  subset only) is written in from right to left, then a slow gold sheen passes across it. It is decorative and hidden
  from assistive tech (the title says it). It renders from the chapter before, so the font is in before it shows.
- The chapter's accent turns from the flavor colour to dawn gold (`.benefit--zamzam`; tokens
  `--color-zamzam-gold*`).
- Reduced motion: a still sheen and still light.
- The tray and clip prints now use the bundled brand italic (900/700) instead of a missing upright weight.
