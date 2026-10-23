import * as THREE from 'three';

/**
 * The night stage behind the cans: black sky, a cold moon glow, three layers of ridge-line
 * mountains in blue fog, a wet black floor and low drifting mist. One idea ("cold power from the
 * wild") rendered as a single backdrop that reacts to the camera and scroll.
 *
 * Cost control: the heavy part (noise ridges and fog) is drawn into a half-resolution render
 * target; the visible quad only upsamples it and adds fine stars and dither. The foreground mist
 * is a second, cheaper quad drawn over the cans' feet.
 */
const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const NOISE = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < OCTAVES; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec2(17.1, 9.2);
      a *= 0.5;
    }
    return v;
  }
  float ridged(vec2 p) {
    float v = 0.0;
    float a = 0.55;
    for (int i = 0; i < RIDGE_OCTAVES; i++) {
      float n = vnoise(p);
      v += a * (1.0 - abs(2.0 * n - 1.0));
      p = p * 2.1 + vec2(3.7, 1.3);
      a *= 0.48;
    }
    return v;
  }
`;

const BACKDROP_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uAspect;
  uniform float uHorizon;
  uniform vec2 uCam;          // camera x / y in world units (parallax)
  uniform float uScroll;      // 0..9 section position
  uniform vec3 uAccent;
  uniform vec3 uAccentPrev;
  uniform float uWipe;        // 0..1 colour wave radius
  uniform vec2 uWipeOrigin;   // uv of the wave centre
  uniform float uMoon;        // moon glow strength
  uniform float uStudio;      // 0 night stage, 1 neutral grey product studio (hero, finale)
  uniform float uField;       // 0 night stage, 1 full-bleed flavor colour field (flavor chapters)
  uniform float uMoonPhase;   // real phase today: 0 new, 0.5 full
  uniform vec2 uTwilight;     // x dawn, y dusk (visitor's local time), 0..1
  uniform float uMountains;   // 0 hides the ridges (close-up chapters), 1 full
  uniform float uMist;
  uniform float uFlash;       // roar flash
  uniform float uGlow;        // accent glow pool under the focused can
  uniform vec2 uGlowPos;
  ${NOISE}

  // Fraction of the sky (stars) left visible at this pixel: clouds and ridges cover the stars,
  // which are added later at full resolution in the display pass (read back from alpha).
  float gSkyVis = 1.0;

  vec2 moonPosition() {
    return vec2(0.70 + uCam.x * 0.004, 0.72 - uCam.y * 0.004);
  }

  // One mountain layer: a broad, solid massif in atmospheric perspective. Far layers are paler,
  // bluer and softer-edged; near layers darker and crisper. No outline glow, no strata: the range
  // is atmosphere behind the can, not a pattern. 'near' (0..1) sets crispness and fine detail.
  vec3 ridgeLayer(vec3 base, vec2 uv, float level, float freq, float amp, float seed, float par, float fog, vec3 tint, float near) {
    float x = uv.x * uAspect + uCam.x * par * 0.05 + uScroll * par * 0.03;
    float shape = fbm(vec2(x * freq, seed));
    // a little ridged detail on the nearest layer only, so crests read as rock, not as a wave
    // (skipped entirely for the far layer: compilers do not reliably fold x * 0.0 away)
    float detail = near > 0.0 ? (ridged(vec2(x * freq * 3.2, seed + 5.0)) - 0.55) * 0.1 * near : 0.0;
    // vertical parallax is clamped: a high camera (FAQ, footer) must not lift the range into the sky
    float h = uHorizon + level + amp * (shape - 0.35 + detail) - clamp(uCam.y, -3.0, 3.0) * par * 0.006;
    float soft = mix(5.0, 1.2, near) / 540.0;
    float mask = smoothstep(h + soft, h - soft, uv.y);
    float depth = clamp((h - uv.y) / (amp + 0.001), 0.0, 1.0);
    vec3 rock = mix(tint * 1.7, tint * 0.55, depth);
    rock = mix(rock, vec3(0.011, 0.02, 0.036), fog * (1.0 - depth) * 0.55);
    vec3 col = mix(base, rock, mask);
    // the faintest cold light grazing the far crests (backlit by the horizon glow)
    col += vec3(0.04, 0.06, 0.1) * exp(-abs(uv.y - h) * 140.0) * (1.0 - near) * 0.3 * mask;
    gSkyVis *= 1.0 - mask;
    return col;
  }

  // Aurora: slow vertical curtains high in the sky. The curtain line is a slowly domain-warped
  // noise along x; folds (where the sheet turns edge-on) are brighter; fine vertical rays run
  // through it. Cold green-cyan core, faint violet upper fringe, a little of the flavor accent.
  // 's' is the height above the horizon (0 horizon .. 1 top edge).
  vec3 auroraCurtain(float X, float s, float t, float seed, float base, float height) {
    // domain warp along x and time: the folds drift and undulate over tens of seconds
    float w = vnoise(vec2(X * 0.9 + t * 0.011, t * 0.013 + seed));
    float wx = X + 0.9 * w + 0.12 * sin(X * 2.2 + t * 0.04 + seed);
    // folds: where the sheet turns edge-on it reads brighter
    float fold = 1.0 - abs(2.0 * vnoise(vec2(wx * 2.6 - t * 0.02, seed + 4.0)) - 1.0);
    fold *= fold;
    // the curtain comes and goes along the sky
    float patchy = smoothstep(0.2, 0.7, vnoise(vec2(X * 0.8 + t * 0.012, seed + 11.0)));
    // the lower edge sweeps up and down across the sky with the sheet
    float edge = base + 0.24 * (vnoise(vec2(wx * 1.3 - t * 0.016, seed + 7.0)) - 0.5);
    float h = s - edge;
    float prof = smoothstep(-0.05, 0.03, h) * exp(-max(h, 0.0) / height);
    // rays: fine vertical striation, almost constant along y, bending with the sheet
    float ray = vnoise(vec2(wx * 48.0, s * 2.4 - t * 0.03 + seed));
    #if OCTAVES > 3
    ray = 0.55 * ray + 0.45 * vnoise(vec2(wx * 115.0, s * 3.0 + t * 0.04));
    float rays = 0.4 + 1.2 * ray * ray;
    #else
    // a single, coarser ray octave on lower tiers: keep its contrast low so it never reads as bars
    float rays = 0.6 + 0.7 * ray * ray;
    #endif
    vec3 core = mix(vec3(0.05, 0.75, 0.6), uAccent, 0.18);
    vec3 fringe = mix(vec3(0.34, 0.18, 0.9), uAccent, 0.15);
    vec3 c = mix(core, fringe, smoothstep(0.02, height * 1.8, h));
    return c * prof * (0.08 + 0.92 * fold * fold) * patchy * rays;
  }

  vec3 aurora(vec2 uv, float asp, float t) {
    float s = (uv.y - uHorizon) / (1.0 - uHorizon + 0.001);
    // fade toward the horizon and the top edge; dimmed with the night (close-ups dim the moon)
    float vis = smoothstep(0.3, 0.6, s) * smoothstep(1.05, 0.72, s) * uMoon * uMoon;
    if (vis < 0.002) return vec3(0.0);
    float X = uv.x * asp + uCam.x * 0.012 + uScroll * 0.02;
    vec3 a = auroraCurtain(X, s, t, 0.0, 0.52, 0.2);
    #if OCTAVES > 3
    // a second, fainter sheet further away
    a += 0.5 * auroraCurtain(X * 1.3 + 3.7, s, t * 0.8, 21.0, 0.44, 0.13);
    #endif
    return a * vis * 0.085;
  }

  // Thin stratus drifting above the range: dark bodies, edges facing the moon catch its light.
  float cloudDensity(vec2 uv, float asp, float t) {
    vec2 p = vec2(uv.x * asp * 2.2 + t * 0.012 + uCam.x * 0.02 + uScroll * 0.06, (uv.y - uHorizon) * 11.0 - t * 0.003);
    return fbm(p + vec2(0.0, 0.35 * vnoise(p * vec2(0.6, 0.25) + 5.0)));
  }

  // Sky, moon and the three ridge layers: shared by the scene and its reflection in the wet floor.
  // 'refl' = 1 for the wet-floor reflection: skips detail the ripples would destroy anyway.
  vec3 skyAndMountains(vec2 uv, float asp, float t, float refl) {
    gSkyVis = 1.0;
    float span = 1.0 - uHorizon + 0.001;
    float sky = smoothstep(0.0, 1.0, (uv.y - uHorizon) / span);
    vec3 col = mix(vec3(0.0042, 0.0095, 0.019), vec3(0.0004, 0.0007, 0.0016), pow(sky, 0.5));
    vec2 moonPos = moonPosition();
    vec2 dm = (uv - moonPos) * vec2(asp, 1.0);
    float md = length(dm);
    vec3 moonCol = mix(vec3(0.42, 0.58, 0.9), uAccent, 0.25);
    // the glow follows how much of the moon is lit tonight
    float illum = 0.5 - 0.5 * cos(uMoonPhase * 6.2831853);
    float moonLight = uMoon * (0.35 + 0.65 * illum);

    col += aurora(uv, asp, t);

    #if OCTAVES > 3
    // moonbeam haze: a few broad, slowly turning shafts falling away from the moon
    {
      vec2 dir = dm / (md + 1e-4);
      float beams = vnoise(dir * 2.6 + vec2(t * 0.015, -t * 0.011));
      beams = beams * beams * smoothstep(0.3, -0.6, dir.y);
      col += moonCol * 0.012 * beams * exp(-md * 1.5) * smoothstep(0.03, 0.2, md) * moonLight;
    }
    #endif

    col += moonCol * (0.016 * exp(-md * 3.2) + 0.22 * exp(-md * 38.0)) * moonLight;
    // the moon itself, at today's real phase: a small sphere lit from the sun's side, faint earthshine
    {
      vec2 q = dm / 0.014;
      float q2 = dot(q, q);
      if (q2 < 1.2 && refl < 0.5) {
        float z = sqrt(max(0.0, 1.0 - q2));
        float a = uMoonPhase * 6.2831853;
        vec3 sunDir = vec3(sin(a), 0.0, -cos(a));
        float lit = smoothstep(-0.06, 0.08, dot(vec3(q, z), sunDir));
        float disc = smoothstep(1.0, 0.86, sqrt(q2));
        float maria = 0.85 + 0.15 * fbm(q * 2.5 + 3.0);
        col += (vec3(0.78, 0.84, 0.95) * lit * maria * 0.55 + vec3(0.02, 0.026, 0.04)) * disc * uMoon;
      }
    }

    // drifting stratus: a band above the range, never a lid over the whole sky
    {
      float s = (uv.y - uHorizon) / span;
      float bandMask = smoothstep(0.2, 0.34, s) * smoothstep(0.78, 0.5, s);
      if (bandMask > 0.0) {
        float d = cloudDensity(uv, asp, t);
        float cover = smoothstep(0.46, 0.7, d) * bandMask;
        // the edge facing the moon: density falls off toward it
        vec2 toMoon = -dm / (md + 1e-4);
        float d2 = cloudDensity(uv + vec2(toMoon.x / asp, toMoon.y) * 0.02, asp, t);
        float rim = clamp((d - d2) * 6.0, 0.0, 1.0) * cover;
        vec3 body = vec3(0.0025, 0.0045, 0.009) + moonCol * 0.01 * exp(-md * 2.5) * moonLight;
        col = mix(col, body, cover * 0.85);
        col += moonCol * rim * (0.03 + 0.14 * exp(-md * 2.6)) * moonLight;
        gSkyVis *= 1.0 - cover * 0.85;
      }
    }

    // twilight at the edges of the night: a faint cold-warm dawn or a violet dusk along the horizon
    float twBand = exp(-abs(uv.y - uHorizon - 0.05) * 7.0);
    col += (vec3(0.05, 0.03, 0.022) * uTwilight.x + vec3(0.03, 0.016, 0.045) * uTwilight.y) * twBand;
    // one broad, cold horizon light: the range stands as silhouettes against it
    col += vec3(0.016, 0.03, 0.055) * exp(-abs(uv.y - uHorizon - 0.06) * 6.0);
    col += uAccent * 0.006 * exp(-abs(uv.y - uHorizon - 0.04) * 10.0);

    float m = uMountains;
    float X = uv.x * asp;
    float fogAmt = 0.4 + 0.6 * m;
    col = ridgeLayer(col, uv, 0.05 * m, 0.95, 0.36 * m, 3.1, 0.5, 0.8, vec3(0.02, 0.036, 0.066), 0.0);
    // fog bank lying in the valleys between the far and mid ridges, drifting slowly to the left
    if (uv.y < uHorizon + 0.14) {
      float f = fbm(vec2(X * 2.4 + uCam.x * 0.035 - t * 0.011, (uv.y - uHorizon) * 9.0 + t * 0.004));
      float top = uHorizon + 0.06 * m + 0.08 * (f - 0.5);
      float bank = smoothstep(top + 0.03, top - 0.035, uv.y) * smoothstep(uHorizon - 0.08, uHorizon, uv.y);
      col = mix(col, vec3(0.028, 0.05, 0.086), bank * smoothstep(0.25, 0.75, f) * 0.75 * fogAmt);
    }
    col = ridgeLayer(col, uv, 0.015 * m, 1.6, 0.2 * m, 7.9, 1.0, 0.5, vec3(0.009, 0.017, 0.032), 0.5);
    // a thinner, quicker bank between the mid and near ridges
    if (uv.y < uHorizon + 0.06) {
      float f = fbm(vec2(X * 3.6 + uCam.x * 0.07 - t * 0.019, (uv.y - uHorizon) * 14.0 - t * 0.006 + 6.0));
      float top = uHorizon + 0.012 * m + 0.05 * (f - 0.5);
      float bank = smoothstep(top + 0.02, top - 0.03, uv.y) * smoothstep(uHorizon - 0.06, uHorizon - 0.01, uv.y);
      col = mix(col, vec3(0.018, 0.033, 0.06), bank * smoothstep(0.25, 0.75, f) * 0.7 * fogAmt);
    }
    col = ridgeLayer(col, uv, -0.02 * m, 2.4, 0.09 * m, 12.4, 1.8, 0.25, vec3(0.003, 0.006, 0.012), 1.0);
    return col;
  }

  void main() {
    vec2 uv = vUv;
    float asp = uAspect;
    float t = uTime;
    float below = uHorizon - uv.y;
    vec3 col = vec3(0.0);
    float skyVis = 1.0;
    // the floor below the blend line replaces the scene entirely, so only evaluate it above
    if (below < 0.012) {
      col = skyAndMountains(uv, asp, t, 0.0);
      skyVis = gSkyVis;
    }
    vec3 moonCol = mix(vec3(0.42, 0.58, 0.9), uAccent, 0.25);
    vec2 moonPos = moonPosition();
    float md = length((uv - moonPos) * vec2(asp, 1.0));

    // floor: wet black stone that mirrors the night, crisp near the horizon, broken up further in
    if (below > 0.0) {
      float k = clamp(below / uHorizon, 0.0, 1.0);
      // perspective-compressed coordinate: ripples crowd together toward the horizon
      float zk = pow(k, 0.6);
      vec3 floorCol = mix(vec3(0.0042, 0.0085, 0.017), vec3(0.0004, 0.0006, 0.0012), pow(k, 0.45));
      float sheen = fbm(vec2(uv.x * asp * 5.0 + t * 0.01, k * 24.0));
      floorCol += vec3(0.004, 0.008, 0.015) * smoothstep(0.45, 0.95, sheen) * (1.0 - k);
      // slow ripples: long horizontal swells that displace the reflection, stronger with distance
      float r1 = vnoise(vec2(uv.x * asp * 5.0 + t * 0.03, zk * 60.0 - t * 0.32));
      float r2 = vnoise(vec2(uv.x * asp * 11.0 - t * 0.02, zk * 130.0 - t * 0.5));
      float rip = r1 * 0.65 + r2 * 0.35 - 0.5;
      float rx = rip * 0.012 * (0.15 + k);
      float ry = rip * 0.03 * k;
      vec2 ruv = vec2(uv.x + rx, uHorizon + below * 0.9 + ry);
      floorCol += skyAndMountains(ruv, asp, t, 1.0) * 0.5 * pow(1.0 - k, 1.5);
      // the moon on the water: an elongated vertical streak broken into glints by the ripples
      float illum = 0.5 - 0.5 * cos(uMoonPhase * 6.2831853);
      float dx = (uv.x - moonPos.x + rx * 3.0) * asp;
      float wdt = 0.008 + 0.06 * k;
      float glint = smoothstep(0.42, 0.8, vnoise(vec2(uv.x * asp * 34.0 + t * 0.04, zk * 150.0 - t * 0.55)));
      float streak = exp(-abs(dx) / wdt) * (0.2 + 1.3 * glint) + 0.25 * exp(-abs(dx) / (wdt * 4.0));
      floorCol += moonCol * streak * 0.05 * pow(1.0 - k, 1.3) * uMoon * (0.35 + 0.65 * illum);
      col = mix(col, floorCol, smoothstep(0.0, 0.012, below));
    }

    // low mist rolling across the horizon
    if (abs(uv.y - uHorizon + 0.02) < 0.32) {
      float mist = fbm(vec2(uv.x * asp * 1.7 + t * 0.02, uv.y * 6.0 - t * 0.004));
      float mistMask = smoothstep(0.32, 0.0, abs(uv.y - uHorizon + 0.02)) * (0.35 + 0.9 * mist);
      col += vec3(0.010, 0.018, 0.03) * mistMask * uMist;
    }

    // flavor colour wave: the new accent floods outward from the wave origin
    vec2 wv = (uv - uWipeOrigin) * vec2(asp, 1.0);
    float wd = length(wv);
    float radius = uWipe * 2.4;
    float inside = smoothstep(radius, radius - 0.35, wd);
    vec3 accent = mix(uAccentPrev, uAccent, inside);
    float waveEdge = (wd - radius) * 3.2; // squared by hand: pow() of a negative base is undefined (NaN on some GPUs)
    float front = exp(-waveEdge * waveEdge) * (1.0 - uWipe) * step(0.001, uWipe);
    col += uAccent * front * 0.2;

    // accent glow pool (under / behind the focused can)
    float gd = length((uv - uGlowPos) * vec2(asp, 1.0));
    col += accent * (0.035 * exp(-gd * 2.6) + 0.1 * exp(-gd * 8.0)) * uGlow;
    col += accent * 0.003 * (1.0 - smoothstep(0.0, 1.0, (uv.y - uHorizon) / (1.0 - uHorizon + 0.001)));

    // Grey product studio, as in the reference: black through the upper half, one soft grey floor
    // band lit from the left (brightest at the left edge, about a quarter up the frame), falling to
    // dark again at the bottom and toward the right. Neutral grey, never blue.
    if (uStudio > 0.001) {
      float bandY = 0.27 - 0.07 * uv.x;
      float bandD = (uv.y - bandY) / (uv.y > bandY ? 0.2 : 0.18);
      float band = exp(-bandD * bandD) * mix(1.0, 0.45, smoothstep(0.0, 1.0, uv.x));
      vec3 sCol = vec3(1.0, 0.996, 0.988) * (0.17 * band + 0.006 * smoothstep(0.7, 0.2, uv.y));
      vec2 sq = (uv - uGlowPos) * vec2(asp, 1.0);
      // A product-shot light rig: a soft overhead spot falling on the focused can (a pale cone that widens toward
      // the floor and pools there), a flavor-tinted halo right behind it, and a cool haze across the top so the
      // upper half is a deep studio, not a flat black.
      float coneW = 0.1 + 0.32 * clamp(1.0 - uv.y, 0.0, 1.0);
      float cone = exp(-pow((uv.x - uGlowPos.x) * asp / coneW, 2.0)) * smoothstep(-0.05, 0.75, uv.y) * smoothstep(1.15, 0.55, uv.y);
      vec2 pq = (uv - vec2(uGlowPos.x, bandY + 0.02)) * vec2(asp * 0.55, 2.4);
      float pool = exp(-dot(pq, pq) * 3.0);
      sCol += vec3(0.86, 0.9, 1.0) * (0.035 * cone + 0.07 * pool) * uGlow;
      // The flavor colour stays off the wall (a broad halo here tinted the whole upper frame): only a tight breath right
      // behind the can, and a coloured pool at the foot of the frame under the title, as in the reference.
      sCol += accent * 0.03 * exp(-dot(sq, sq) * 22.0) * uGlow;
      vec2 fg = (uv - vec2(0.5, -0.04)) * vec2(asp * 0.85, 3.4);
      sCol += accent * 0.15 * exp(-dot(fg, fg) * 1.8) * uGlow;
      sCol += vec3(0.012, 0.016, 0.026) * smoothstep(0.35, 1.0, uv.y);
      // a gentle vignette keeps the eye on the centre of the wall
      vec2 vq = (uv - 0.5) * vec2(1.0, 1.25);
      sCol *= 1.0 - 0.35 * smoothstep(0.3, 0.85, length(vq));
      col = mix(col, sCol, uStudio);
      skyVis *= 1.0 - uStudio;
    }
    // Flavor colour field: the flavor chapters leave the night for a saturated studio of the
    // flavor's own colour: deep at the edges, a luminous core behind the can, slow soft haze.
    if (uField > 0.001) {
      vec2 fq = (uv - uGlowPos) * vec2(asp, 1.0);
      float core = exp(-dot(fq, fq) * 1.6);
      float band = 1.0 - smoothstep(0.0, 0.75, abs(uv.y - 0.5) * 1.5);
      vec3 deep = accent * 0.035 + vec3(0.002, 0.002, 0.004);
      vec3 body = accent * 0.3;
      vec3 bright = mix(accent, vec3(1.0), 0.18) * 0.72;
      vec3 field = mix(deep, body, band);
      field = mix(field, bright, core * 0.7);
      // only a breath of slow haze: a clean studio gradient, never blotchy
      float haze = vnoise(vec2(uv.x * asp * 0.9 + t * 0.01, uv.y * 1.3 - t * 0.006));
      field *= 0.96 + 0.08 * haze;
      // as in the reference: the field falls to near-black toward the top of the frame
      field = mix(field, deep, smoothstep(0.42, 0.95, uv.y) * 0.92);
      // (the darker mountain-ridge band that ran across the field is gone: the reference field is one smooth gradient)
      col = mix(col, field, uField);
      skyVis *= 1.0 - uField;
    }
    col += vec3(0.8, 0.9, 1.0) * uFlash * (0.25 + 0.5 * exp(-md * 2.0));
    // alpha carries how much open sky is left for the display pass's stars
    gl_FragColor = vec4(col, skyVis);
  }
`;

