/**
 * Synthesis recipes (CLAUDE.md §9). Each schedules a short sound at time `t` into `out`.
 * `i` = intensity 0..1 (impact speed, press depth), `p` = pitch multiplier (~0.92..1.08).
 *
 * Sound design rule: cute and soft, never sharp. Everything is built from rounded sine
 * tones (bloops, boings, wooden ticks, tiny tinks) with gentle attacks (≥ 6 ms, so no
 * clicks) and modest levels. Noise is used only as a quiet, low-passed "breath" under a
 * tone, never on its own and never above ~1.5 kHz. Nothing to license, ~0 KB to download.
 */

export type Recipe = (ctx: AudioContext, out: AudioNode, t: number, i: number, p: number) => void;

/** Shortest attack we allow: anything faster is heard as a click. */
const MIN_ATTACK = 0.006;

let noiseBuffer: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = ctx.sampleRate;
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuffer.getChannelData(0);
  for (let n = 0; n < len; n++) d[n] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/** Soft envelope: smooth rise, exponential fall. */
function env(ctx: AudioContext, out: AudioNode, t: number, peak: number, attack: number, decay: number) {
  const g = ctx.createGain();
  const a = Math.max(MIN_ATTACK, attack);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  g.connect(out);
  return g;
}

/** A sine (or triangle) gliding from f0 to f1. */
function tone(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  dur: number,
  f0: number,
  f1: number,
  type: OscillatorType = 'sine',
) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  o.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.06);
  return o;
}

/** Quiet, low-passed noise: a soft breath of air or juice under a tone. */
function breath(ctx: AudioContext, out: AudioNode, t: number, dur: number, peak: number, cutoff: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(1500, cutoff);
  lp.Q.value = 0.5;
  const g = env(ctx, out, t, peak, dur * 0.35, dur * 0.65);
  src.connect(lp).connect(g);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.06);
}

/** One rounded "bloop": a sine dropping in pitch, like a bubble or a jelly squish. */
function bloop(ctx: AudioContext, out: AudioNode, t: number, peak: number, f0: number, f1: number, dur: number) {
  tone(ctx, env(ctx, out, t, peak, 0.008, dur), t, dur, f0, f1);
}

/** A soft wooden "tok": a short sine with a quieter overtone. */
function tok(ctx: AudioContext, out: AudioNode, t: number, peak: number, f: number, dur = 0.06) {
  tone(ctx, env(ctx, out, t, peak, MIN_ATTACK, dur), t, dur, f, f * 0.94);
  tone(ctx, env(ctx, out, t, peak * 0.25, MIN_ATTACK, dur * 0.5), t, dur * 0.5, f * 2.4, f * 2.3);
}

/** A tiny sweet "tink", like a sugar crystal or a crumb landing. */
function tink(ctx: AudioContext, out: AudioNode, t: number, peak: number, f: number) {
  tone(ctx, env(ctx, out, t, peak, MIN_ATTACK, 0.07), t, 0.07, f, f * 0.98);
}

const level = (i: number, base: number) => base * (0.45 + 0.55 * Math.min(1, Math.max(0, i)));

// ------------------------------------------------------------------ jelly & soft

/** Jelly squish: two soft bloops, the second smaller, like a wobbling drop. */
export const squish: Recipe = (ctx, out, t, i, p) => {
  bloop(ctx, out, t, level(i, 0.2), 560 * p, 240 * p, 0.16);
  bloop(ctx, out, t + 0.05, level(i, 0.09), 760 * p, 380 * p, 0.1);
};

/** Boing: a round sine with a slow, gentle vibrato and a soft downward bend. */
export const boing: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, level(i, 0.18), 0.012, 0.45);
  const o = tone(ctx, g, t, 0.45, 330 * p, 230 * p);
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.value = 7;
  depth.gain.setValueAtTime(14, t);
  depth.gain.exponentialRampToValueAtTime(1, t + 0.42);
  lfo.connect(depth).connect(o.frequency);
  lfo.start(t);
  lfo.stop(t + 0.5);
};

/** Squeak: a small sine chirp, up then down, kept in a soft register. */
export const squeak: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, level(i, 0.12), 0.015, 0.16);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(620 * p, t);
  o.frequency.exponentialRampToValueAtTime(860 * p, t + 0.06);
  o.frequency.exponentialRampToValueAtTime(700 * p, t + 0.17);
  o.connect(g);
  o.start(t);
  o.stop(t + 0.24);
};

/** Puffy's "puu": a soft, low, slightly rising-then-falling coo. */
export const puu: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, level(i, 0.14), 0.025, 0.24);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(480 * p, t);
  o.frequency.exponentialRampToValueAtTime(560 * p, t + 0.06);
  o.frequency.exponentialRampToValueAtTime(400 * p, t + 0.26);
  o.connect(g);
  o.start(t);
  o.stop(t + 0.32);
};

/** Custard wobble: a warm, marimba-like pluck with a slow tremolo. */
export const wobblePluck: Recipe = (ctx, out, t, i, p) => {
  const f = 262 * p;
  const trem = ctx.createGain();
  const lfo = ctx.createOscillator();
  const ld = ctx.createGain();
  lfo.frequency.value = 6;
  ld.gain.value = 0.25;
  lfo.connect(ld).connect(trem.gain);
  trem.connect(out);
  tone(ctx, env(ctx, trem, t, level(i, 0.16), 0.01, 0.55), t, 0.55, f, f * 0.97);
  tone(ctx, env(ctx, trem, t, level(i, 0.04), 0.008, 0.18), t, 0.18, f * 4, f * 3.9);
  lfo.start(t);
  lfo.stop(t + 0.62);
};

