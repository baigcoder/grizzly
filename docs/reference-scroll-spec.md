# Reference scroll and can animation: measured spec

Source: the live reference (ciaoenergy.com), read from the page's own client scripts on 2026-11-10, at 1440x900.
These are measurements to match, not code to copy. Our scene already uses the same field names (`camPosZ`, `canSpin`,
`wave`, `swirl`, ...), so the work is in the numbers, easing and input handling.

## Stack
Webflow page, GSAP 3.15 (ScrollTrigger, SplitText), Lenis, three r161 (EffectComposer, SMAA, UnrealBloom, HDRI, a real
`base.glb` can). Sections are `<section>` elements each **1.25 x viewport height** (1125 px at 900), 11 in total: gamme (hero),
profile, 4 benefits, argument, full-gamme, faq (taller, 1557), last-copy, last.

## Scroll engine
- Lenis with `infinite: true` and `syncTouch: true`; the loop runs on the page's own requestAnimationFrame.
- **The 3D timeline is seeked straight to the Lenis position every frame: `timeline.seek(scroll / scrollHeight)`. No extra
  damping.** All smoothing comes from Lenis. (Ours adds a second damping stage, so the can lags the scroll.)
- Each timeline segment's duration = that section's height / total scroll height, eased `power1.inOut`.
- Page copy is separate: GSAP ScrollTrigger `toggleActions` per section, 0.5 s `power2.inOut` fades, text lines mask in
  (SplitText) 0.35 s after entering; benefit lines draw in at +1 s over 0.8 s `power3.out`.

## Paging (what makes it feel "exact")
- **Desktop (>= 1024 px):** wheel is hijacked. One wheel gesture (|deltaY| >= 4) moves exactly one section up or down, then
  locks until it lands. Duration **1.5 s** when leaving sections 0, 1, 5, 6 and **1.0 s** otherwise, easing
  `1 - (1 - t)^3` (cubic out). Active only while the current section index is <= 6; after that (range, faq, newsletter) scroll
  is free. After any scroll ends, it snaps to the nearest section top (sections 0 and 1 only on desktop).
- **Mobile (< 1024 px):** vertical swipe is hijacked. On touch end, a drag of more than 24 px moves one section (up or
  down), **1.5 s**, cubic-out; no overshoot across several sections. Active while the section index is <= 7. Sections 0 to 5
  snap.
- Targets are `section top - 10 px` (except 0).
- **Loop:** Lenis wraps at the end. If the position jumps back by more than 60% of the page, it scrolls to the top over
  1.2 s cubic-out (never a hard jump) and ignores input for 1.3 s. The timeline ends with "move offscreen", a camera teleport
  above (cam y 8, z 10), then "return on screen" to the hero values, then back to the start values.

## Can timeline (scrubbed), desktop values
Fields: camera (pos, rot, fov), can (scale, pos, rot, spin), spacing, wave (1 = ring), swirl (1 = lineup), baseOffset, lights.

| State | Camera pos (x,y,z) | cam rot (x,y,z) deg | fov | can pos (x,y,z) | can rot (x,y,z) deg | spin deg | spacing | wave/swirl |
|---|---|---|---|---|---|---|---|---|
| hero (start) | 0,0,29 | 0 | 20 | 0,0,0 | 0 | 0 | 1 | 1 / 0 |
| taste (flavor) | 0,0,6 | 0 | 40 | 0.5,-0.5,0 | -37.5, 15, 22.5 | 0 | 3.5 | 0 / 0 |
| advantage 1 | 0,-2,12 | 10, 0, -10 | 20 | 0,-0.8,0 | 0 | 120 | 2.2 | 0 / 0 |
| advantage 2 | 0,-2,12 | 10, 0, 5 | 20 | 0,-0.48,0 | 0 | 130 | 2.2 | 0 / 0 |
| advantage 3 | 0,-2,12 | 10, 0, -10 | 20 | 0,0.02,0 | 0 | 120 | 2.2 | 0 / 0 |
| advantage 4 | 0,-2,12 | 10, 0, 5 | 20 | 0,0.5,0 | 0 | 130 | 2.2 | 0 / 0 |
| no bullshit | 0,0,8 | 0 | 45 | 0,0,-0.5 | -20, 0, -5 | 0 | 5 | 0 / 0 |
| packshot (lineup) | -3,-3.5,20 | 10, -9, -10 | 30 | 0,0,-0.4 | 0 | 0 | 0.47 | 0 / 1 |
| move offscreen | 0,-5.5,10 | 0 | 30 | 0,0,-0.4 | 0 | 0 | 0.6 | 0 / 1 |
| (teleport) | 0,8,10 | 0 | 20 | - | - | - | 5 | - / 0 |
| return on screen | 0,0,29 | 0 | 20 | 0,0,0.5 | 0 | 20 | 5 | 0 / 0 |

Benefits move the lit block by **sliding the can up 1.3 units across the four chapters** while a fixed spotlight (intensity
35, y 2.2) stays put; the camera rolls between -10 and +5 degrees, and the can turns 120 -> 130 -> 120 -> 130 degrees.
Per-can ring maths: scale 1.2 at rest, position from `x * spacing`, wave sine on y, etc.; lerps toward the timeline values by
distance from the first section.

## Status against our code (2026-11-11)
Matched and verified at 1920x920 and 375x812:
- Timeline seeks straight to the Lenis scroll (no second damping).
- Sections are 1.25 x viewport on desktop and phones (tops 0, 1150, 2300 ... at 920; 0, 1015, 2030 ... at 812: the same
  numbers as the reference). The lineup button is anchored to the first screen of its section.
- Flavor intro, four benefit chapters and tagline use the reference's camera, lens and can numbers (sceneStates.ts); the
  fit-to-copy logic is gone. Benefit chapters slide the can so each lit block lands at one spot.
- Paging: slow chapters 0, 1, 5, 6; the wheel pages one chapter less far than a swipe (reference: wheel to index 6, swipe to
  index 7); a whole-chapter swipe glides 1.5 s (a nudge is shorter, and the page follows the finger: an enhancement).

Not matched yet:
- Lineup (packshot), FAQ, newsletter, "move offscreen" and the camera teleport: ours keeps its own row layout and camera
  (z 28.5); the reference's is a dense cascade at spacing 0.47, camera (-3,-3.5,20), fov 30.
- Loop: reference wraps with Lenis `infinite`, sends the camera up (teleport to y 8) and brings the cans back down onto the
  stage. Ours now arms the intro as the footer arrives and plays it at section 9.7 (the ring rises in staggered from the
  middle, carrying on across the invisible wrap to the top), instead of popping the ring in on one frame. Not the same
  mechanism or camera path, but animated.
- Per-section copy animation timing (SplitText line masks, 0.35 s delay, 0.5 s power2.inOut) not compared.
