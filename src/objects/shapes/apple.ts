/** Apple: plump lathe-like body with soft top and bottom dimples, stem and leaf. */
import { CylinderGeometry, SphereGeometry } from 'three/webgpu';
import { paint } from '../build';
import { fbm, lin, mix, noise3, smoothstep, type RGB } from '../color';
import { ellipsoid, intersect, smoothUnion, sphere, subtract, type Sdf } from '../sdf';
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
  look: { roughness: 0.32, clearcoat: 0.55, detail: 'speckle' },
  color: (v) => {
    const p = palette(v);
    return (x, y, z): RGB => {
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
