# Grizzly Energy: product film (v2)

A motion-graphics product film for the Grizzly Energy launch site, built from the site itself. It uses:

- the real WebGL can: geometry, label art, brushed-metal shader and condensation;
- the site's Stage backdrop: the night with mountains and moon, the flavor colour field, the colour-wave wipe and the product studio;
- the site's floor reflections, roaring bear and Zamzam pool;
- the site's fonts and flavor accents.

The type, transitions and audio are composited in Remotion.

| Deliverable | What it is |
| --- | --- |
| `brag-output/grizzly-film-16x9.mp4` | Full film, 50 s, 1920×1080, 30 fps, -14 LUFS |
| `brag-output/grizzly-film-9x16.mp4` | Full film, vertical 1080×1920 (Reels, TikTok, Shorts), restaged for the tall frame |
| `brag-output/brag.mp4` | 20 s brag cut (launch teaser), 1920×1080; `brag-vertical.mp4` is the same in 1080×1920 |
| `brag-output/brag.jpg`, `film-poster.jpg` | Posters: settled lock-up frames, also baked in as frame 0 of each video |
| `brag-output/share-copy.txt` | Post-ready caption |
| `brag-output/brag-plan.md` | The plan and storyboard |

## Storyboard (full film, 120 BPM: every cut on a beat)

| Time | Scene | Picture | Words |
| --- | --- | --- | --- |
| 0–3 | Hook | The site's night stage. The can is a silhouette; the bear from the label rises behind it in a flash and the camera kicks. | FUEL YOUR / WILD SIDE |
| 3–6 | Reveal | A light sweep; the can turns to its front in front of a giant GRIZZLY / ENERGY. | Halal certified energy drink · Made in Pakistan · 250 ml |
| 6–12 | Build | Product studio. The base, the body, the label printing round it, the lid and the tab land on the beat, each with a callout. | Base · 250 ml can · Label · Lid · Stay-on tab |
| 12–30 | Flavors | Six 3 s chapters in the site's colour field. The can spin-swaps under the colour wave, with a new camera angle each time. | 0X / 06, the name, the taste line; Blackout Berry: LIMITED EDITION |
| 30–36 | Inside | Close on the label: the site's spotlight lights each benefit block in turn. | Natural caffeine (from green coffee beans), Natural electrolytes (from sea salt), B vitamins (B3 · B6 · B12 · Biotin · B5) |
| 36–39 | Zamzam | The site's Zamzam pool at first light: gold rosette, still water, a single drop. | زمزم · Added Zamzam water · Every can is made with added Zamzam water. |
| 39–41 | Halal | The halal badge under a sweep of light. | Halal certified · Made in Pakistan |
| 41–44 | Crack | Over the lid at night: the tab cracks, a mist burst, cold spray, condensation. | Best consumed chilled. |
| 44–50 | Finale | The six cans in the site's diagonal ribbon, lighting up one by one, then the lock-up. | FUEL YOUR WILD SIDE → GRIZZLY ENERGY · 6 flavors · Halal certified · Made in Pakistan · grizzlyenergy.pk |

Every word comes from `src/data/grizzly.json`. Unconfirmed values (caffeine mg, sugar, the certifier, the Zamzam source) stay off screen. The address is the one printed on the label; grizzly.json marks the production domain as still to be confirmed.

## Voiceover: none (recommended)

The only text-to-speech on this machine is the robotic Windows SAPI voices, which would undercut a premium spot. Website and social video plays muted, and the type carries every fact. If a voice is wanted, use a human Urdu/English read. A timed script is in `brag-output/brag-plan.md` (the scene times above are the cue points).

## Pipeline

```
video/
  src/            the 3D plate page (Vite + three.js)
    shots.ts        the storyboard as code: every pose, light, camera and backdrop value is a pure function of time
    timeline.ts     the cue sheet shared by the plate, the type layer and the score
    scene.ts        renderer, site Stage + reflections + moments, type planes, spray, motion blur (sub-frame accumulation)
    site/           the site's Stage, floor reflections, roar and Zamzam pool (copied from src/webgl; film-only bear grade)
    can/            the site's can code (snapshot of claude/site-polish), plus the label-printing uniform
  render.mjs      headless Chromium (GPU) → frame-exact PNGs → ffmpeg; also writes callout anchors per frame
  audio/synth.mjs the score and sound design, synthesized (no samples, no licences); `film` and `brag` cue sheets
  film/           the Remotion project: type, light leaks, the brag edit, audio, final render
  plates.mjs      resumable chunked plate rendering (render.mjs per 5 s chunk, lossless join)
  finals.mjs      the four Remotion renders, each through finalize.mjs
  finalize.mjs    poster as frame 0, -14 LUFS / -1 dBTP, final encode
```

Rebuild everything (each step is resumable; the long ones can run detached):

```bash
cd video && npm install && (cd film && npm install)
node audio/synth.mjs film && node audio/synth.mjs brag   # the two mixes → film/public/
node plates.mjs 16x9 9x16                                 # 3D plates in 5 s chunks → film/public/plate-*.mp4 + anchors
node finals.mjs                                           # 4 Remotion renders + delivery pass → brag-output/
```

Preview: `cd film && npx remotion studio`. Plate stills: `node render.mjs --stills 2,8,20 --w 1920 --h 1080`, then `node sheet.mjs 1920x1080 out/sheet.png`.

The plate renders at about 1.2 frames per second on this machine (Intel UHD via ANGLE), roughly 20 minutes per aspect ratio. Drive C: is full, so all caches and temp files live in `video/.cache/`.
