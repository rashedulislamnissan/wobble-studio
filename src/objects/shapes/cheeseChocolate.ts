/** Cheese wedge (Swiss with holes, or cheddar) and a segmented chocolate bar that snaps. */
import { lin, mix, noise3, smoothstep, type RGB } from '../color';
import { len2, len3, type Sdf } from '../sdf';
import { seededRandom } from '../../sim/lattice';
import type { ShapeBuilder, Variant } from '../types';
import { yaw } from './parts';

// ------------------------------------------------------------------ cheese

const CR = 0.82;
const CH = 0.42;
const CHALF = 0.43;
const CTURN = 2.2;
const CCENTROID = (2 * CR * Math.sin(CHALF)) / (3 * CHALF);

function pie(px: number, pz: number) {
  const sc = Math.sin(CHALF), cc = Math.cos(CHALF);
  const qx = Math.abs(pz), qy = px;
  const l = len2(qx, qy) - CR;
  const t = Math.min(CR, Math.max(0, qx * sc + qy * cc));
  const m = len2(qx - sc * t, qy - cc * t);
  return Math.max(l, m * Math.sign(cc * qx - sc * qy));
}

const wedgeLocal = (lx: number, y: number, lz: number) => {
  const d2 = pie(lx, lz) + 0.025;
  const dy = Math.abs(y - CH / 2) - CH / 2 + 0.025;
  return Math.min(Math.max(d2, dy), 0) + len2(Math.max(d2, 0), Math.max(dy, 0)) - 0.025;
};

/** Swiss holes: spheres scattered through the wedge (some break the surface). */
const HOLES: [number, number, number, number][] = (() => {
  const rand = seededRandom(0xc4ee5e);
  const out: [number, number, number, number][] = [];
  for (let k = 0; k < 16; k++) {
    const r = 0.035 + rand() * 0.055;
    const ang = (rand() * 2 - 1) * (CHALF - 0.05);
    const rad = 0.18 + rand() * (CR - 0.22);
    out.push([Math.cos(ang) * rad, 0.05 + rand() * (CH - 0.1), Math.sin(ang) * rad, r]);
  }
  return out;
})();

function cheeseSdf(swiss: boolean): Sdf {
  return (x, y, z) => {
    const [ax, lz] = yaw(x, z, -CTURN);
    const lx = ax + CCENTROID;
    let d = wedgeLocal(lx, y, lz);
    if (swiss) for (const [hx, hy, hz, r] of HOLES) d = Math.max(d, r - len3(lx - hx, y - hy, lz - hz));
    return d;
  };
}

const CHEESE: Record<string, { body: string; rind: string }> = {
  swiss: { body: '#F4DC8C', rind: '#E8C25E' },
  cheddar: { body: '#F2A33A', rind: '#E58A22' },
};

/** Swiss has holes, cheddar doesn't: the registry rebuilds the object when variety changes. */
export const cheese: ShapeBuilder = (variant) => {
  const sdf = cheeseSdf(variant?.id !== 'cheddar');
  return {
    sdf,
    bounds: { min: [-0.62, 0, -0.62], max: [0.62, CH, 0.62] },
    size: 1.1,
    look: {
      roughness: 0.5,
      clearcoat: 0.2,
      bumps: [
        { pattern: 'grain', scale: 40, depth: 0.0012 },
        { pattern: 'cells', scale: 60, depth: 0.0008 },
      ],
    },
    surface: (_x: number, _y: number, _z: number, _nx: number, _ny: number, _nz: number, depth: number) =>
      depth > 0.01 ? [0.55, 0.1, 0.6, 1] : [0.46, 0.22, 1, 0.3],
    color: (v: Variant) => {
      const p = CHEESE[v.id] ?? CHEESE.swiss;
      const body = lin(p.body), rind = lin(p.rind);
      return (x, y, z, _nx, _ny, _nz, depth = 0): RGB => {
        const [ax, lz] = yaw(x, z, -CTURN);
        const r = len2(ax + CCENTROID, lz);
        const c = mix(body, rind, depth < 0.01 && r > CR - 0.03 ? 0.7 : 0);
        return mix(c, rind, noise3(x * 18, y * 18, z * 18) * 0.12);
      };
    },
  };
};

// ------------------------------------------------------------------ chocolate

const COLS = 4, ROWS = 3;
const SEG_X = 0.24, SEG_Z = 0.19, GAP = 0.025;
const BAR_W = COLS * SEG_X, BAR_D = ROWS * SEG_Z;
const BASE_H = 0.07, PILLOW_H = 0.075;
const KTURN = 0.42;

/** Rounded box distance at local offset (px, py, pz), inline: no closures in the hot path. */
function rbox(px: number, py: number, pz: number, hx: number, hy: number, hz: number, r: number) {
  const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r, qz = Math.abs(pz) - hz + r;
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

const chocoLocal: Sdf = (x, y, z) => {
  let d = rbox(x, y - BASE_H / 2, z, BAR_W / 2, BASE_H / 2, BAR_D / 2, 0.02);
  // One pillow per segment (repeat into the nearest cell).
  const ix = Math.max(0, Math.min(COLS - 1, Math.floor(x / SEG_X + COLS / 2)));
  const iz = Math.max(0, Math.min(ROWS - 1, Math.floor(z / SEG_Z + ROWS / 2)));
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const cx = ix + dx, cz = iz + dz;
      if (cx < 0 || cz < 0 || cx >= COLS || cz >= ROWS) continue;
      const px = (cx - COLS / 2 + 0.5) * SEG_X;
      const pz = (cz - ROWS / 2 + 0.5) * SEG_Z;
      d = Math.min(d, rbox(x - px, y - (BASE_H + PILLOW_H / 2 - 0.01), z - pz, SEG_X / 2 - GAP, PILLOW_H / 2, SEG_Z / 2 - GAP, 0.03));
    }
  }
  return d;
};

const chocoSdf: Sdf = (x, y, z) => {
  const [lx, lz] = yaw(x, z, -KTURN);
  return chocoLocal(lx, y, lz);
};

/** Snap planes along the grooves (rest space): [nx, ny, nz, d] with n·p = d. */
const SNAP: [number, number, number, number][] = (() => {
  const out: [number, number, number, number][] = [];
  const nx = yaw(1, 0, KTURN), nz = yaw(0, 1, KTURN);
  for (let c = 1; c < COLS; c++) out.push([nx[0], 0, nx[1], (c - COLS / 2) * SEG_X]);
  for (let r = 1; r < ROWS; r++) out.push([nz[0], 0, nz[1], (r - ROWS / 2) * SEG_Z]);
  return out;
})();

export const chocolate: ShapeBuilder = () => ({
  sdf: chocoSdf,
  bounds: { min: [-0.62, 0, -0.62], max: [0.62, BASE_H + PILLOW_H + 0.01, 0.62] },
  size: 1.0,
  look: { roughness: 0.2, clearcoat: 0.75, smoothCoat: true, bumps: [{ pattern: 'grain', scale: 18, depth: 0.0004 }] },
  surface: (_x, _y, _z, _nx, _ny, _nz, depth) => (depth > 0.01 ? [0.62, 0.05, 1, 0] : [0.18, 0.75, 1, 0]),
  snapPlanes: SNAP,
  color: (v) => {
    const c = lin(v.color);
    const bloom = mix(c, [1, 1, 1], 0.08);
    return (x, y, z): RGB => mix(c, bloom, smoothstep(0.6, 0.95, noise3(x * 14, y * 14, z * 14)) * 0.6);
  },
});
