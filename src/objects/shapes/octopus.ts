/** Octopus jelly: a round mantle on eight curling arms, splayed on the table. */
import { lin, mix, smoothstep } from '../color';
import { capsule, ellipsoid, len2, smin, type Sdf } from '../sdf';
import type { ShapeBuilder } from '../types';
import { eyes } from './parts';

const ARMS = 8;
const TURN = 0.2;

/** Each arm is three tapering capsules curling sideways and lifting at the tip. */
const armSegments: Sdf[] = [];
for (let a = 0; a < ARMS; a++) {
  const th = TURN + (a / ARMS) * Math.PI * 2;
  const pt = (r: number, y: number, twist: number): [number, number, number] => [
    Math.cos(th + twist) * r,
    y,
    Math.sin(th + twist) * r,
  ];
  const p0 = pt(0.12, 0.17, 0);
  const p1 = pt(0.38, 0.08, 0.08);
  const p2 = pt(0.6, 0.075, 0.3);
  const p3 = pt(0.66, 0.17, 0.62);
  armSegments.push(capsule(...p0, ...p1, 0.11, 0.085));
  armSegments.push(capsule(...p1, ...p2, 0.085, 0.06));
  armSegments.push(capsule(...p2, ...p3, 0.06, 0.035));
}
const mantle = ellipsoid(0, 0.44, -0.04, 0.33, 0.36, 0.31);

const sdf: Sdf = (x, y, z) => {
  let d = mantle(x, y, z);
  // Cheap reject: arms only matter near the floor ring.
  if (y < 0.36) for (const seg of armSegments) d = smin(d, seg(x, y, z), 0.07);
  return Math.max(d, -y);
};

export const octopus: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-0.78, 0, -0.78], max: [0.78, 0.81, 0.78] },
  size: 1.56,
  color: (v) => {
    const c = lin(v.color);
    const under = mix(c, [1, 1, 1], 0.35);
    return (x, y, z) => {
      // Paler undersides of the arms (suckers side).
      const r = len2(x, z);
      return mix(c, under, smoothstep(0.12, 0.04, y) * smoothstep(0.2, 0.35, r));
    };
  },
  details: () =>
    eyes(sdf, [[0.11, 0.48, 0.05], [-0.11, 0.48, 0.05]], (i) => [i === 0 ? 0.35 : -0.35, 0.05, 1], 0.055, {
      stretchY: 1.15,
    }),
  regions: {
    arms: (x, y, z) => smoothstep(0.3, 0.12, y) * smoothstep(0.2, 0.4, len2(x, z)),
  },
});
