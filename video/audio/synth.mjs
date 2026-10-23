/**
 * Score and sound design, synthesized from scratch (no samples, no licences), written as one piece: the effects sit
 * in the music's key (D minor) and in the same reverb space, softly under the music.
 *   node audio/synth.mjs film  -> film/public/grizzly-film-mix.wav (50 s, the full film)
 *   node audio/synth.mjs brag  -> film/public/grizzly-brag-mix.wav (20 s, the brag cut)
 * 120 BPM (one beat = 0.5 s); the cues follow video/src/timeline.ts and the brag edit in film/src/Brag.tsx.
 * Deterministic: a seeded PRNG, so every run writes the same file.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SR = 48000;
const CUT = process.argv[2] === 'brag' ? 'brag' : 'film';
const DUR = CUT === 'brag' ? 20.6 : 50.6;
/** Where the groove (and the chord cycle) starts: the first flavor. */
const GS = CUT === 'brag' ? 5 : 12;
const N = Math.round(SR * DUR);
const BEAT = 0.5;

// ───────────────────────── primitives ─────────────────────────
let seed = 1234567;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const noise = () => rand() * 2 - 1;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const db = (d) => Math.pow(10, d / 20);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (k) => k * k * (3 - 2 * k);

function bus() {
  return [new Float32Array(N), new Float32Array(N)];
}
const add = (b, i, l, r) => {
  if (i < 0 || i >= N) return;
  b[0][i] += l;
  b[1][i] += r;
};
const pan = (p) => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];

