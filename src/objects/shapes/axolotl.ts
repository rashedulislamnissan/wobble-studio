/** Axolotl jelly: wide smiling head, six feathery gills, little legs, a flat tail. */
import { lin, mix, smoothstep } from '../color';
import { capsule, ellipsoid, intersect, len3, smin, type Sdf } from '../sdf';
import type { ShapeBuilder } from '../types';
import { eyes, yaw } from './parts';

const TURN = -0.5;

/** Gill fronds: three per side, fanning up and back from the head. */
const GILLS: { a: [number, number, number]; b: [number, number, number] }[] = [];
for (const side of [1, -1]) {
  [
    [0.3, 0.58, 0.3],
    [0.22, 0.5, 0.42],
    [0.17, 0.36, 0.46],
  ].forEach(([bx, by, bz]) => {
    GILLS.push({ a: [0.36, 0.33, 0.19 * side], b: [bx, by, bz * side] });
  });
}
const gillSdfs = GILLS.map((g) => capsule(...g.a, ...g.b, 0.045, 0.03));

const local: Sdf = (() => {
  const body = ellipsoid(-0.06, 0.2, 0, 0.42, 0.19, 0.21);
  const head = ellipsoid(0.37, 0.27, 0, 0.25, 0.2, 0.29);
  const tail = ellipsoid(-0.56, 0.24, 0, 0.32, 0.14, 0.075);
  const legs = [
    ellipsoid(0.17, 0.06, 0.2, 0.07, 0.06, 0.1),
    ellipsoid(0.17, 0.06, -0.2, 0.07, 0.06, 0.1),
    ellipsoid(-0.27, 0.06, 0.18, 0.07, 0.06, 0.1),
    ellipsoid(-0.27, 0.06, -0.18, 0.07, 0.06, 0.1),
  ];
  const core: Sdf = (x, y, z) => {
    let d = smin(body(x, y, z), head(x, y, z), 0.1);
    d = smin(d, tail(x, y, z), 0.08);
    for (const l of legs) d = smin(d, l(x, y, z), 0.05);
    for (const g of gillSdfs) d = smin(d, g(x, y, z), 0.03);
    return d;
  };
  return intersect(core, (_x, y) => 0.005 - y, 0.03);
})();

const sdf: Sdf = (x, y, z) => {
  const [lx, lz] = yaw(x, z, -TURN);
  return local(lx, y, lz);
};

const nearGill = (lx: number, y: number, lz: number) => {
  let d = Infinity;
  for (const g of gillSdfs) d = Math.min(d, g(lx, y, lz));
  return d;
};

export const axolotl: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-0.9, 0, -0.62], max: [0.9, 0.66, 0.62] },
  size: 1.8,
  color: (v) => {
    const c = lin(v.color);
    const gill = mix(c, lin('#C2306A'), 0.45);
    const mouth = mix(c, [0, 0, 0], 0.5);
    return (x, y, z) => {
      const [lx, lz] = yaw(x, z, -TURN);
      if (nearGill(lx, y, lz) < 0.012) return gill;
      // A gentle smile across the front of the head.
      const smile = 0.235 - 0.12 * (lz * lz) * 4;
      if (lx > 0.52 && Math.abs(y - smile) < 0.008 && Math.abs(lz) < 0.13) return mouth;
      return mix(c, [1, 1, 1], smoothstep(0.08, 0.02, y) * 0.3);
    };
  },
  details: () => {
    const w = (x: number, y: number, z: number): [number, number, number] => {
      const [wx, wz] = yaw(x, z, TURN);
      return [wx, y, wz];
    };
    const dir = (side: number): [number, number, number] => {
      const [x, z] = yaw(0.75, 0.6 * side, TURN);
      return [x, 0.25, z];
    };
    return eyes(sdf, [w(0.42, 0.33, 0.08), w(0.42, 0.33, -0.08)], (i) => dir(i === 0 ? 1 : -1), 0.035);
  },
  regions: {
    gills: (x, y, z) => {
      const [lx, lz] = yaw(x, z, -TURN);
      return smoothstep(0.25, 0.0, Math.min(...GILLS.map((g) => len3(lx - g.b[0], y - g.b[1], lz - g.b[2]))));
    },
    tail: (x, _y, z) => smoothstep(-0.3, -0.75, yaw(x, z, -TURN)[0]),
  },
});
