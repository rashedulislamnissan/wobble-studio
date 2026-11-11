/**
 * Synthesis recipes (CLAUDE.md §9). Each schedules a short sound at time `t` into `out`.
 * `i` = intensity 0..1 (impact speed, press depth), `p` = pitch multiplier (~0.92..1.08).
 * Everything is synthesised: no samples, nothing to license, ~0 KB of audio downloads.
 */

export type Recipe = (ctx: AudioContext, out: AudioNode, t: number, i: number, p: number) => void;

let noiseBuffer: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = ctx.sampleRate;
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuffer.getChannelData(0);
  for (let n = 0; n < len; n++) d[n] = Math.random() * 2 - 1;
  return noiseBuffer;
}

function env(ctx: AudioContext, out: AudioNode, t: number, peak: number, attack: number, decay: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function osc(ctx: AudioContext, type: OscillatorType, f0: number, f1: number, t: number, dur: number, dest: AudioNode) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  o.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function noiseBurst(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  dur: number,
  filter: BiquadFilterType,
  f0: number,
  f1: number,
  q = 1,
) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const bq = ctx.createBiquadFilter();
  bq.type = filter;
  bq.Q.value = q;
  bq.frequency.setValueAtTime(f0, t);
  bq.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  src.connect(bq).connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

// ------------------------------------------------------------------ jelly & soft

/** Band-passed noise + falling sine: a wet squish. */
export const squish: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, 0.32 * (0.4 + i), 0.008, 0.2);
  noiseBurst(ctx, g, t, 0.2, 'bandpass', 1100 * p, 320 * p, 2.2);
  const g2 = env(ctx, out, t, 0.22 * (0.4 + i), 0.01, 0.16);
  osc(ctx, 'sine', 320 * p, 120 * p, t, 0.17, g2);
};

/** Decaying sine with slight FM and a downward bend. */
export const boing: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, 0.3 * (0.35 + i * 0.8), 0.005, 0.42);
  const carrier = osc(ctx, 'sine', 270 * p, 170 * p, t, 0.42, g);
  const mod = ctx.createOscillator();
  const depth = ctx.createGain();
  mod.frequency.value = 14 * p;
  depth.gain.setValueAtTime(26, t);
  depth.gain.exponentialRampToValueAtTime(1, t + 0.4);
  mod.connect(depth).connect(carrier.frequency);
  mod.start(t);
  mod.stop(t + 0.5);
};

/** Short rising/falling triangle with vibrato. */
export const squeak: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, 0.16 * (0.5 + i * 0.6), 0.01, 0.16);
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(880 * p, t);
  o.frequency.exponentialRampToValueAtTime(1420 * p, t + 0.06);
  o.frequency.exponentialRampToValueAtTime(1050 * p, t + 0.17);
  const vib = ctx.createOscillator();
  const vd = ctx.createGain();
  vib.frequency.value = 28;
  vd.gain.value = 35;
  vib.connect(vd).connect(o.frequency);
  o.connect(g);
  o.start(t);
  vib.start(t);
  o.stop(t + 0.22);
  vib.stop(t + 0.22);
};

/** Puffy's tiny "puu": a soft, low squeak. */
export const puu: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, 0.18 * (0.5 + i * 0.5), 0.02, 0.22);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(620 * p, t);
  o.frequency.exponentialRampToValueAtTime(760 * p, t + 0.05);
  o.frequency.exponentialRampToValueAtTime(540 * p, t + 0.24);
  o.connect(g);
  o.start(t);
  o.stop(t + 0.3);
};

/** Damped resonant tone: the pluck of a jiggling custard. */
export const wobblePluck: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, 0.2 * (0.4 + i), 0.006, 0.55);
  const f = 150 * p;
  const tremolo = ctx.createGain();
  tremolo.gain.value = 1;
  const lfo = ctx.createOscillator();
  const ld = ctx.createGain();
  lfo.frequency.value = 7;
  ld.gain.value = 0.35;
  lfo.connect(ld).connect(tremolo.gain);
  tremolo.connect(g);
  osc(ctx, 'sine', f, f * 0.94, t, 0.6, tremolo);
  osc(ctx, 'sine', f * 2.02, f * 1.9, t, 0.35, tremolo);
  lfo.start(t);
  lfo.stop(t + 0.65);
};

export const plop: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, 0.28 * (0.4 + i), 0.004, 0.13);
  osc(ctx, 'sine', 360 * p, 110 * p, t, 0.13, g);
};

export const stretchCreak: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, 0.08 * (0.4 + i), 0.08, 0.5);
  const bq = ctx.createBiquadFilter();
  bq.type = 'bandpass';
  bq.frequency.value = 420 * p;
  bq.Q.value = 6;
  bq.connect(g);
  osc(ctx, 'sawtooth', 62 * p, 78 * p, t, 0.55, bq);
};