/** RBJ biquad with per-call coefficient updates. */
class Biquad {
  constructor() { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set('lp', 1000, 0.707); }
  set(type, f, q) {
    const w = 2 * Math.PI * clamp(f, 10, SR * 0.45) / SR;
    const cw = Math.cos(w), sw = Math.sin(w), a = sw / (2 * q);
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
    else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
    else { b0 = a; b1 = 0; b2 = -a; } // band-pass (0 dB peak)
    const a0 = 1 + a;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * cw) / a0; this.a2 = (1 - a) / a0;
    return this;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Band-limited saw (polyBLEP). */
function saw(phase, dt) {
  let v = 2 * phase - 1;
  if (phase < dt) { const t = phase / dt; v -= t + t - t * t - 1; }
  else if (phase > 1 - dt) { const t = (phase - 1) / dt; v -= t * t + t + t + 1; }
  return v;
}

/** Freeverb-style stereo reverb. */
function reverb(input, { room = 0.86, damp = 0.35, width = 1 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((n) => Math.round(n * SR / 44100));
  const alls = [556, 441, 341, 225].map((n) => Math.round(n * SR / 44100));
  const out = bus();
  for (let ch = 0; ch < 2; ch += 1) {
    const spread = ch ? Math.round(23 * SR / 44100) : 0;
    const cb = combs.map((n) => ({ buf: new Float32Array(n + spread), i: 0, store: 0 }));
    const ab = alls.map((n) => ({ buf: new Float32Array(n + spread), i: 0 }));
    const x = input[ch];
    const o = out[ch];
    for (let s = 0; s < N; s += 1) {
      const inp = x[s] * 0.015;
      let acc = 0;
      for (const c of cb) {
        const y = c.buf[c.i];
        c.store = y * (1 - damp) + c.store * damp;
        c.buf[c.i] = inp + c.store * room;
        c.i = (c.i + 1) % c.buf.length;
        acc += y;
      }
      for (const a of ab) {
        const b = a.buf[a.i];
        const y = -acc + b;
        a.buf[a.i] = acc + b * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        acc = y;
      }
      o[s] = acc;
    }
  }
  if (width < 1) for (let s = 0; s < N; s += 1) { const m = (out[0][s] + out[1][s]) / 2; out[0][s] = m + (out[0][s] - m) * width; out[1][s] = m + (out[1][s] - m) * width; }
  return out;
}

const mixInto = (dst, src, g = 1) => { for (let c = 0; c < 2; c += 1) for (let s = 0; s < N; s += 1) dst[c][s] += src[c][s] * g; };

// ───────────────────────── arrangement ─────────────────────────
// chords (MIDI) per 4 s, from the first flavor on; before that the drone holds D.
const D2 = 38;
const CHORDS = [
  { root: 38, notes: [50, 53, 57, 62] }, // Dm
  { root: 34, notes: [50, 53, 58, 62] }, // B♭
  { root: 41, notes: [48, 53, 57, 60] }, // F
  { root: 36, notes: [48, 52, 55, 60] }, // C
];
const chordAt = (t) => CHORDS[Math.floor(Math.max(0, t - GS) / 2) % 4];

const music = bus(); // sidechained
const drums = bus();
const sfx = bus();
const send = bus(); // to reverb

// sidechain envelope from the kick pattern
const duck = new Float32Array(N).fill(1);

// ── kick ──
function kick(t0, gain = 1) {
  const i0 = Math.round(t0 * SR);
  let ph = 0;
  for (let k = 0; k < SR * 0.6; k += 1) {
    const t = k / SR;
    const f = 44 + 110 * Math.exp(-t * 32);
    ph += f / SR;
    const amp = Math.exp(-t * 7.5) * gain;
    const click = k < 120 ? noise() * (1 - k / 120) * 0.35 : 0;
    const v = Math.tanh(Math.sin(2 * Math.PI * ph) * 1.6) * amp * 0.9 + click * gain;
    add(drums, i0 + k, v, v);
  }
  for (let k = 0; k < SR * 0.42; k += 1) {
    const i = i0 + k;
    if (i < N) duck[i] = Math.min(duck[i], 1 - 0.6 * Math.exp(-k / SR * 9) * gain);
  }
}

// ── clap ──
function clap(t0, gain = 1) {
  const i0 = Math.round(t0 * SR);
  const bp = new Biquad().set('bp', 1350, 1.1);
  for (let k = 0; k < SR * 0.35; k += 1) {
    const t = k / SR;
    const bursts = [0, 0.011, 0.023].reduce((a, o) => a + (t >= o ? Math.exp(-(t - o) * (t - o < 0.012 ? 220 : 16)) : 0), 0);
    const v = bp.run(noise()) * bursts * gain * 0.55;
    const [l, r] = pan(0.05);
    add(drums, i0 + k, v * l, v * r);
    add(send, i0 + k, v * 0.9, v * 0.9);
  }
}

// ── hat ──
function hat(t0, gain = 1, p = 0.25) {
  const i0 = Math.round(t0 * SR);
  const hp = new Biquad().set('hp', 7800, 0.7);
  const [l, r] = pan(p);
  for (let k = 0; k < SR * 0.06; k += 1) {
    const v = hp.run(noise()) * Math.exp(-k / SR * 75) * gain * 0.16;
    add(drums, i0 + k, v * l, v * r);
  }
}

// ── pads: a voice per chord tone, three detuned saws each, low-passed and slowly breathing ──
function pads(fromT, toT, level, cutoffFn) {
  const filters = [new Biquad(), new Biquad()];
  const phases = Array.from({ length: 2 }, () => new Float64Array(12).map(() => rand()));
  for (let i = Math.round(fromT * SR); i < Math.min(N, Math.round(toT * SR)); i += 1) {
    const t = i / SR;
    if (i % 32 === 0) {
      const fc = cutoffFn(t);
      filters[0].set('lp', fc, 0.6);
      filters[1].set('lp', fc * 1.03, 0.6);
    }
    // crossfade between chords over 0.6 s around each change
    const local = (Math.max(0, t - GS)) % 2;
    const cur = chordAt(t);
    const prev = chordAt(t - 2 < GS && t >= GS ? GS - 1 : t - 0.6);
    const xf = t < GS ? 1 : smooth(clamp(local / 0.6, 0, 1));
    const fade = smooth(clamp((t - fromT) / 2.5, 0, 1)) * smooth(clamp((toT - t) / 2.5, 0, 1));
    for (let ch = 0; ch < 2; ch += 1) {
      let v = 0;
      cur.notes.forEach((n, vi) => {
        const pn = prev.notes[vi];
        const note = t < GS ? [50, 53, 57, 62][vi] : pn + (n - pn) * xf;
        for (let d = 0; d < 3; d += 1) {
          const det = (d - 1) * 0.11 + (ch ? 0.04 : -0.04);
          const f = midi(note + det);
          const idx = vi * 3 + d;
          phases[ch][idx] = (phases[ch][idx] + f / SR) % 1;
          v += saw(phases[ch][idx], f / SR);
        }
      });
      const y = filters[ch].run(v) * level * fade * 0.05;
      music[ch][i] += y;
      send[ch][i] += y * 0.6;
    }
  }
}

// ── sub bass: 8ths on the chord root, sine + a little saw grit ──
function bass(fromT, toT, level) {
  const lp = new Biquad().set('lp', 220, 0.8);
  let ph = 0;
  for (let i = Math.round(fromT * SR); i < Math.min(N, Math.round(toT * SR)); i += 1) {
    const t = i / SR;
    const root = t < GS ? D2 : chordAt(t).root;
    const f = midi(root);
    ph = (ph + f / SR) % 1;
    const step = (t / (BEAT / 2)) % 1; // 8ths
    const env = Math.exp(-step * 2.2) * 0.75 + 0.25;
    const fade = smooth(clamp((t - fromT) / 1.5, 0, 1)) * smooth(clamp((toT - t) / 1.0, 0, 1));
    const v = (Math.sin(2 * Math.PI * ph) + lp.run(saw(ph, f / SR)) * 0.35) * env * level * fade * 0.32;
    music[0][i] += v;
    music[1][i] += v;
  }
}

// ── drone: D1/D2 with slow beating, carries the intro and the crack ──
function drone(fromT, toT, level) {
  let a = 0, b = 0, c = 0;
  for (let i = Math.round(fromT * SR); i < Math.min(N, Math.round(toT * SR)); i += 1) {
    const t = i / SR;
    a += midi(26) / SR; b += midi(38) * 1.0015 / SR; c += midi(45) * 0.999 / SR;
    const fade = smooth(clamp((t - fromT) / 2.5, 0, 1)) * smooth(clamp((toT - t) / 1.5, 0, 1));
    const v = (Math.sin(2 * Math.PI * a) * 0.42 + Math.sin(2 * Math.PI * b) * 0.32 + Math.sin(2 * Math.PI * c) * 0.12) * fade * level * 0.22;
    music[0][i] += v * 0.98;
    music[1][i] += v;
    send[0][i] += v * 0.2; send[1][i] += v * 0.2;
  }
}

// ── pluck arpeggio (16ths through the chord) ──
function plucks(fromT, toT, level, pattern = [0, 2, 1, 3, 2, 1, 3, 0]) {
  const step = BEAT / 2;
  for (let n = Math.ceil(fromT / step); n * step < toT; n += 1) {
    const t0 = n * step;
    const chord = t0 < GS ? { notes: [50, 53, 57, 62] } : chordAt(t0);
    const note = chord.notes[pattern[n % pattern.length]] + 12;
    const f = midi(note);
    const lp = new Biquad();
    const i0 = Math.round(t0 * SR);
    let ph = rand();
    const p = ((n % 4) - 1.5) * 0.3;
    const [l, r] = pan(p);
    const g = level * (n % 2 ? 0.7 : 1);
    for (let k = 0; k < SR * 0.4; k += 1) {
      const t = k / SR;
      if (k % 32 === 0) lp.set('lp', 500 + 5000 * Math.exp(-t * 18), 0.9);
      ph = (ph + f / SR) % 1;
      const v = lp.run(saw(ph, f / SR)) * Math.exp(-t * 9) * g * 0.07;
      add(music, i0 + k, v * l, v * r);
      add(send, i0 + k, v * 0.8, v * 0.8);
    }
  }
}

// ───────────────────────── sound design ─────────────────────────
function whoosh(tc, dur = 1.0, gain = 1, fromPan = 0.8, toPan = -0.8, fLo = 350, fHi = 3200) {
  const i0 = Math.round((tc - dur / 2) * SR);
  const bp = [new Biquad(), new Biquad()];
  const len = Math.round(dur * SR);
  for (let k = 0; k < len; k += 1) {
    const x = k / len;
    if (k % 32 === 0) {
      const f = fLo * Math.pow(fHi / fLo, Math.sin(Math.PI * x));
      bp[0].set('bp', f, 0.9); bp[1].set('bp', f * 1.08, 0.9);
    }
    const env = Math.pow(Math.sin(Math.PI * x), 2.2) * gain * 0.75;
    const [l, r] = pan(fromPan + (toPan - fromPan) * smooth(x));
    const n0 = noise();
    add(sfx, i0 + k, bp[0].run(n0) * env * l, bp[1].run(n0 * 0.7 + noise() * 0.3) * env * r);
    add(send, i0 + k, bp[0].y1 * env * 0.3, bp[1].y1 * env * 0.3);
  }
}

function riser(tEnd, dur, gain = 1) {
  const i0 = Math.round((tEnd - dur) * SR);
  const hp = new Biquad();
  let ph = 0;
  const len = Math.round(dur * SR);
  for (let k = 0; k < len; k += 1) {
    const x = k / len;
    if (k % 32 === 0) hp.set('bp', 400 + 6000 * x * x, 1.4);
    ph += (110 + 660 * x * x) / SR;
    const env = Math.pow(x, 2.4) * gain;
    const v = hp.run(noise()) * env * 0.45 + Math.sin(2 * Math.PI * ph) * env * 0.05;
    add(sfx, i0 + k, v, v);
    add(send, i0 + k, v * 0.5, v * 0.5);
  }
}

function impact(t0, gain = 1, low = 55) {
  const i0 = Math.round(t0 * SR);
  let ph = 0;
  const lp = new Biquad().set('lp', 900, 0.7);
  for (let k = 0; k < SR * 2.2; k += 1) {
    const t = k / SR;
    ph += (low * (0.55 + 0.45 * Math.exp(-t * 4))) / SR;
    const boom = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 2.1) * 0.8;
    const crack = lp.run(noise()) * Math.exp(-t * 14) * 0.6;
    const v = Math.tanh((boom + crack) * gain * 1.3) * 0.75;
    add(sfx, i0 + k, v, v);
    add(send, i0 + k, crack * gain * 1.2, crack * gain * 1.2);
  }
}

/** Struck metal: inharmonic partials (a cylinder's modes), used for the explode shing and the lock clank. */
function metal(t0, base, gain = 1, decay = 2.2, p = 0) {
  const ratios = [1, 2.76, 5.4, 8.93, 13.34];
  const amps = [1, 0.6, 0.38, 0.22, 0.12];
  const i0 = Math.round(t0 * SR);
  const [l, r] = pan(p);
  for (let k = 0; k < SR * decay * 1.5; k += 1) {
    const t = k / SR;
    let v = 0;
    ratios.forEach((ra, j) => { v += Math.sin(2 * Math.PI * base * ra * t * (1 + 0.0007 * j)) * amps[j] * Math.exp(-t * (1.6 + j * 1.3) / decay * 2); });
    v *= gain * 0.16 * Math.min(1, k / 40);
    add(sfx, i0 + k, v * l, v * r);
    add(send, i0 + k, v * 0.7, v * 0.7);
  }
}

function tick(t0, f = 2600, gain = 1, p = 0.3) {
  const i0 = Math.round(t0 * SR);
  const [l, r] = pan(p);
  for (let k = 0; k < SR * 0.06; k += 1) {
    const t = k / SR;
    const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 90) * gain * 0.12;
    add(sfx, i0 + k, v * l, v * r);
    add(send, i0 + k, v * 0.4, v * 0.4);
  }
}