const DISPLAY_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tBackdrop;
  uniform float uTime;
  uniform float uAspect;
  uniform float uHorizon;
  uniform float uStars;
  ${NOISE}
  void main() {
    vec4 back = texture2D(tBackdrop, vUv);
    vec3 col = back.rgb;
    // fine stars: sparse, only well above the horizon, slow twinkle
    vec2 cell = floor(vec2(vUv.x * uAspect, vUv.y) * 90.0);
    float h = hash21(cell);
    vec2 local = fract(vec2(vUv.x * uAspect, vUv.y) * 90.0) - 0.5;
    float star = step(0.9965, h) * smoothstep(0.22, 0.0, length(local));
    star *= 0.55 + 0.45 * sin(uTime * (0.4 + h * 2.0) + h * 40.0);
    col += vec3(0.7, 0.8, 1.0) * star * smoothstep(uHorizon + 0.12, uHorizon + 0.5, vUv.y) * uStars * 0.9 * back.a;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const MIST_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uAspect;
  uniform float uHorizon;
  uniform float uAmount;
  uniform float uBurst;       // 0..1 pressurised burst of mist (opening, roar)
  uniform vec2 uBurstPos;
  uniform float uWater;       // 0..1 underwater tint (inside the can)
  uniform vec3 uAccent;
  ${NOISE}
  void main() {
    vec2 p = vec2(vUv.x * uAspect, vUv.y);
    float n1 = fbm(vec2(p.x * 1.4 + uTime * 0.03, p.y * 3.2 - uTime * 0.01));
    float n2 = fbm(vec2(p.x * 2.8 - uTime * 0.045, p.y * 5.0 + 3.0));
    float low = smoothstep(uHorizon + 0.1, -0.1, vUv.y);
    float density = low * (0.25 + 0.9 * n1) * (0.6 + 0.8 * n2);
    // pressurised mist: a billowing cloud that grows out of the opening as the burst strength rises
    float bd = length((vUv - uBurstPos) * vec2(uAspect, 1.0));
    float radius = 0.1 + uBurst * 0.95;
    float billow = smoothstep(0.3, 0.85, n1 * 0.8 + n2 * 0.5);
    float burst = smoothstep(radius, radius * 0.15, bd) * (0.25 + 0.75 * billow) * min(1.0, uBurst * 1.3);
    float a = clamp(density * uAmount + burst * 0.75, 0.0, 0.8);
    vec3 col = mix(vec3(0.012, 0.02, 0.034), vec3(0.04, 0.055, 0.08), n2) + uAccent * 0.006;
    // the burst is lit by the lid: cold light near the opening, falling off into the dark
    float lit = exp(-bd * 2.4);
    col = mix(col, vec3(0.16, 0.21, 0.3) * (0.35 + 0.65 * lit) * (0.7 + 0.5 * n2), clamp(burst * 1.6, 0.0, 1.0));
    // inside the can: deep liquid, lit from above, with slow light shafts
    if (uWater > 0.001) {
      float shaft = pow(fbm(vec2(vUv.x * 5.0 + uTime * 0.04, uTime * 0.025)), 3.0);
      float top = smoothstep(0.1, 1.0, vUv.y);
      // the drink's own colour (amber for peach, deep blue for blue raspberry), not a fixed blue
      vec3 water = mix(uAccent * 0.02 + vec3(0.002, 0.004, 0.006), uAccent * 0.2 + vec3(0.02, 0.03, 0.04), top);
      water += vec3(0.35, 0.55, 0.65) * shaft * top * 0.3;
      col = mix(col, water, uWater);
      a = max(a, uWater * 0.6);
    }
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface StageParams {
  time: number;
  aspect: number;
  /** Screen height (0..1) of the horizon. */
  horizon: number;
  camX: number;
  camY: number;
  scroll: number;
  accent: THREE.Color;
  accentPrev: THREE.Color;
  wipe: number;
  wipeOrigin: THREE.Vector2;
  moon: number;
  mountains: number;
  mist: number;
  mistFg: number;
  burst: number;
  burstPos: THREE.Vector2;
  water: number;
  flash: number;
  glow: number;
  glowPos: THREE.Vector2;
  stars: number;
  /** 0 night stage, 1 full-bleed flavor colour field. */
  field: number;
  /** 0 night stage, 1 neutral grey product studio. */
  studio: number;
  /** Live sky: today's real moon phase (0..1) and local dawn / dusk strength (0..1). */
  moonPhase: number;
  dawn: number;
  dusk: number;
}

export class Stage {
  /** Draw first (background) and last (foreground mist). */
  readonly background: THREE.Mesh;
  readonly foreground: THREE.Mesh;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly rt: THREE.WebGLRenderTarget;
  private readonly rtScene = new THREE.Scene();
  private readonly rtCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly rtMaterial: THREE.ShaderMaterial;
  private readonly displayMaterial: THREE.ShaderMaterial;
  private readonly mistMaterial: THREE.ShaderMaterial;
  private readonly geometry = new THREE.PlaneGeometry(2, 2);
  private readonly rtMesh: THREE.Mesh;
  private resolutionScale: number;
  private frame = 0;
  private lastParams: StageParams | null = null;
  /** Backdrop refresh interval in frames (the mist is slow, so alternate frames are enough). */
  public refreshEvery = 2;
  public enabled = true;

  constructor(renderer: THREE.WebGLRenderer, width: number, height: number, quality: 'HIGH' | 'MEDIUM' | 'LOW') {
    this.renderer = renderer;
    this.resolutionScale = quality === 'HIGH' ? 0.5 : 0.35;
    const octaves = quality === 'HIGH' ? 5 : 3;
    const ridgeOctaves = quality === 'HIGH' ? 4 : 3;
    const defines = { OCTAVES: octaves, RIDGE_OCTAVES: ridgeOctaves };

    this.rt = new THREE.WebGLRenderTarget(Math.round(width * this.resolutionScale), Math.round(height * this.resolutionScale), {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    });
    this.rt.texture.minFilter = THREE.LinearFilter;
    this.rt.texture.magFilter = THREE.LinearFilter;

    this.rtMaterial = new THREE.ShaderMaterial({
      defines,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: BACKDROP_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: width / height },
        uHorizon: { value: 0.42 },
        uCam: { value: new THREE.Vector2() },
        uScroll: { value: 0 },
        uAccent: { value: new THREE.Color() },
        uAccentPrev: { value: new THREE.Color() },
        uWipe: { value: 0 },
        uWipeOrigin: { value: new THREE.Vector2(0.5, 0.5) },
        uMoon: { value: 1 },
        uMoonPhase: { value: 0.5 },
        uTwilight: { value: new THREE.Vector2() },
        uMountains: { value: 1 },
        uMist: { value: 1 },
        uFlash: { value: 0 },
        uField: { value: 0 },
        uStudio: { value: 0 },
        uGlow: { value: 1 },
        uGlowPos: { value: new THREE.Vector2(0.5, 0.4) },
      },
    });
    this.rtMesh = new THREE.Mesh(this.geometry, this.rtMaterial);
    this.rtMesh.frustumCulled = false;
    this.rtScene.add(this.rtMesh);

    this.displayMaterial = new THREE.ShaderMaterial({
      defines,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: DISPLAY_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tBackdrop: { value: this.rt.texture },
        uTime: { value: 0 },
        uAspect: { value: width / height },
        uHorizon: { value: 0.42 },
        uStars: { value: 1 },
      },
    });
    this.background = new THREE.Mesh(this.geometry, this.displayMaterial);
    this.background.frustumCulled = false;
    this.background.renderOrder = -1000;

    this.mistMaterial = new THREE.ShaderMaterial({
      defines,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: MIST_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: width / height },
        uHorizon: { value: 0.42 },
        uAmount: { value: 0.6 },
        uBurst: { value: 0 },
        uBurstPos: { value: new THREE.Vector2(0.5, 0.5) },
        uWater: { value: 0 },
        uAccent: { value: new THREE.Color() },
      },
    });
    this.foreground = new THREE.Mesh(this.geometry, this.mistMaterial);
    this.foreground.frustumCulled = false;
    this.foreground.renderOrder = 1000;
  }

  /**
   * Follows the scene's quality tier at run time (the frame-rate governor can step a slow GPU down):
   * fewer noise octaves and a smaller backdrop target on MEDIUM / LOW.
   */
  setQuality(quality: 'HIGH' | 'MEDIUM' | 'LOW', width: number, height: number) {
    this.resolutionScale = quality === 'HIGH' ? 0.5 : 0.35;
    const octaves = quality === 'HIGH' ? 5 : 3;
    const ridgeOctaves = quality === 'HIGH' ? 4 : 3;
    // the three stage materials share one defines object: change it once, recompile all three
    const defines = this.rtMaterial.defines as { OCTAVES: number; RIDGE_OCTAVES: number };
    if (defines.OCTAVES !== octaves || defines.RIDGE_OCTAVES !== ridgeOctaves) {
      defines.OCTAVES = octaves;
      defines.RIDGE_OCTAVES = ridgeOctaves;
      [this.rtMaterial, this.displayMaterial, this.mistMaterial].forEach((material) => {
        material.needsUpdate = true;
      });
    }
    this.resize(width, height);
  }

  resize(width: number, height: number) {
    this.rt.setSize(Math.max(2, Math.round(width * this.resolutionScale)), Math.max(2, Math.round(height * this.resolutionScale)));
    const aspect = width / height;
    this.rtMaterial.uniforms.uAspect.value = aspect;
    this.displayMaterial.uniforms.uAspect.value = aspect;
    this.mistMaterial.uniforms.uAspect.value = aspect;
    this.frame = 0; // redraw immediately
  }

  update(p: StageParams) {
    this.lastParams = p;
    const u = this.rtMaterial.uniforms;
    u.uTime.value = p.time;
    u.uHorizon.value = p.horizon;
    u.uCam.value.set(p.camX, p.camY);
    u.uScroll.value = p.scroll;
    u.uAccent.value.copy(p.accent);
    u.uAccentPrev.value.copy(p.accentPrev);
    u.uWipe.value = p.wipe;
    u.uWipeOrigin.value.copy(p.wipeOrigin);
    u.uMoon.value = p.moon;
    u.uField.value = p.field;
    u.uStudio.value = p.studio;
    u.uMoonPhase.value = p.moonPhase;
    u.uTwilight.value.set(p.dawn, p.dusk);
    u.uMountains.value = p.mountains;
    u.uMist.value = p.mist;
    u.uFlash.value = p.flash;
    u.uGlow.value = p.glow;
    u.uGlowPos.value.copy(p.glowPos);

    const d = this.displayMaterial.uniforms;
    d.uTime.value = p.time;
    d.uHorizon.value = p.horizon;
    d.uStars.value = p.stars;

    const m = this.mistMaterial.uniforms;
    m.uTime.value = p.time;
    m.uHorizon.value = p.horizon;
    m.uAmount.value = p.mistFg;
    m.uBurst.value = p.burst;
    m.uBurstPos.value.copy(p.burstPos);
    m.uWater.value = p.water;
    m.uAccent.value.copy(p.accent);
    this.foreground.visible = p.mistFg > 0.01 || p.burst > 0.01 || p.water > 0.01;
  }

  /** Renders the half-resolution backdrop (call before the main render each frame). */
  renderBackdrop() {
    if (!this.enabled || !this.lastParams) return;
    this.frame += 1;
    const busy = this.lastParams.wipe > 0.001 && this.lastParams.wipe < 0.999;
    if (!busy && this.frame % this.refreshEvery !== 0 && this.frame > 2) return;
    const previous = this.renderer.getRenderTarget();
    const autoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.rtScene, this.rtCamera);
    this.renderer.setRenderTarget(previous);
    this.renderer.autoClear = autoClear;
  }

  dispose() {
    this.rt.dispose();
    this.geometry.dispose();
    this.rtMaterial.dispose();
    this.displayMaterial.dispose();
    this.mistMaterial.dispose();
  }
}
