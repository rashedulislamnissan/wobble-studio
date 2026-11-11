/** Mochi: a soft, slightly slumped rice-cake dome with a sleepy little face and a dusting. */
import { lin, mix, noise3, smoothstep, type RGB } from '../color';
import { intersect, len2, type Sdf } from '../sdf';
import type { ShapeBuilder } from '../types';

const RX = 0.56, RY = 0.34, RZ = 0.52;

const sdf: Sdf = intersect((x, y, z) => {
  // A dome that slumps outward near the base, like soft dough settling.
  const slump = 1 + 0.12 * smoothstep(0.18, 0, y);
  const px = x / (RX * slump), py = (y - 0.02) / RY, pz = z / (RZ * slump);
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  return (k0 - 1) * Math.min(RX, RY, RZ);
}, (_x, y) => -y);

export const mochi: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-0.64, 0, -0.6], max: [0.64, 0.38, 0.6] },
  size: 1.28,
  inflate: 0.36,
  look: { roughness: 0.62, sheen: 0.7, bumps: [{ pattern: 'grain', scale: 95, depth: 0.0009 }] },
  surface: () => [0.66, 0.05, 1, 0],
  color: (v) => {
    const body = lin(v.color);
    const dust = mix(body, [1, 1, 1], 0.55);
    const ink = lin('#4B3A3A');
    const blush = mix(lin('#F28FA8'), body, 0.3);
    return (x, y, z, _nx, _ny, nz): RGB => {
      // Rice-flour dusting: soft pale speckles.
      let c = mix(body, dust, smoothstep(0.68, 0.9, noise3(x * 26, y * 26, z * 26)) * 0.7);
      if (z > 0.2 && nz > 0.4) {
        // Sleepy closed eyes: two little downward arcs.
        for (const ex of [-0.13, 0.13]) {
          const dx = x - ex;
          const arc = 0.23 + 4.5 * dx * dx;
          if (Math.abs(dx) < 0.045 && Math.abs(y - arc) < 0.007) return ink;
        }
        // Tiny mouth and blush.
        if (Math.abs(x) < 0.018 && Math.abs(y - 0.17) < 0.006) return ink;
        const ch = ((Math.abs(x) - 0.24) / 0.06) ** 2 + ((y - 0.18) / 0.035) ** 2;
        if (ch < 1) c = mix(blush, c, smoothstep(0.3, 1, ch));
      }
      void len2;
      return c;
    };
  },
});