function ping(t0, note, gain = 1) {
  const i0 = Math.round(t0 * SR);
  const f = midi(note);
  for (let k = 0; k < SR * 1.6; k += 1) {
    const t = k / SR;
    const v = (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.01 * t) * Math.exp(-t * 6)) * Math.exp(-t * 3.2) * gain * 0.08 * Math.min(1, k / 60);
    add(sfx, i0 + k, v, v);
    add(send, i0 + k, v * 1.2, v * 1.2);
  }
}

function shimmer(t0, t1, gain = 1) {
  const bp = [new Biquad(), new Biquad()];
  let ph = 0;
  for (let i = Math.round(t0 * SR); i < Math.round(t1 * SR); i += 1) {
    const x = (i / SR - t0) / (t1 - t0);
    if (i % 32 === 0) { bp[0].set('bp', 2500 + 5000 * x, 6); bp[1].set('bp', 2600 + 5200 * x, 6); }
    ph += midi(74 + 12 * smooth(x)) / SR;
    const env = Math.sin(Math.PI * x) * gain;
    const tone = Math.sin(2 * Math.PI * ph) * 0.025 * env;
    add(sfx, i, bp[0].run(noise()) * env * 0.35 + tone, bp[1].run(noise()) * env * 0.35 + tone);
    add(send, i, tone * 2, tone * 2);
  }
}