/** Plop: a single round bubble. */
export const plop: Recipe = (ctx, out, t, i, p) => {
  bloop(ctx, out, t, level(i, 0.2), 420 * p, 170 * p, 0.14);
};

/** Mochi stretch: a slow, soft rising "boooing" instead of a creak. */
export const stretchCreak: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, level(i, 0.1), 0.06, 0.45);
  const o = tone(ctx, g, t, 0.5, 200 * p, 320 * p);
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.value = 5;
  depth.gain.value = 6;
  lfo.connect(depth).connect(o.frequency);
  lfo.start(t);
  lfo.stop(t + 0.55);
};

/** Spoon scoop: a soft swish with a little bloop at the end. */
export const scoop: Recipe = (ctx, out, t, i, p) => {
  breath(ctx, out, t, 0.18, level(i, 0.05), 900);
  bloop(ctx, out, t + 0.09, level(i, 0.12), 480 * p, 260 * p, 0.12);
};

// ------------------------------------------------------------------ fruit

/** Apple crunch: a quick cluster of tiny wooden ticks, crisp but rounded. */
export const crunch: Recipe = (ctx, out, t, i, p) => {
  const n = 3 + Math.round(i * 3);
  let tt = t;
  for (let k = 0; k < n; k++) {
    tok(ctx, out, tt, level(i, 0.1) * (1 - k / (n + 2)), (720 + Math.random() * 380) * p, 0.045);
    tt += 0.028 + Math.random() * 0.025;
  }
  breath(ctx, out, t, 0.12, level(i, 0.025), 1200);
};

/** An apple landing: a hollow wooden tok. */
export const knock: Recipe = (ctx, out, t, i, p) => {
  tok(ctx, out, t, level(i, 0.18), 300 * p, 0.12);
};

/** Juicy squelch: two quick wet bloops. */
export const squelch: Recipe = (ctx, out, t, i, p) => {
  bloop(ctx, out, t, level(i, 0.16), 460 * p, 220 * p, 0.12);
  bloop(ctx, out, t + 0.06, level(i, 0.12), 640 * p, 300 * p, 0.1);
  breath(ctx, out, t, 0.14, level(i, 0.03), 1000);
};

/** Splat: a low soft bloop with a little juicy breath. */
export const splat: Recipe = (ctx, out, t, i, p) => {
  bloop(ctx, out, t, level(i, 0.2), 320 * p, 120 * p, 0.16);
  breath(ctx, out, t, 0.2, level(i, 0.05), 800);
};

/** Wet slice: a soft swish and a small squish. */
export const wetSlice: Recipe = (ctx, out, t, i, p) => {
  breath(ctx, out, t, 0.22, level(i, 0.06), 1300);
  squish(ctx, out, t + 0.08, i * 0.6, p * 1.1);
};

// ------------------------------------------------------------------ sponge, dairy, brittle

/** Cake or bread landing: a soft, padded thump. */
export const softThud: Recipe = (ctx, out, t, i, p) => {
  bloop(ctx, out, t, level(i, 0.2), 170 * p, 95 * p, 0.16);
  breath(ctx, out, t, 0.1, level(i, 0.03), 600);
};

/** Crumbs: a scatter of tiny sweet tinks, like sugar falling. */
export const crumble: Recipe = (ctx, out, t, i, p) => {
  const n = 5 + Math.round(i * 6);
  for (let k = 0; k < n; k++) {
    const tt = t + Math.pow(Math.random(), 1.4) * 0.38;
    tink(ctx, out, tt, level(i, 0.05) * (0.5 + Math.random() * 0.5), (780 + Math.random() * 380) * p);
  }
};

/** Cheese landing: a dull, warm thunk. */
export const thunk: Recipe = (ctx, out, t, i, p) => {
  bloop(ctx, out, t, level(i, 0.2), 230 * p, 160 * p, 0.12);
  tone(ctx, env(ctx, out, t, level(i, 0.04), 0.008, 0.05), t, 0.05, 520 * p, 500 * p);
};

/** A clean, quiet slice through something smooth. */
export const smoothSlice: Recipe = (ctx, out, t, i, p) => {
  breath(ctx, out, t, 0.25, level(i, 0.05), 1000);
  tone(ctx, env(ctx, out, t + 0.05, level(i, 0.03), 0.04, 0.15), t + 0.05, 0.2, 520 * p, 480 * p);
};

/** Chocolate snap: a crisp little wooden tick, then a tiny tok. */
export const snap: Recipe = (ctx, out, t, i, p) => {
  tone(ctx, env(ctx, out, t, level(i, 0.12), 0.008, 0.045), t, 0.045, 860 * p, 820 * p);
  tok(ctx, out, t + 0.025, level(i, 0.1), 480 * p, 0.08);
};

/** Chocolate breaking: a snap followed by a few falling tinks. */
export const crack: Recipe = (ctx, out, t, i, p) => {
  snap(ctx, out, t, i, p);
  crumble(ctx, out, t + 0.04, i * 0.5, p * 1.05);
};
