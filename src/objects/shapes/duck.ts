/** Jelly duck: a bath-time duck set in jelly — round body, perky tail, orange bill. */
import { lin, smoothstep } from '../color';
import { ellipsoid, intersect, rotateZ, smoothUnion, sphere, translate, type Sdf } from '../sdf';
import type { ShapeBuilder } from '../types';
import { eyes, yaw } from './parts';

const TURN = -0.55;
const BILL = { x: 0.43, y: 0.69 };

const local: Sdf = (() => {
  const body = ellipsoid(0, 0.3, 0, 0.43, 0.3, 0.34);
  const tail = translate(rotateZ(ellipsoid(0, 0, 0, 0.13, 0.15, 0.11), 0.6), -0.37, 0.47, 0);
  const head = sphere(0.2, 0.73, 0, 0.225);
  const bill = ellipsoid(BILL.x, BILL.y, 0, 0.14, 0.055, 0.11);
  return intersect(smoothUnion(0.08, body, tail, head, bill), (_x, y) => 0.02 - y, 0.05);
})();

const sdf: Sdf = (x, y, z) => {
  const [lx, lz] = yaw(x, z, -TURN);
  return local(lx, y, lz);
};

export const duck: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-0.55, 0, -0.55], max: [0.6, 0.96, 0.55] },
  size: 1.1,
  ballast: 2,
  color: (v) => {
    const body = lin(v.color);
    const bill = lin('#F28C28');
    return (x, y, z) => {
      const [lx] = yaw(x, z, -TURN);
      // The bill is the part beyond the head, at bill height.
      const b = smoothstep(BILL.x - 0.14, BILL.x - 0.08, lx) * smoothstep(0.09, 0.05, Math.abs(y - BILL.y));
      return b > 0.5 ? bill : body;
    };
  },
  details: () => {
    const w = (x: number, y: number, z: number): [number, number, number] => {
      const [wx, wz] = yaw(x, z, TURN);
      return [wx, y, wz];
    };
    const dir = (side: number): [number, number, number] => {
      const [x, z] = yaw(0.55, 0.85 * side, TURN);
      return [x, 0.28, z];
    };
    return eyes(sdf, [w(0.22, 0.78, 0.05), w(0.22, 0.78, -0.05)], (i) => dir(i === 0 ? 1 : -1), 0.04);
  },
});
