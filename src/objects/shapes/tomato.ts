/** Tomato: plump, softly ribbed, glossy, with a green calyx. Bursts under a hard press. */
import { CylinderGeometry, SphereGeometry, type BufferGeometry } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint } from '../build';
import { lin, mix, noise3, smoothstep, type RGB } from '../color';
import { intersect, len2, type Sdf } from '../sdf';
import type { ShapeBuilder, Variant } from '../types';

const R = 0.44;
const CY = 0.38;
const FLAT = 0.86;

const sdf: Sdf = intersect((x, y, z) => {
  const a = Math.atan2(z, x);
  const yy = (y - CY) / FLAT;
  // Six soft ribs, strongest around the shoulders.
  const rib = 1 + 0.035 * Math.cos(6 * a) * (1 - Math.abs(yy) / R);
  const top = y > CY ? 0.05 * Math.exp(-((x * x + z * z) / 0.01)) : 0; // stem dimple
  return (len2(len2(x, z) / rib, yy) - R) * 0.95 + top;
}, (_x, y) => 0.02 - y, 0.06);

const PALETTES: Record<string, { skin: string; shoulder: string; gel: string; wall: string }> = {
  red: { skin: '#DC3A28', shoulder: '#E8622C', gel: '#F07B50', wall: '#E34A33' },
  yellow: { skin: '#F2C230', shoulder: '#F4D45A', gel: '#F8DC7A', wall: '#F2C838' },
};

function palette(v: Variant) {
  const p = PALETTES[v.id] ?? PALETTES.red;
  return { skin: lin(p.skin), shoulder: lin(p.shoulder), gel: lin(p.gel), wall: lin(p.wall), seed: lin('#F4E2A2') };
}

export const tomato: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-0.48, 0, -0.48], max: [0.48, CY + R * FLAT + 0.02, 0.48] },
  size: 0.96,
  look: { roughness: 0.16, clearcoat: 1 },
  color: (v) => {
    const p = palette(v);
    return (x, y, z, _nx, _ny, _nz, depth = 0): RGB => {
      if (depth > 0.025) {
        // Inside: walls between seed chambers, glossy gel and seeds.
        const a = Math.atan2(z, x);
        const r = len2(x, z);
        const chamber = Math.cos(5 * a) > -0.2 && r > 0.1 && r < 0.32;
        if (!chamber) return p.wall;
        const seed = noise3(x * 55, y * 55, z * 55) > 0.78;
        return seed ? p.seed : p.gel;
      }
      const shoulder = smoothstep(CY + 0.1, CY + R * FLAT, y) * 0.5;
      return mix(p.skin, p.shoulder, shoulder + noise3(x * 8, y * 8, z * 8) * 0.12);
    };
  },
  details: () => {
    const green = lin('#3F7F2A');
    const topY = CY + R * FLAT * 0.97;
    const parts: BufferGeometry[] = [];
    for (let k = 0; k < 5; k++) {
      const leaf = new SphereGeometry(1, 10, 6);
      leaf.scale(0.12, 0.012, 0.035);
      leaf.translate(0.1, 0, 0);
      leaf.rotateZ(-0.25);
      leaf.rotateY((k / 5) * Math.PI * 2 + 0.3);
      parts.push(leaf.toNonIndexed());
    }
    const calyx = mergeGeometries(parts)!;
    calyx.translate(0, topY, 0);
    const stem = new CylinderGeometry(0.014, 0.022, 0.09, 8);
    stem.translate(0, topY + 0.04, 0);
    return [paint(calyx, green), paint(stem, green)];
  },
});
