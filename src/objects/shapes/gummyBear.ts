/** Gummy bear: a standing jelly bear with molded features (eyes a shade darker, not black). */
import { lin, mix } from '../color';
import { ellipsoid, intersect, rotateZ, smoothUnion, sphere, translate, type Sdf } from '../sdf';
import type { ShapeBuilder } from '../types';
import { eyes, yaw } from './parts';

const TURN = 0.35;

const local: Sdf = (() => {
  const body = ellipsoid(0, 0.38, 0, 0.3, 0.34, 0.25);
  const head = ellipsoid(0, 0.84, 0.01, 0.28, 0.24, 0.23);
  const ear = sphere(0.2, 1.03, 0, 0.09);
  const earsX: Sdf = (x, y, z) => ear(Math.abs(x), y, z);
  const snout = ellipsoid(0, 0.77, 0.19, 0.11, 0.08, 0.075);
  const arm = translate(rotateZ(ellipsoid(0, 0, 0, 0.095, 0.16, 0.095), 0.55), 0.29, 0.52, 0.06);
  const armL = translate(rotateZ(ellipsoid(0, 0, 0, 0.095, 0.16, 0.095), -0.55), -0.29, 0.52, 0.06);
  const leg = (x: number) => ellipsoid(x, 0.13, 0.05, 0.13, 0.14, 0.14);
  const shape = smoothUnion(0.075, body, head, earsX, snout, arm, armL, leg(0.16), leg(-0.16));
  // A flat base under body and feet: it stands like a moulded sweet, not on two points.
  return intersect(shape, (_x, y) => 0.075 - y, 0.03);
})();

const sdf: Sdf = (x, y, z) => {
  const [lx, lz] = yaw(x, z, -TURN);
  return local(lx, y, lz);
};

export const gummyBear: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-0.45, 0, -0.42], max: [0.45, 1.13, 0.42] },
  size: 1.13,
  ballast: 4,
  color: (v) => {
    const c = lin(v.color);
    return () => c;
  },
  details: (v) => {
    const molded = mix(lin(v.color), [0, 0, 0], 0.55);
    const toWorld = (x: number, y: number, z: number): [number, number, number] => {
      const [wx, wz] = yaw(x, z, TURN);
      return [wx, y, wz];
    };
    const g = eyes(
      sdf,
      [toWorld(0.09, 0.88, 0.05), toWorld(-0.09, 0.88, 0.05)],
      (i) => {
        const [x, z] = yaw(i === 0 ? 0.25 : -0.25, 1, TURN);
        return [x, 0.1, z];
      },
      0.032,
      { highlight: false, sink: 0.6 },
    );
    const nose = eyes(sdf, [toWorld(0, 0.79, 0.1)], () => {
      const [x, z] = yaw(0, 1, TURN);
      return [x, 0.05, z];
    }, 0.035, { highlight: false, sink: 0.55 });
    // Molded features are tinted jelly, not paint.
    for (const geo of [...g, ...nose]) {
      const col = geo.getAttribute('color').array as Float32Array;
      for (let i = 0; i < col.length; i += 3) col.set(molded, i);
    }
    return [...g, ...nose];
  },
});
