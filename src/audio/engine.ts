/**
 * Audio engine (§9): one AudioContext, master gain → compressor → out. Starts silent
 * until the first user gesture (autoplay rules), remembers the sound toggle, varies pitch
 * ±8%, never repeats the identical recipe back-to-back for an event, and rate-limits so
 * rapid poking never turns into noise.
 */
import type { MaterialId } from '../materials/types';
import * as R from './recipes';

export type SoundEvent = 'impact' | 'poke' | 'press' | 'release' | 'slice' | 'break' | 'action';

type Bank = Partial<Record<SoundEvent, R.Recipe[]>>;

/** Per-material sound banks. Several variants per event avoid machine-gun repetition. */
const BANKS: Record<MaterialId, Bank> = {
  jelly: {
    impact: [R.boing, R.squish],
    poke: [R.squish, R.squish],
    press: [R.squish],
    release: [R.boing],
    slice: [R.wetSlice],
  },
  'fruit-crisp': {
    impact: [R.knock, R.knock],
    poke: [R.knock],
    press: [R.crunch],
    release: [R.knock],
    slice: [R.crunch, R.wetSlice],
    break: [R.crunch],
  },
  'fruit-juicy': {
    impact: [R.squelch, R.splat],
    poke: [R.squelch],
    press: [R.squelch, R.splat],
    release: [R.squelch],
    slice: [R.wetSlice],
    break: [R.splat],
  },
  sponge: {
    impact: [R.softThud],
    poke: [R.softThud],
    press: [R.crumble],
    release: [R.softThud],
    slice: [R.crumble],
    break: [R.crumble],
  },
  cream: {
    impact: [R.wobblePluck, R.squish],
    poke: [R.squish],
    press: [R.squish],
    release: [R.wobblePluck],
    slice: [R.scoop],
  },
  mochi: {
    impact: [R.plop],
    poke: [R.squeak],
    press: [R.stretchCreak],
    release: [R.plop],
    slice: [R.stretchCreak],
  },
  'firm-dairy': {
    impact: [R.thunk],
    poke: [R.thunk],
    press: [R.thunk],
    release: [R.thunk],
    slice: [R.smoothSlice],
  },
  brittle: {
    impact: [R.knock, R.thunk],
    poke: [R.knock],
    press: [R.crack],
    release: [R.knock],
    slice: [R.snap],
    break: [R.crack, R.snap],
  },
};

const STORAGE_KEY = 'wobble.sound';
/** Overall loudness: comfortable, never startling. */
const MASTER_VOLUME = 0.6;
/** Everything above this is gently rolled off (no sharp, piercing highs). */
const MASTER_LOWPASS_HZ = 3800;
/** Minimum spacing between sounds of the same event (seconds). */
const MIN_GAP: Record<SoundEvent, number> = {
  impact: 0.09,
  poke: 0.06,
  press: 0.25,
  release: 0.15,
  slice: 0.08,
  break: 0.1,
  action: 0.05,
};
const MAX_VOICES_PER_SECOND = 14;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled: boolean;
  private lastAt = new Map<SoundEvent, number>();
  private lastRecipe = new Map<SoundEvent, R.Recipe>();
  private recent: number[] = [];
  material: MaterialId = 'jelly';
  /** Object-specific overrides, e.g. Puffy's "puu" on poke. */
  overrides: Bank = {};
  onChange: ((enabled: boolean) => void) | null = null;

  constructor() {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage unavailable: default on */
    }
    this.enabled = stored !== 'off';
  }

  get isEnabled() {
    return this.enabled;
  }

  /** True once a gesture has started the context. */
  get isUnlocked() {
    return this.ctx?.state === 'running';
  }

  /** Call from a user gesture. Creates/resumes the context. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      // Gentle master chain: a soft low-pass takes the edge off anything bright, then a
      // slow, mild compressor keeps stacked sounds from getting loud.
      const soften = this.ctx.createBiquadFilter();
      soften.type = 'lowpass';
      soften.frequency.value = MASTER_LOWPASS_HZ;
      soften.Q.value = 0.5;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 18;
      comp.ratio.value = 3;
      comp.attack.value = 0.01;
      comp.release.value = 0.2;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? MASTER_VOLUME : 0;
      this.master.connect(soften).connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? MASTER_VOLUME : 0, this.ctx.currentTime, 0.03);
    this.onChange?.(on);
  }

  /** Play the current material's sound for an event at intensity 0..1. */
  play(event: SoundEvent, intensity: number, recipe?: R.Recipe) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - (this.lastAt.get(event) ?? -1) < MIN_GAP[event]) return;
    this.recent = this.recent.filter((t) => now - t < 1);
    if (this.recent.length >= MAX_VOICES_PER_SECOND) return;

    let fn = recipe;
    if (!fn) {
      const bank = this.overrides[event] ?? BANKS[this.material][event] ?? BANKS[this.material].impact!;
      // Avoid the same recipe twice in a row when the bank has alternatives.
      const last = this.lastRecipe.get(event);
      const options = bank.length > 1 ? bank.filter((r) => r !== last) : bank;
      fn = options[Math.floor(Math.random() * options.length)];
      this.lastRecipe.set(event, fn);
    }
    const i = Math.min(1, Math.max(0, intensity));
    const pitch = (1 + (Math.random() * 2 - 1) * 0.08) * (1.06 - i * 0.12); // harder = slightly lower
    this.lastAt.set(event, now);
    this.recent.push(now);
    fn(ctx, this.master, now + 0.005, i, pitch);
  }
}

export const audio = new AudioEngine();
