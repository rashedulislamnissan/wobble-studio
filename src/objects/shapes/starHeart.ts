/** Star and Heart jellies: pillowy extruded outlines standing upright. */
import { lin, mix, smoothstep } from '../color';
import { intersect, type Sdf } from '../sdf';
import type { ShapeBuilder } from '../types';
import { extrude, heart2, star2, yaw } from './parts';

const TURN = 0.3;

// ------------------------------------------------------------------ star

const STAR_R = 0.56;
const STAR_CY = STAR_R * Math.cos(Math.PI / 5) + 0.04;
const starLocal: Sdf = (x, y, z) => {
  const d2 = star2(x, y - STAR_CY, STAR_R, 0.46) - 0.045; // softened points
  return extrude(d2, z, 0.26, 0.2);
};
// The two lower points are blunted into feet so the star stands.
const starSdf: Sdf = intersect((x, y, z) => {
  const [lx, lz] = yaw(x, z, -TURN);
  return starLocal(lx, y, lz);
}, (_x, y) => 0.08 - y, 0.03);

export const star: ShapeBuilder = () => ({
  sdf: starSdf,
  bounds: { min: [-0.68, 0, -0.45], max: [0.68, STAR_CY + STAR_R + 0.08, 0.45] },
  size: 1.2,
  ballast: 3.5,
  color: (v) => {
    const c = lin(v.color);
    const glow = mix(c, [1, 1, 1], 0.25);
    // A slightly brighter centre, like light pooling in a moulded jelly.
    return (x, y, z) => {
      const [lx] = yaw(x, z, -TURN);
      return mix(c, glow, smoothstep(0.3, 0.0, Math.hypot(lx, y - STAR_CY)) * 0.6);
    };
  },
});

// ------------------------------------------------------------------ heart

const HEART_S = 0.95;
const heartLocal: Sdf = (x, y, z) => {
  const d2 = heart2(x / HEART_S, (y + 0.04) / HEART_S) * HEART_S - 0.02;
  return extrude(d2, z, 0.26, 0.21);
};
const heartSdf: Sdf = intersect((x, y, z) => {
  const [lx, lz] = yaw(x, z, -TURN);
  return heartLocal(lx, y, lz);
}, (_x, y) => 0.13 - y, 0.04); // a small flat base under the tip

export const heart: ShapeBuilder = () => ({
  sdf: heartSdf,
  bounds: { min: [-0.62, 0, -0.45], max: [0.62, 1.0, 0.45] },
  size: 1.24,
  ballast: 3.5,
  color: (v) => {
    const c = lin(v.color);
    const glow = mix(c, [1, 1, 1], 0.22);
    return (x, y, z) => {
      const [lx] = yaw(x, z, -TURN);
      return mix(c, glow, smoothstep(0.32, 0.0, Math.hypot(lx, y - 0.55)) * 0.55);
    };
  },
});
