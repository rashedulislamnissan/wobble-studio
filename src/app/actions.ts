/**
 * Special actions (§6 "Special action"). Each is a short choreography of impulses on the
 * soft body — no animation clips, so every action interacts with the physics naturally.
 * Actions whose mechanics arrive in a later phase are simply not listed (§14: hidden,
 * not broken).
 */
import type { SoundEvent } from '../audio/engine';
import * as R from '../audio/recipes';
import type { Specimen } from './specimen';

export interface ActionContext {
  specimen: Specimen;
  /** Run `fn` after `delay` seconds of simulated time. */
  schedule(delay: number, fn: () => void): void;
  sound(event: SoundEvent, intensity: number, recipe?: R.Recipe): void;
}

type Action = (c: ActionContext) => void;

/** Weights from rest positions relative to the body's rest bounds (0..1 per axis). */
function weights(s: Specimen, fn: (u: number, v: number, w: number) => number) {
  const rest = s.body.rest;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < rest.length; i += 3) {
    minX = Math.min(minX, rest[i]); maxX = Math.max(maxX, rest[i]);
    minY = Math.min(minY, rest[i + 1]); maxY = Math.max(maxY, rest[i + 1]);
    minZ = Math.min(minZ, rest[i + 2]); maxZ = Math.max(maxZ, rest[i + 2]);
  }
  const out = new Float32Array(s.body.count);
  for (let i = 0; i < s.body.count; i++) {
    out[i] = fn(
      (rest[i * 3] - minX) / (maxX - minX || 1),
      (rest[i * 3 + 1] - minY) / (maxY - minY || 1),
      (rest[i * 3 + 2] - minZ) / (maxZ - minZ || 1),
    );
  }
  return out;
}

const top = (s: Specimen) => s.region('top') ?? weights(s, (_u, v) => Math.max(0, v - 0.35) / 0.65);

/** Spin about the vertical axis through the centre of mass. */
function spin(s: Specimen, omega: number) {
  const com = s.body.centerOfMass();
  const { pos, vel } = s.body;
  for (let i = 0; i < s.body.count; i++) {
    const j = i * 3;
    vel[j] += -(pos[j + 2] - com[2]) * omega;
    vel[j + 2] += (pos[j] - com[0]) * omega;
  }
}

export const ACTIONS: Record<string, Action> = {
  kick: ({ specimen: s, schedule, sound }) => {
    const tail = s.region('tail');
    s.impulse([0, 3.4, 0], tail);
    schedule(0.14, () => s.impulse([0, -4.2, 0], tail));
    schedule(0.16, () => s.impulse([0.9, 0.9, 0]));
    sound('action', 0.6, R.boing);
  },
  blow: ({ specimen: s, schedule, sound }) => {
    const hole = s.region('blowhole');
    s.pulse(-2.2, hole);
    schedule(0.08, () => s.impulse([0, 2.6, 0], hole));
    sound('action', 0.5, R.squelch);
  },
  bounce: ({ specimen: s, sound }) => {
    s.pulse(-1.5);
    s.impulse([0, 4.6, 0]);
    sound('action', 0.6, R.boing);
  },
  jiggle: ({ specimen: s, schedule, sound }) => {
    const t = top(s);
    for (let k = 0; k < 4; k++) schedule(k * 0.11, () => s.impulse([k % 2 ? -1.6 : 1.6, 0, k % 2 ? 0.4 : -0.4], t));
    sound('action', 0.6, R.wobblePluck);
  },
  wiggle: ({ specimen: s, schedule, sound }) => {
    const low = weights(s, (_u, v) => Math.max(0, 0.6 - v) / 0.6);
    for (let k = 0; k < 5; k++) schedule(k * 0.09, () => s.impulse([(Math.random() - 0.5) * 3, 0.4, (Math.random() - 0.5) * 3], low));
    sound('action', 0.4, R.squish);
  },
  squeak: ({ specimen: s, sound }) => {
    s.pulse(-2.6);
    sound('action', 0.7, R.squeak);
  },
  spin: ({ specimen: s, sound }) => {
    spin(s, 7);
    s.impulse([0, 1.2, 0]);
    sound('action', 0.4, R.squish);
  },
  beat: ({ specimen: s, schedule, sound }) => {
    const lub = () => s.pulse(1.8);
    lub();
    schedule(0.22, lub);
    schedule(0.9, lub);
    schedule(1.12, lub);
    sound('action', 0.5, R.plop);
    schedule(0.22, () => sound('action', 0.35, R.plop));
  },
  gills: ({ specimen: s, schedule, sound }) => {
    const head = s.region('gills') ?? top(s);
    for (let k = 0; k < 6; k++) schedule(k * 0.08, () => s.impulse([0, 0, k % 2 ? -1.4 : 1.4], head));
    sound('action', 0.4, R.squish);
  },
  waddle: ({ specimen: s, schedule, sound }) => {
    const t = top(s);
    for (let k = 0; k < 4; k++) {
      schedule(k * 0.24, () => {
        s.impulse([0, 0, k % 2 ? -1.8 : 1.8], t);
        s.impulse([0.35, 0.8, 0]);
      });
    }
    sound('action', 0.4, R.plop);
  },
  stretch: ({ specimen: s, schedule, sound }) => {
    const left = weights(s, (u) => Math.max(0, 0.45 - u) / 0.45);
    const right = weights(s, (u) => Math.max(0, u - 0.55) / 0.45);
    s.impulse([-3, 0.6, 0], left);
    s.impulse([3, 0.6, 0], right);
    schedule(0.05, () => sound('action', 0.6, R.stretchCreak));
  },
};

export const isActionAvailable = (id: string) => id in ACTIONS;
