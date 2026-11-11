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
  look: {
    roughness: 0.16,
    clearcoat: 1,
    smoothCoat: true,
    bumps: [
      { pattern: 'grain', scale: 70, depth: 0.0005 },
      { pattern: 'cells', scale: 32, depth: 0.003 },
    ],
  },
  surface: (_x, _y, _z, _nx, _ny, _nz, depth) => (depth > 0.025 ? [0.14, 1, 0, 1] : [0.1, 1, 1, 0]),
  color: (v) => {
    const p = palette(v);
    return (x, y, z, _nx, _ny, _nz, depth = 0): RGB => {
      if (depth > 0.025) {
        // Inside, in 3D: thick outer wall, pale central core, and oval gel chambers
        // (separated by thin walls) holding seeds - so any cut shows a real cross-section.
        const a = Math.atan2(z, x);
        const r = len2(x, z);
        const sector = Math.cos(5 * a); // 1 at chamber centres, -1 at the walls between
        const oval = ((y - CY) / 0.22) ** 2 + ((r - 0.19) / 0.12) ** 2;
        if (r < 0.075) return mix(p.wall, p.seed, 0.35); // core column
        if (sector > -0.55 && oval < 1) {
          const seed = noise3(x * 48, y * 48, z * 48) > 0.7 && oval > 0.25;
          return seed ? p.seed : mix(p.gel, p.wall, oval * 0.3);
        }
        return mix(p.wall, p.skin, smoothstep(0.32, 0.4, r) * 0.6);
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