/** The crack: lever click, the seal popping (transient + metal ping), a pressurised hiss, then fizz. */
function canCrack(t0) {
  // lever: a tiny dry click just before
  tick(t0 - 0.09, 4200, 0.9, 0.05);
  const i0 = Math.round(t0 * SR);
  // pop: broadband transient + two short metal modes
  const hpPop = new Biquad().set('hp', 1800, 0.7);
  for (let k = 0; k < SR * 0.12; k += 1) {
    const t = k / SR;
    const tr = hpPop.run(noise()) * Math.exp(-t * 900) * 1.5;
    const ring = (Math.sin(2 * Math.PI * 2230 * t) * 0.5 + Math.sin(2 * Math.PI * 4120 * t) * 0.3) * Math.exp(-t * 55);
    const v = (tr + ring) * 0.55;
    add(sfx, i0 + k, v, v);
    add(send, i0 + k, v * 0.35, v * 0.35);
  }
  // hiss: pressurised gas, bright, the filter closing as the pressure drops
  const hp = [new Biquad(), new Biquad()];
  const lp = [new Biquad(), new Biquad()];
  for (let k = 0; k < SR * 1.3; k += 1) {
    const t = k / SR;
    if (k % 32 === 0) {
      const f = 3500 + 7000 * Math.exp(-t * 3);
      lp[0].set('lp', f, 0.7); lp[1].set('lp', f * 1.05, 0.7);
      hp[0].set('hp', 1800, 0.7); hp[1].set('hp', 1900, 0.7);
    }
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 3.4) * 0.5;
    add(sfx, i0 + k, lp[0].run(hp[0].run(noise())) * env, lp[1].run(hp[1].run(noise())) * env);
  }
  // fizz: a Poisson rain of tiny bubbles, thinning out over three seconds
  let t = 0.05;
  while (t < 3.4) {
    const rate = 380 * Math.exp(-t * 1.25) + 12;
    t += -Math.log(1 - rand()) / rate;
    const f = 2600 + rand() * 6500;
    const g = (0.08 + rand() * 0.12) * Math.exp(-t * 0.55);
    const [l, r] = pan(rand() * 1.4 - 0.7);
    const j0 = i0 + Math.round(t * SR);
    for (let k = 0; k < SR * 0.012; k += 1) {
      const tt = k / SR;
      const v = Math.sin(2 * Math.PI * f * tt * (1 + tt * 30)) * Math.exp(-tt * 600) * g;
      add(sfx, j0 + k, v * l, v * r);
    }
  }
}

