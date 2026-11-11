/**
 * Penguin jelly: one round, bottom-heavy egg with soft flippers, a heart-shaped white face
 * running into a white belly, a small rounded beak, blush and orange feet. The markings
 * are drawn per pixel (shadePenguin) so their edges stay clean at any zoom.
 */
import { Color } from 'three/webgpu';
import { float, max, min, mix as tmix, smoothstep as ss, uniform, type attribute } from 'three/tsl';
import { lin } from '../color';
import { ellipsoid, intersect, rotateZ, smoothUnion, translate, type Sdf } from '../sdf';
import type { ShapeBuilder } from '../types';
import { eyes, yaw } from './parts';

const TURN = 0.28;
const EYE = { x: 0.085, y: 0.8 };
const BEAK = { y: 0.725, z: 0.29 };

const local: Sdf = (() => {
  const body = ellipsoid(0, 0.46, 0, 0.35, 0.46, 0.32);
  const hips = ellipsoid(0, 0.3, 0, 0.37, 0.3, 0.33);
  const head = ellipsoid(0, 0.77, 0.01, 0.27, 0.22, 0.25);
  const flipR = translate(rotateZ(ellipsoid(0, 0, 0, 0.06, 0.2, 0.12), 0.42), 0.33, 0.45, -0.02);
  const flipL = translate(rotateZ(ellipsoid(0, 0, 0, 0.06, 0.2, 0.12), -0.42), -0.33, 0.45, -0.02);
  const foot = (x: number) => ellipsoid(x, 0.05, 0.19, 0.11, 0.045, 0.13);
  const beak = ellipsoid(0, BEAK.y, BEAK.z, 0.055, 0.04, 0.075);
  const shape = smoothUnion(0.07, smoothUnion(0.14, body, hips, head), flipR, flipL, foot(0.13), foot(-0.13), beak);
  return intersect(shape, (_x, y) => 0.05 - y, 0.03);
})();

const sdf: Sdf = (x, y, z) => {
  const [lx, lz] = yaw(x, z, -TURN);
  return local(lx, y, lz);
};

type Vec3 = ReturnType<typeof attribute<'vec3'>>;
const WHITE = uniform(new Color('#F7F4EC'));
const ORANGE = uniform(new Color('#F49A2C'));
const BLUSH = uniform(new Color('#F49AAE'));
const cosT = Math.cos(-TURN);
const sinT = Math.sin(-TURN);

/** Per-pixel markings in rest space (local, facing +z). */
function shadePenguin(baseIn: unknown, restIn: unknown): unknown {
  const base = baseIn as Vec3;
  const r = restIn as Vec3;
  const lx = r.x.mul(cosT).sub(r.z.mul(sinT));
  const lz = r.x.mul(sinT).add(r.z.mul(cosT));
  const y = r.y;
  const front = ss(0.02, 0.1, lz);
  // Belly: tall oval. Face: two overlapping circles (a heart) around the eyes.
  const belly = lx.div(0.25).pow(2).add(y.sub(0.42).div(0.36).pow(2));
  const faceL = lx.add(EYE.x).div(0.12).pow(2).add(y.sub(0.79).div(0.12).pow(2));
  const faceR = lx.sub(EYE.x).div(0.12).pow(2).add(y.sub(0.79).div(0.12).pow(2));
  const d = min(belly, min(faceL, faceR));
  const white = float(1).sub(ss(0.92, 1.0, d)).mul(front);
  // Beak and feet.
  const beakD = lx.div(0.06).pow(2).add(y.sub(BEAK.y).div(0.045).pow(2));
  const beak = float(1).sub(ss(0.85, 1.0, beakD)).mul(ss(0.24, 0.28, lz));
  const feet = float(1).sub(ss(0.085, 0.1, y)).mul(ss(0.06, 0.12, lz));
  // Blush just below and outside the eyes.
  const cheek = min(
    lx.add(0.15).div(0.05).pow(2).add(y.sub(0.73).div(0.028).pow(2)),
    lx.sub(0.15).div(0.05).pow(2).add(y.sub(0.73).div(0.028).pow(2)),
  );
  const blush = float(1).sub(ss(0.4, 1.0, cheek)).mul(front).mul(0.8);
  let c = tmix(base, WHITE, white);
  c = tmix(c, BLUSH, blush);
  c = tmix(c, ORANGE, max(beak, feet));
  return c;
}

export const penguin: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-0.5, 0, -0.45], max: [0.5, 1.0, 0.45] },
  size: 1.0,
  ballast: 4,
  look: { shade: shadePenguin },
  color: (v) => {
    const c = lin(v.color);
    return () => c;
  },
  details: () => {
    const w = (x: number, y: number, z: number): [number, number, number] => {
      const [wx, wz] = yaw(x, z, TURN);
      return [wx, y, wz];
    };
    const dir = (side: number): [number, number, number] => {
      const [x, z] = yaw(0.22 * side, 1, TURN);
      return [x, 0.08, z];
    };
    return eyes(sdf, [w(EYE.x, EYE.y, 0), w(-EYE.x, EYE.y, 0)], (i) => dir(i === 0 ? 1 : -1), 0.041, { sink: 0.5 });
  },
  regions: {
    top: (_x, y) => Math.min(1, Math.max(0, (y - 0.4) / 0.55)),
  },
});
