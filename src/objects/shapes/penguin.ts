/** Penguin jelly: a chubby egg with a pale belly, flippers, orange feet and beak. */
import { ConeGeometry } from 'three/webgpu';
import { paint } from '../build';
import { lin, mix, smoothstep } from '../color';
import { ellipsoid, intersect, rotateZ, smoothUnion, translate, type Sdf } from '../sdf';
import type { ShapeBuilder, Variant } from '../types';
import { eyes, surfaceAlong, yaw } from './parts';

const TURN = 0.3;

const local: Sdf = (() => {
  const body = ellipsoid(0, 0.42, 0, 0.33, 0.42, 0.31);
  const head = ellipsoid(0, 0.8, 0.02, 0.25, 0.23, 0.24);
  const flipR = translate(rotateZ(ellipsoid(0, 0, 0, 0.065, 0.21, 0.13), 0.38), 0.31, 0.45, 0);
  const flipL = translate(rotateZ(ellipsoid(0, 0, 0, 0.065, 0.21, 0.13), -0.38), -0.31, 0.45, 0);
  const foot = (x: number) => ellipsoid(x, 0.07, 0.17, 0.12, 0.05, 0.15);
  // Flat-bottomed, like a weighted toy: the base is wide enough to stand on.
  return intersect(smoothUnion(0.07, body, head, flipR, flipL, foot(0.13), foot(-0.13)), (_x, y) => 0.06 - y, 0.03);
})();

const sdf: Sdf = (x, y, z) => {
  const [lx, lz] = yaw(x, z, -TURN);
  return local(lx, y, lz);
};

const BELLY: Record<string, string> = { classic: '#F4F1EA', ice: '#F6FBFF', sunset: '#FFF1DE' };

function palette(v: Variant) {
  return { body: lin(v.color), belly: lin(BELLY[v.id] ?? '#F4F1EA'), orange: lin('#F29A2E') };
}

export const penguin: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-0.5, 0, -0.45], max: [0.5, 1.04, 0.45] },
  size: 1.04,
  ballast: 4,
  color: (v) => {
    const p = palette(v);
    return (x, y, z, _nx, _ny, nz) => {
      const [lx, lz] = yaw(x, z, -TURN);
      const [, lnz] = yaw(0, nz, -TURN);
      if (y < 0.11 && lz > 0.08) return p.orange; // feet
      // Pale belly and face on the front.
      const belly = (lx / 0.25) ** 2 + ((y - 0.43) / 0.36) ** 2 < 1 && lz > 0;
      const face = (lx / 0.17) ** 2 + ((y - 0.8) / 0.13) ** 2 < 1 && lz > 0.05;
      const front = smoothstep(0.1, 0.4, lnz);
      return belly || face ? mix(p.body, p.belly, front) : p.body;
    };
  },
  details: () => {
    const w = (x: number, y: number, z: number): [number, number, number] => {
      const [wx, wz] = yaw(x, z, TURN);
      return [wx, y, wz];
    };
    const dir = (side: number): [number, number, number] => {
      const [x, z] = yaw(0.35 * side, 1, TURN);
      return [x, 0.15, z];
    };
    const eyeGeo = eyes(sdf, [w(0.08, 0.84, 0), w(-0.08, 0.84, 0)], (i) => dir(i === 0 ? 1 : -1), 0.035);
    // Beak: a short cone poking out of the face.
    const fwd = yaw(0, 1, TURN);
    const t = surfaceAlong(sdf, w(0, 0.76, 0), [fwd[0], 0, fwd[1]]);
    const beak = new ConeGeometry(0.05, 0.12, 12);
    beak.rotateX(Math.PI / 2);
    beak.rotateY(TURN);
    const base = w(0, 0.76, 0);
    beak.translate(base[0] + fwd[0] * (t + 0.03), 0.76, base[2] + fwd[1] * (t + 0.03));
    return [...eyeGeo, paint(beak, lin('#F29A2E'))];
  },
  regions: {
    top: (_x, y) => smoothstep(0.4, 0.95, y),
  },
});