function thunk(t0, p, gain = 1) {
  const i0 = Math.round(t0 * SR);
  const [l, r] = pan(p);
  for (let k = 0; k < SR * 0.4; k += 1) {
    const t = k / SR;
    const v = (Math.sin(2 * Math.PI * (70 + 60 * Math.exp(-t * 40)) * t) * Math.exp(-t * 14) * 0.5 + (k < 200 ? noise() * (1 - k / 200) * 0.25 : 0)) * gain;
    add(sfx, i0 + k, v * l, v * r);
    add(send, i0 + k, v * 0.4, v * 0.4);
  }
}

/** A single water drop: a falling pitch blip and a soft splash, wet in the reverb. */
function waterDrop(t0, gain = 1) {
  const i0 = Math.round(t0 * SR);
  let ph = 0;
  const hp = new Biquad().set('bp', 2600, 1.2);
  for (let k = 0; k < SR * 0.5; k += 1) {
    const t = k / SR;
    ph += (1500 * Math.exp(-t * 22) + 520) / SR;
    const blip = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 26) * 0.32;
    const splash = hp.run(noise()) * Math.exp(-t * 40) * 0.12;
    const v = (blip + splash) * gain;
    add(sfx, i0 + k, v, v);
    add(send, i0 + k, v * 2.2, v * 2.2);
  }
}

/** The groove: kick on 1 and 3, clap on 2 and 4, hats, from a to b. */
function groove(a, b, level = 1) {
  for (let t = a; t < b - 1e-6; t += BEAT) {
    const n = Math.round((t - a) / BEAT);
    const beat = n % 4;
    if (beat === 0 || beat === 2) kick(t, level);
    if (beat === 3 && n % 8 === 7) kick(t + BEAT / 2, 0.55 * level);
    if (beat === 1 || beat === 3) clap(t, 0.7 * level);
    for (let s = 0; s < 4; s += 1) hat(t + s * BEAT / 4, (s === 2 ? 0.8 : 0.35) * level, s % 2 ? -0.3 : 0.3);
  }
}

