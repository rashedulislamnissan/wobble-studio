/** Glazed donut: a soft torus, glossy glaze on top with a drippy edge, and sprinkles. */
import { CylinderGeometry, type BufferGeometry } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint } from '../build';
import { lin, mix, noise3, smoothstep, type RGB } from '../color';
import { len2, type Sdf } from '../sdf';
import { seededRandom } from '../../sim/lattice';
import type { ShapeBuilder, Variant } from '../types';
import { surfaceAlong } from './parts';

const RR = 0.36; // ring radius
const r0 = 0.18; // tube radius
const CY = r0 * 0.92;

const sdf: Sdf = (x, y, z) => len2(len2(x, z) - RR, (y - CY) / 0.92) * 0.92 - r0;

const GLAZE: Record<string, string> = { pink: '#F29BBE', chocolate: '#4E2A1A', vanilla: '#F7EBD3' };
const SPRINKLES = ['#F25C78', '#4FB3E8', '#F7D04A', '#7DD181', '#FFFFFF', '#B98AE0'];

/** Glaze covers the top, with a wavy drip line around the outside and the hole. */
function glazeLine(x: number, z: number) {
  const a = Math.atan2(z, x);
  return CY - 0.02 - 0.035 * Math.max(0, Math.sin(a * 7 + 1)) ** 2 - noise3(Math.cos(a) * 3, 0, Math.sin(a) * 3) * 0.03;
}

function palette(v: Variant) {
  return { glaze: lin(GLAZE[v.id] ?? GLAZE.pink), dough: lin('#D59A5A'), band: lin('#F0D2A0'), crumb: lin('#F3DDB0') };
}

export const donut: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-RR - r0, 0, -RR - r0], max: [RR + r0, CY + r0 + 0.01, RR + r0] },
  size: (RR + r0) * 2,
  look: { roughness: 0.55, clearcoat: 0.8, sheen: 0.3, detail: 'crumb' },
  color: (v) => {
    const p = palette(v);
    return (x, y, z, _nx, _ny, _nz, depth = 0): RGB => {
      if (depth > 0.02) return p.crumb;
      if (y > glazeLine(x, z)) return p.glaze;
      // Pale band around the equator where the dough rose in the fryer.
      const band = smoothstep(0.035, 0.0, Math.abs(y - CY + 0.04) - 0.01) * smoothstep(RR, RR + r0 * 0.8, len2(x, z));
      return mix(p.dough, p.band, band * 0.8);
    };
  },
  details: () => {
    // Sprinkles scattered on the glaze, deterministic so variants keep the same layout.
    const rand = seededRandom(0x5a1);
    const byColor = SPRINKLES.map(() => [] as BufferGeometry[]);
    for (let k = 0; k < 84; k++) {
      const a = rand() * Math.PI * 2;
      const rr = RR + (rand() * 2 - 1) * r0 * 0.75;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (CY + 0.05 < glazeLine(x, z)) continue;
      const t = surfaceAlong(sdf, [x, CY, z], [0, 1, 0], 0.4);
      const s = new CylinderGeometry(0.009, 0.009, 0.05, 6);
      s.rotateZ(Math.PI / 2);
      s.rotateY(rand() * Math.PI);
      s.translate(x, CY + t + 0.003, z);
      byColor[k % SPRINKLES.length].push(s.toNonIndexed());
    }
    return byColor.filter((g) => g.length).map((g, i) => paint(mergeGeometries(g)!, lin(SPRINKLES[i])));
  },
  regions: {
    top: (_x, y) => smoothstep(CY, CY + r0, y),
  },
});

export const SPRINKLE_COLORS = SPRINKLES;
