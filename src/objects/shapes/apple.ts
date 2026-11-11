/** Apple: plump lathe-like body with soft top and bottom dimples, stem and leaf. */
import { CylinderGeometry, SphereGeometry } from 'three/webgpu';
import { paint } from '../build';
import { fbm, lin, mix, noise3, smoothstep, type RGB } from '../color';
import { ellipsoid, intersect, smoothUnion, sphere, subtract, type Sdf, len2, len3 } from '../sdf';
import type { ShapeBuilder, Variant } from '../types';

const body: Sdf = smoothUnion(
  0.18,
  ellipsoid(0, 0.43, 0, 0.47, 0.42, 0.47),
  ellipsoid(0, 0.27, 0, 0.37, 0.29, 0.37),
);
const dimpled: Sdf = subtract(subtract(body, sphere(0, 0.9, 0, 0.13), 0.14), sphere(0, -0.06, 0, 0.1), 0.1);
/** A slightly flattened base: apples sit upright instead of rolling like balls. */
const sdf: Sdf = intersect(dimpled, (_x, y) => 0.035 - y, 0.08);

const PALETTES: Record<string, { skin: string; streak: string; blush: string }> = {
  red: { skin: '#C42A2E', streak: '#E7A23E', blush: '#8E1B22' },
  green: { skin: '#8CC63F', streak: '#D2DE6A', blush: '#6FA22C' },
  gold: { skin: '#E8C547', streak: '#F4DE7E', blush: '#E39A3A' },
};

function palette(v: Variant) {
  const p = PALETTES[v.id] ?? PALETTES.red;
  return { skin: lin(p.skin), streak: lin(p.streak), blush: lin(p.blush) };
}

export const apple: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-0.48, -0.0, -0.48], max: [0.48, 0.86, 0.48] },
  size: 0.96,
  look: {
    roughness: 0.32,
    clearcoat: 0.85,
    detail: 'speckle',
    smoothCoat: true,
    bumps: [
      { pattern: 'grain', scale: 120, depth: 0.00028 },
      { pattern: 'cells', scale: 75, depth: 0.0022 },
    ],
  },
  surface: (_x, _y, _z, _nx, _ny, _nz, depth) => (depth > 0.014 ? [0.55, 0.3, 0, 1] : [0.33, 0.9, 1, 0]),
  color: (v) => {
    const p = palette(v);
    const flesh = lin('#F7EED2');
    const fleshDeep = lin('#EADBA9');
    const seed = lin('#4A2C17');
    return (x, y, z, _nx, _ny, _nz, depth = 0): RGB => {
      if (depth > 0.014) {
        // Inside: pale flesh, a faint core star, five seeds around the axis.
        const r = len2(x, z);
        const a = Math.atan2(z, x);
        const coreY = smoothstep(0.18, 0.32, y) * smoothstep(0.7, 0.56, y);
        let c = mix(flesh, fleshDeep, smoothstep(0.12, 0.05, r) * coreY * 0.8 + noise3(x * 30, y * 30, z * 30) * 0.12);
        for (let k = 0; k < 5; k++) {
          const sa = (k / 5) * Math.PI * 2;
          const sx = Math.cos(sa) * 0.06, sz = Math.sin(sa) * 0.06;
          if (len3((x - sx) * 1.6, (y - 0.43) * 0.9, (z - sz) * 1.6) < 0.045) c = seed;
        }
        void a;
        // A thin band of skin colour right at the rim.
        return mix(p.skin, c, smoothstep(0.014, 0.03, depth));
      }
      const a = Math.atan2(z, x);
      // Vertical streaks that fade toward the shoulders and the base.
      // Fine, broken vertical streaks (many thin ones, not a few wide bands).
      const warp = noise3(x * 3, y * 3, z * 3) * 1.6;
      const streak = noise3(Math.cos(a + warp * 0.2) * 14, y * 1.4 + warp, Math.sin(a + warp * 0.2) * 14);
      const shoulder = smoothstep(0.62, 0.86, y) + smoothstep(0.18, 0.0, y);
      let c = mix(p.skin, p.streak, smoothstep(0.55, 0.85, streak) * 0.55 + shoulder * 0.4);
      c = mix(c, p.blush, smoothstep(0.45, 0.75, fbm(x * 3, y * 3, z * 3)) * 0.35);
      // Lenticels: tiny pale dots.
      const dot = smoothstep(0.82, 0.9, noise3(x * 70, y * 70, z * 70));
      return mix(c, p.streak, dot * 0.6);
    };
  },
  details: () => {
    const stem = new CylinderGeometry(0.017, 0.026, 0.2, 8, 1);
    stem.rotateZ(-0.2);
    stem.translate(0.02, 0.85, 0);
    const leaf = new SphereGeometry(1, 12, 8);
    leaf.scale(0.13, 0.014, 0.055);
    leaf.rotateY(0.6);
    leaf.rotateZ(0.35);
    leaf.translate(0.11, 0.88, 0.05);
    return [paint(stem, lin('#5E3B1E')), paint(leaf, lin('#5E9E33'))];
  },
});