/** The hook, shared by both cuts: an inhale into the roar, the hit, the slam, a lift into the reveal. */
function hook() {
  pads(0.2, 6.3, 0.42, (t) => 380 + 520 * smooth(clamp(t / 6, 0, 1)));
  riser(1.0, 0.9, 0.55);
  impact(1.0, 0.95, 42);
  whoosh(1.15, 1.6, 0.35, 0.6, -0.6, 160, 900);
  kick(1.5, 0.75);
  riser(3.0, 1.1, 0.4);
}

// ───────────────────────── the cue sheet ─────────────────────────
if (CUT === 'film') {
  // HOOK + REVEAL
  drone(0, 6.4, 1);
  hook();
  whoosh(3.6, 2.0, 0.3, -0.8, 0.8, 300, 1800); // the light sweep, left to right
  ping(3.5, 74, 0.7); // the wordmark
  riser(6.0, 0.7, 0.7); // the whip into the studio
  whoosh(5.8, 0.6, 0.6, 0.2, -0.2, 500, 3500);
  // BUILD: each part lands on a beat
  impact(6.0, 0.6, 50);
  bass(6.0, 11.9, 0.55);
  for (let t = 6.5; t < 11.6; t += 1) kick(t, 0.5);
  metal(6.5, 330, 0.75, 1.0, -0.1); // base
  metal(7.0, 220, 0.85, 1.2, 0.05); // body
  shimmer(7.25, 9.3, 0.4); // the label prints round
  whoosh(8.25, 2.0, 0.3, -0.5, 0.5, 400, 2600);
  plucks(7.5, 11.5, 0.4);
  metal(9.5, 440, 0.75, 0.9, 0.08); // lid
  tick(10.0, 3800, 0.9, 0.1); // tab
  tick(10.03, 5200, 0.5, 0.1);
  riser(12.0, 0.8, 0.7);
  whoosh(11.8, 0.6, 0.6, -0.2, 0.2, 500, 3800);
  // FLAVORS: the groove; a whoosh on every swap, travelling with the spin
  impact(12.0, 0.7, 55);
  pads(11.8, 30.4, 0.8, (t) => 900 + 700 * Math.sin((t - 12) * Math.PI / 6) ** 2);
  bass(12.0, 30.0, 1);
  groove(12.0, 30.0, 1);
  for (let i = 1; i <= 6; i += 1) whoosh(12 + i * 3, 0.8, 0.65, 0.7, -0.7, 380, 3400);
  // INSIDE: pulled back, a ping on each benefit
  pads(29.8, 36.4, 0.55, (t) => 700 + 300 * Math.sin(t));
  bass(30, 35.8, 0.5);
  plucks(30, 35.7, 0.6, [0, 1, 2, 3, 2, 1, 2, 3]);
  for (let t = 30; t < 35.9; t += 1) kick(t, 0.4);
  [30.45, 32.2, 34.2].forEach((t, i) => ping(t, [74, 77, 81][i], 0.75));
  // ZAMZAM: still, open, a single drop
  riser(36.0, 0.6, 0.3);
  drone(35.8, 39.4, 0.7);
  pads(35.8, 39.6, 0.5, () => 1600);
  ping(36.4, 86, 0.6);
  waterDrop(36.2 + 1.6, 1.0);
  // HALAL
  ping(39.3, 81, 0.75);
  whoosh(39.0, 0.7, 0.35, 0.4, -0.4, 600, 3000);
  pads(38.8, 41.2, 0.45, () => 1200);
  // CRACK: the music falls away
  drone(40.8, 44.3, 0.85);
  whoosh(41.1, 1.2, 0.35, -0.4, 0.4, 200, 1200);
  riser(42.45, 0.9, 0.25); // an inhale
  canCrack(42.5);
  riser(44.0, 0.8, 0.9); // the pull out
  // FINALE: the hit, the lights coming on one by one, the lock-up
  impact(44.0, 1.1, 50);
  for (let j = 0; j < 6; j += 1) thunk(44.35 + j * 0.25, -0.75 + j * 0.3, 0.7);
  pads(43.9, 50.6, 1.0, (t) => 1400 - 700 * clamp((t - 44) / 6, 0, 1));
  bass(44.0, 49.6, 0.65);
  for (let t = 45; t < 49.1; t += 1) kick(t, 0.45);
  ping(46.5, 74, 0.9);
  ping(47.8, 81, 0.7);
} else {
  // BRAG: the same hook, then a cut on every beat pair
  drone(0, 5.4, 1);
  hook();
  impact(3.0, 0.6, 48); // wordmark
  ping(3.05, 74, 0.7);
  metal(4.3, 440, 0.75, 0.9, 0.08); // lid
  tick(4.8, 3800, 0.9, 0.1); // tab
  riser(5.0, 0.7, 0.6);
  impact(5.0, 0.7, 55);
  pads(4.8, 11.4, 0.8, (t) => 900 + 700 * Math.sin((t - 5) * Math.PI / 6) ** 2);
  bass(5.0, 11.0, 1);
  groove(5.0, 11.0, 1);
  for (let i = 1; i < 6; i += 1) whoosh(5 + i, 0.45, 0.5, 0.6, -0.6, 400, 3600);
  // Zamzam + halal
  drone(10.8, 14.4, 0.7);
  pads(10.8, 14.2, 0.5, () => 1500);
  ping(11.3, 86, 0.6);
  waterDrop(12.3, 1.0);
  ping(13.2, 81, 0.7);
  // crack
  riser(14.35, 0.7, 0.25);
  canCrack(14.4);
  riser(15.5, 0.7, 0.9);
  // finale
  impact(15.5, 1.1, 50);
  for (let j = 0; j < 6; j += 1) thunk(15.85 + j * 0.25, -0.75 + j * 0.3, 0.7);
  pads(15.4, 20.6, 1.0, (t) => 1400 - 600 * clamp((t - 15.5) / 5, 0, 1));
  bass(15.5, 19.6, 0.65);
  for (let t = 16.5; t < 19.1; t += 1) kick(t, 0.45);
  ping(16.9, 74, 0.9);
}

