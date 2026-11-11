/** Soft loaf: a domed sandwich loaf with a golden crust, scored top and pale crumb inside. */
import { lin, mix, noise3, smoothstep, type RGB } from '../color';
import { capsule, ellipsoid, roundBox, smoothUnion, subtract, type Sdf } from '../sdf';
import type { ShapeBuilder, Variant } from '../types';
import { yaw } from './parts';

const TURN = 0.5;

const local: Sdf = (() => {
  const base = roundBox(0, 0.2, 0, 0.46, 0.2, 0.28, 0.07);
  const dome = ellipsoid(0, 0.36, 0, 0.47, 0.22, 0.29);
  let loaf: Sdf = smoothUnion(0.08, base, dome);
  // Three diagonal score marks across the top.
  for (const x of [-0.24, 0, 0.24]) loaf = subtract(loaf, capsule(x - 0.07, 0.6, -0.17, x + 0.07, 0.6, 0.17, 0.022), 0.03);
  return loaf;
})();

const sdf: Sdf = (x, y, z) => {
  const [lx, lz] = yaw(x, z, -TURN);
  return local(lx, y, lz);
};

const PALETTES: Record<string, { crust: string; crustTop: string; crumb: string }> = {
  white: { crust: '#D9A15C', crustTop: '#B06A2E', crumb: '#F6EAD2' },
  wheat: { crust: '#A86E3C', crustTop: '#7A4721', crumb: '#E2C9A2' },
};

function palette(v: Variant) {
  const p = PALETTES[v.id] ?? PALETTES.white;
  return { crust: lin(p.crust), top: lin(p.crustTop), crumb: lin(p.crumb) };
}

export const bread: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-0.6, 0, -0.6], max: [0.6, 0.6, 0.6] },
  size: 1.0,
  look: { roughness: 0.78, sheen: 0.5, detail: 'crumb' },
  color: (v) => {
    const p = palette(v);
    return (x, y, z, _nx, ny, _nz, depth = 0): RGB => {
      if (depth > 0.022) return mix(p.crumb, p.crust, noise3(x * 40, y * 40, z * 40) * 0.12);
      // Crust browns toward the top and in the score marks.
      const [lx, lz] = yaw(x, z, -TURN);
      let score = 0;
      for (const sx of [-0.24, 0, 0.24]) {
        const t = Math.max(-1, Math.min(1, lz / 0.17));
        score = Math.max(score, smoothstep(0.05, 0.02, Math.abs(lx - (sx + t * 0.07))) * smoothstep(0.5, 0.56, y));
      }
      const tan = smoothstep(0.25, 0.55, y) * Math.max(0, ny);
      return mix(mix(p.crust, p.top, tan * 0.85 + noise3(x * 12, y * 12, z * 12) * 0.15), p.crumb, score * 0.55);
    };
  },
  regions: {
    top: (_x, y) => smoothstep(0.25, 0.55, y),
  },
});