export const scoop: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, 0.18 * (0.4 + i), 0.03, 0.22);
  noiseBurst(ctx, g, t, 0.25, 'lowpass', 900 * p, 300 * p, 0.8);
};

// ------------------------------------------------------------------ fruit

export const crunch: Recipe = (ctx, out, t, i, p) => {
  const bursts = 5 + Math.round(i * 6);
  let tt = t;
  for (let n = 0; n < bursts; n++) {
    const g = env(ctx, out, tt, 0.22 * (0.4 + i) * (1 - n / (bursts + 2)), 0.002, 0.03 + Math.random() * 0.03);
    noiseBurst(ctx, g, tt, 0.06, 'bandpass', (2400 + Math.random() * 1800) * p, 1500 * p, 1.4);
    tt += 0.012 + Math.random() * 0.022;
  }
  const g = env(ctx, out, t, 0.18 * i, 0.003, 0.08);
  osc(ctx, 'sine', 160 * p, 80 * p, t, 0.08, g);
};

/** Hollow knock of a crisp apple landing. */
export const knock: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, 0.32 * (0.4 + i), 0.002, 0.12);
  osc(ctx, 'sine', 210 * p, 120 * p, t, 0.12, g);
  const g2 = env(ctx, out, t, 0.12 * (0.4 + i), 0.001, 0.03);
  noiseBurst(ctx, g2, t, 0.03, 'bandpass', 2200 * p, 1500 * p, 2);
};

export const squelch: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, 0.3 * (0.4 + i), 0.006, 0.24);
  noiseBurst(ctx, g, t, 0.24, 'bandpass', 600 * p, 1800 * p, 4);
  const g2 = env(ctx, out, t + 0.03, 0.12 * (0.4 + i), 0.01, 0.1);
  osc(ctx, 'sine', 500 * p, 900 * p, t + 0.03, 0.1, g2);
};

export const splat: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, 0.36 * (0.4 + i), 0.003, 0.16);
  noiseBurst(ctx, g, t, 0.16, 'lowpass', 2500 * p, 400 * p, 0.7);
  const g2 = env(ctx, out, t, 0.25 * (0.4 + i), 0.004, 0.12);
  osc(ctx, 'sine', 420 * p, 80 * p, t, 0.12, g2);
};

export const wetSlice: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, 0.2 * (0.4 + i), 0.04, 0.22);
  noiseBurst(ctx, g, t, 0.28, 'highpass', 2500 * p, 5200 * p, 0.7);
  squish(ctx, out, t + 0.08, i * 0.5, p);
};

// ------------------------------------------------------------------ sponge, dairy, brittle

export const softThud: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, 0.32 * (0.4 + i), 0.004, 0.16);
  osc(ctx, 'sine', 110 * p, 55 * p, t, 0.16, g);
  const g2 = env(ctx, out, t, 0.12 * (0.4 + i), 0.003, 0.07);
  noiseBurst(ctx, g2, t, 0.08, 'lowpass', 700 * p, 200 * p, 0.7);
};

export const crumble: Recipe = (ctx, out, t, i, p) => {
  const grains = 10 + Math.round(i * 14);
  for (let n = 0; n < grains; n++) {
    const tt = t + Math.pow(Math.random(), 1.6) * 0.42;
    const g = env(ctx, out, tt, 0.08 * (0.4 + i) * Math.random(), 0.001, 0.02);
    noiseBurst(ctx, g, tt, 0.025, 'bandpass', (1600 + Math.random() * 2500) * p, 1200 * p, 1.2);
  }
};

export const thunk: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, 0.34 * (0.4 + i), 0.002, 0.13);
  osc(ctx, 'sine', 150 * p, 92 * p, t, 0.13, g);
  const g2 = env(ctx, out, t, 0.06 * (0.4 + i), 0.001, 0.02);
  noiseBurst(ctx, g2, t, 0.02, 'lowpass', 1200 * p, 600 * p, 0.7);
};

export const smoothSlice: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, 0.12 * (0.4 + i), 0.06, 0.25);
  noiseBurst(ctx, g, t, 0.3, 'bandpass', 1400 * p, 900 * p, 1.5);
};

export const snap: Recipe = (ctx, out, t, i, p) => {
  const g = env(ctx, out, t, 0.4 * (0.4 + i), 0.0008, 0.035);
  noiseBurst(ctx, g, t, 0.04, 'highpass', 3500 * p, 2500 * p, 0.8);
  const g2 = env(ctx, out, t, 0.18 * (0.4 + i), 0.001, 0.07);
  osc(ctx, 'sine', 2600 * p, 2100 * p, t, 0.07, g2);
};

export const crack: Recipe = (ctx, out, t, i, p) => {
  snap(ctx, out, t, i, p * 0.85);
  crumble(ctx, out, t + 0.02, i * 0.4, p * 1.3);
};