// ───────────────────────── mix ─────────────────────────
for (let s = 0; s < N; s += 1) { music[0][s] *= duck[s]; music[1][s] *= duck[s]; }
const verb = reverb(send, { room: 0.88, damp: 0.4 });
const mix = bus();
mixInto(mix, music, 1.0);
mixInto(mix, drums, 0.85);
mixInto(mix, sfx, 0.8); // effects sit under the music
mixInto(mix, verb, 0.5);
// master: a gentle high-pass, a soft clip, a fade at the very end, normalise to -1 dBFS
const hpL = new Biquad().set('hp', 28, 0.7);
const hpR = new Biquad().set('hp', 28, 0.7);
let peak = 0;
for (let s = 0; s < N; s += 1) {
  const t = s / SR;
  const fade = 1 - smooth(clamp((t - (DUR - 2.2)) / 1.8, 0, 1));
  mix[0][s] = Math.tanh(hpL.run(mix[0][s]) * 1.2) * fade;
  mix[1][s] = Math.tanh(hpR.run(mix[1][s]) * 1.2) * fade;
  peak = Math.max(peak, Math.abs(mix[0][s]), Math.abs(mix[1][s]));
}
const norm = db(-1) / peak;

function writeWav(file, b, gain) {
  const bytes = 3;
  const data = Buffer.alloc(N * 2 * bytes);
  for (let s = 0; s < N; s += 1) {
    for (let c = 0; c < 2; c += 1) {
      const v = Math.round(clamp(b[c][s] * gain, -1, 1) * 8388607);
      data.writeIntLE(v, (s * 2 + c) * bytes, 3);
    }
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
  head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 2 * bytes, 28); head.writeUInt16LE(2 * bytes, 32); head.writeUInt16LE(24, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.concat([head, data]));
}

const out = resolve(here, `../film/public/grizzly-${CUT}-mix.wav`);
writeWav(out, mix, norm);
writeWav(resolve(here, `stems/${CUT}-music.wav`), music, norm);
writeWav(resolve(here, `stems/${CUT}-drums.wav`), drums, norm * 0.85);
writeWav(resolve(here, `stems/${CUT}-sfx.wav`), sfx, norm);
console.log('wrote', out, `peak gain ${norm.toFixed(3)}`);
