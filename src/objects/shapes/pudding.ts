/** Custard pudding: a rounded frustum with a glossy syrup top that drips down the sides. */
import { lin, mix, noise3, smoothstep, type RGB } from '../color';
import type { Sdf } from '../sdf';
import type { ShapeBuilder, Variant } from '../types';

const H = 0.56;
const R_BOTTOM = 0.47;
const R_TOP = 0.34;
const ROUND = 0.07;
const SLOPE = (R_TOP - R_BOTTOM) / H;
const SLOPE_NORM = Math.sqrt(1 + SLOPE * SLOPE);

const sdf: Sdf = (x, y, z) => {
  const r = Math.hypot(x, z);
  const rr = R_BOTTOM + SLOPE * Math.min(H, Math.max(0, y));
  const dr = (r - rr) / SLOPE_NORM + ROUND;
  const dy = Math.abs(y - H / 2) - H / 2 + ROUND;
  return Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0)) - ROUND;
};

const PALETTES: Record<string, { custard: string; custardDeep: string; syrup: string; syrupLight: string }> = {
  caramel: { custard: '#F4C95E', custardDeep: '#E5A63E', syrup: '#8C3A08', syrupLight: '#C9650F' },
  chocolate: { custard: '#8A5636', custardDeep: '#6E4027', syrup: '#2E170C', syrupLight: '#55301B' },
  matcha: { custard: '#B5CC7A', custardDeep: '#93AE58', syrup: '#4F6A22', syrupLight: '#6E8C34' },
};

function palette(v: Variant) {
  const p = PALETTES[v.id] ?? PALETTES.caramel;
  return { custard: lin(p.custard), custardDeep: lin(p.custardDeep), syrup: lin(p.syrup), syrupLight: lin(p.syrupLight) };
}

export const pudding: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-R_BOTTOM, 0, -R_BOTTOM], max: [R_BOTTOM, H, R_BOTTOM] },
  size: R_BOTTOM * 2,
  look: { roughness: 0.18, clearcoat: 0.85, detail: 'none' },
  color: (v) => {
    const p = palette(v);
    return (x, y, z): RGB => {
      const a = Math.atan2(z, x);
      // Drips: a few runs of syrup down the sides, varying in length.
      const run = Math.pow(Math.max(0, Math.sin(a * 4 + noise3(a * 2, 0, 0) * 3)), 3) * 0.16;
      const line = H - 0.05 - run - noise3(a * 9, 1, 1) * 0.025;
      if (y > line) {
        const glint = smoothstep(0.3, 0.9, noise3(x * 9, y * 9, z * 9));
        return mix(p.syrup, p.syrupLight, 0.25 + glint * 0.4);
      }
      // A thin darker band just under the syrup where it soaks in.
      const soak = smoothstep(line - 0.05, line, y) * 0.5;
      const body = mix(p.custard, p.custardDeep, smoothstep(H * 0.7, 0, y) * 0.35);
      return mix(body, p.custardDeep, soak);
    };
  },
  regions: {
    top: (_x, y) => smoothstep(H * 0.5, H, y),
  },
});
