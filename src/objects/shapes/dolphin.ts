/**
 * Dolphin jelly: a chubby jelly-mould dolphin resting on its belly, turned a little
 * toward the viewer. Thin fins sit outside the lattice and ride along via the embedding.
 */
import { SphereGeometry } from 'three/webgpu';
import { paint } from '../build';
import { lin, mix, smoothstep } from '../color';
import { capsule, ellipsoid, intersect, mirrorZ, rotateX, rotateY, rotateZ, smoothUnion, translate, type Sdf, len3 } from '../sdf';
import type { ShapeBuilder } from '../types';

const TURN = -0.42; // yaw toward the camera
const cos = Math.cos(TURN);
const sin = Math.sin(TURN);
/** World → dolphin-local (undo the yaw). */
const toLocal = (x: number, z: number): [number, number] => [cos * x - sin * z, sin * x + cos * z];
/** Dolphin-local → world. */
const toWorld = (x: number, z: number): [number, number] => [cos * x + sin * z, -sin * x + cos * z];

const EYE = { x: 0.45, y: 0.11, r: 0.05, sink: 0.45 };

const local: Sdf = (() => {
  // Chubby proportions: a jelly-mould dolphin, not an anatomical one.
  const body = ellipsoid(0.0, 0.02, 0, 0.45, 0.31, 0.3);
  const head = ellipsoid(0.33, 0.07, 0, 0.29, 0.27, 0.255);
  const beak = capsule(0.55, -0.02, 0, 0.73, -0.05, 0, 0.105, 0.075);
  const stalk = capsule(-0.25, 0.04, 0, -0.58, 0.1, 0, 0.2, 0.08);
  const flukes = mirrorZ(translate(rotateY(ellipsoid(0, 0, 0, 0.13, 0.05, 0.17), 0.55), -0.69, 0.11, 0.13));
  const dorsal = translate(rotateZ(ellipsoid(0, 0, 0, 0.14, 0.17, 0.065), 0.62), -0.05, 0.33, 0);
  const pectoral = mirrorZ(translate(rotateX(rotateY(ellipsoid(0, 0, 0, 0.15, 0.055, 0.1), 0.5), -0.5), 0.18, -0.1, 0.28));
  const shape = smoothUnion(0.085, body, head, beak, stalk, flukes, dorsal, pectoral);
  // Flatten the belly slightly so it rests instead of rolling onto its side.
  const floor: Sdf = (_x, y) => -0.25 - y;
  return intersect(shape, floor, 0.06);
})();

const sdf: Sdf = (x, y, z) => {
  const [lx, lz] = toLocal(x, z);
  return local(lx, y, lz);
};

export const dolphin: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-0.86, -0.26, -0.55], max: [0.86, 0.52, 0.55] },
  size: 1.6,
  color: (v) => {
    const body = lin(v.color);
    const belly = mix(body, [1, 1, 1], 0.42);
    return (x, y, z, _nx, ny) => {
      const [lx] = toLocal(x, z);
      // Pale belly below the waterline, blended softly.
      const b = smoothstep(0.0, -0.18, y) * smoothstep(-0.65, -0.2, lx) * smoothstep(-0.1, -0.6, ny);
      return mix(body, belly, b * 0.9);
    };
  },
  details: () => {
    const eyeColor = lin('#141218');
    // Find the head surface along +z, then sink the eye partly into it.
    let lo = 0, hi = 0.5;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (local(EYE.x, EYE.y, mid) < 0) lo = mid;
      else hi = mid;
    }
    const ez = lo - EYE.r * EYE.sink;
    return [1, -1].map((side) => {
      const g = new SphereGeometry(EYE.r, 16, 12);
      const [wx, wz] = toWorld(EYE.x, ez * side);
      g.translate(wx, EYE.y, wz);
      return paint(g, eyeColor);
    });
  },
  regions: {
    tail: (x, _y, z) => smoothstep(-0.25, -0.72, toLocal(x, z)[0]),
    head: (x, _y, z) => smoothstep(0.2, 0.6, toLocal(x, z)[0]),
    blowhole: (x, y, z) => {
      const [lx, lz] = toLocal(x, z);
      return smoothstep(0.22, 0.0, len3(lx - 0.22, y - 0.3, lz));
    },
  },
});
