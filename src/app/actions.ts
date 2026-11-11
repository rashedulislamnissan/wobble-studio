/**
 * Special actions (§6 "Special action"). Each is a short choreography of impulses on the
 * soft body — no animation clips, so every action interacts with the physics naturally.
 * Actions whose mechanics arrive in a later phase are simply not listed (§14: hidden,
 * not broken).
 */
import type { SoundEvent } from '../audio/engine';
import * as R from '../audio/recipes';
import type { CutOptions, Field, Specimen } from './specimen';
import { len2, len3 } from '../objects/sdf';

export interface ActionContext {
  specimen: Specimen;
  /** Run `fn` after `delay` seconds of simulated time. */
  schedule(delay: number, fn: () => void): void;
  sound(event: SoundEvent, intensity: number, recipe?: R.Recipe): void;
  cut(field: Field, opts?: CutOptions): boolean;
  debris(at: [number, number, number], count: number, dir?: [number, number, number]): void;
  /** Camera position (bites are taken from the side facing the viewer). */
  eye: [number, number, number];
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

/** World-space bounds of the current body. */
function worldBounds(s: Specimen) {
  const p = s.body.pos;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[i + k]);
      max[k] = Math.max(max[k], p[i + k]);
    }
  }
  return { min, max };
}

export const ACTIONS: Record<string, Action> = {
  bite: ({ specimen: s, cut, sound, debris, eye }) => {
    // Take a bite from the upper edge facing the viewer.
    const com = s.body.centerOfMass();
    const { max } = worldBounds(s);
    const dx = eye[0] - com[0], dz = eye[2] - com[2];
    const l = len2(dx, dz) || 1;
    const reach = s.shape.size * 0.42;
    const c = [com[0] + (dx / l) * reach, max[1] - s.height * 0.22, com[2] + (dz / l) * reach];
    const r = s.shape.size * 0.21;
    // Slightly oval, like a real bite.
    const field: Field = (x, y, z) => len3((x - c[0]) * 0.9, (y - c[1]) * 1.15, (z - c[2]) * 0.9) - r;
    if (cut(field, { removeInside: true, lift: 0.3, separation: 0 })) {
      sound('break', 0.8, R.crunch);
      debris([c[0], c[1], c[2]], 16, [dx / l, 1, dz / l]);
    }
  },
  crumble: ({ specimen: s, schedule, sound, debris }) => {
    const { min, max } = worldBounds(s);
    for (let k = 0; k < 4; k++) {
      schedule(k * 0.12, () => {
        const x = min[0] + Math.random() * (max[0] - min[0]);
        const z = min[2] + Math.random() * (max[2] - min[2]);
        debris([x, max[1] * (0.4 + Math.random() * 0.5), z], 14, [0, 0.4, 0]);
      });
    }
    s.pulse(-0.8);
    sound('action', 0.7, R.crumble);
  },
  slice: ({ specimen: s, cut, sound, debris }) => {
    // A clean slice off the end, along the longest horizontal axis.
    const { min, max } = worldBounds(s);
    const alongX = max[0] - min[0] >= max[2] - min[2];
    const n: [number, number, number] = alongX ? [1, 0, 0] : [0, 0, 1];
    const at = alongX ? max[0] - (max[0] - min[0]) * 0.22 : max[2] - (max[2] - min[2]) * 0.22;
    const field: Field = (x, _y, z) => (alongX ? x : z) - at;
    if (cut(field, { normal: n, separation: 0.5 })) {
      sound('slice', 0.6);
      debris(alongX ? [at, max[1] * 0.6, (min[2] + max[2]) / 2] : [(min[0] + max[0]) / 2, max[1] * 0.6, at], 10, [0, 1, 0]);
    }
  },
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
