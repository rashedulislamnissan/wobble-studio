/**
 * Puffy — an original character (CLAUDE.md §6): a round marshmallow-jelly puffball with a
 * small curly tuft, huge sparkly glossy eyes, blush cheeks, a tiny smile and two stubby
 * feet. Designed to read as its own character, not any existing mascot.
 */
import { SphereGeometry } from 'three/webgpu';
import { paint } from '../build';
import { lin, mix, smoothstep } from '../color';
import { ellipsoid, intersect, smin, sphere, type Sdf } from '../sdf';
import type { ShapeBuilder } from '../types';
import { eyes, surfaceAlong } from './parts';

const R = 0.5;
const CY = 0.47;
const tuft = [sphere(0.0, 0.94, 0.0, 0.075), sphere(0.06, 1.01, 0.02, 0.058), sphere(0.02, 1.07, 0.07, 0.045), sphere(-0.05, 1.08, 0.04, 0.034)];

const sdf: Sdf = intersect((x, y, z) => {
  let d = ellipsoid(0, CY, 0, R, 0.47, 0.48)(x, y, z);
  for (const t of tuft) d = smin(d, t(x, y, z), 0.05);
  d = smin(d, ellipsoid(0.18, 0.05, 0.2, 0.12, 0.065, 0.12)(x, y, z), 0.06);
  d = smin(d, ellipsoid(-0.18, 0.05, 0.2, 0.12, 0.065, 0.12)(x, y, z), 0.06);
  return d;
}, (_x, y) => -y);

const EYE_Y = 0.55;
const EYE_X = 0.17;

export const puffy: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-0.52, 0, -0.5], max: [0.52, 1.14, 0.5] },
  size: 1.14,
  ballast: 2,
  color: (v) => {
    const body = lin(v.color);
    const blush = mix(lin('#F27A9E'), body, 0.25);
    const smile = lin('#5A2A3A');
    return (x, y, z) => {
      if (z > 0.2) {
        // Blush cheeks: soft ovals under the eyes.
        const ch = Math.min(((Math.abs(x) - 0.3) / 0.085) ** 2 + ((y - 0.42) / 0.05) ** 2, 1);
        // Tiny smile: a short arc between the eyes.
        const sy = 0.44 - 3 * x * x;
        if (Math.abs(x) < 0.055 && Math.abs(y - sy) < 0.0075) return smile;
        if (ch < 1) return mix(blush, body, smoothstep(0.4, 1, ch));
      }
      return body;
    };
  },
  details: () => {
    const g = eyes(
      sdf,
      [[EYE_X, EYE_Y, 0.1], [-EYE_X, EYE_Y, 0.1]],
      (i) => [i === 0 ? 0.32 : -0.32, 0.06, 1],
      0.088,
      { stretchY: 1.28, sink: 0.55, color: '#2B1830' },
    );
    // A second, smaller sparkle in each eye.
    for (const side of [1, -1]) {
      const t = surfaceAlong(sdf, [EYE_X * side, EYE_Y, 0.1], [0.32 * side, 0.06, 1]);
      const n = Math.hypot(0.32, 0.06, 1);
      const cx = EYE_X * side + ((0.32 * side) / n) * t;
      const cz = 0.1 + (1 / n) * t;
      const s = new SphereGeometry(0.016, 8, 6);
      s.translate(cx + 0.03, EYE_Y - 0.045, cz + 0.035);
      g.push(paint(s, lin('#FFFFFF')));
    }
    return g;
  },
  regions: {
    top: (_x, y) => smoothstep(0.4, 0.95, y),
  },
});
