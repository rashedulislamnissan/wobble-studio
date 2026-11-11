/** Watermelon wedge: striped rind, pale inner rind, juicy flesh and glossy black seeds. */
import { SphereGeometry, type BufferGeometry } from 'three/webgpu';
import { paint } from '../build';
import { lin, mix, noise3, smoothstep, type RGB } from '../color';
import { intersect, len2, type Sdf } from '../sdf';
import { seededRandom } from '../../sim/lattice';
import type { ShapeBuilder, Variant } from '../types';
import { extrude, surfaceAlong, yaw } from './parts';

const R = 0.84;
const HALF = 0.5; // half opening angle
const HALF_T = 0.17;
const TIP_Y = R; // tip at top, rind arc at the bottom
const TURN = -0.45;

/** 2D sector distance, apex at origin, opening toward +y. */
function sector(px: number, py: number) {
  const sc = Math.sin(HALF), cc = Math.cos(HALF);
  const qx = Math.abs(px), qy = py;
  const l = len2(qx, qy) - R;
  const t = Math.min(R, Math.max(0, qx * sc + qy * cc));
  const m = len2(qx - sc * t, qy - cc * t);
  return Math.max(l, m * Math.sign(cc * qx - sc * qy));
}

const local: Sdf = (x, y, z) => extrude(sector(x, TIP_Y - y) - 0.012, z, HALF_T, 0.04);
const sdf: Sdf = intersect((x, y, z) => {
  const [lx, lz] = yaw(x, z, -TURN);
  return local(lx, y, lz);
}, (_x, y) => 0.03 - y, 0.05);

const PALETTES: Record<string, { flesh: string; fleshDeep: string }> = {
  classic: { flesh: '#EC4F5E', fleshDeep: '#D63A4C' },
  yellow: { flesh: '#F7D45E', fleshDeep: '#EFBF3A' },
};

function palette(v: Variant) {
  const p = PALETTES[v.id] ?? PALETTES.classic;
  return {
    flesh: lin(p.flesh),
    fleshDeep: lin(p.fleshDeep),
    rindDark: lin('#2E6A2C'),
    rindLight: lin('#6FA84A'),
    inner: lin('#BFDB8E'),
    white: lin('#F3F1DA'),
  };
}

export const watermelon: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-0.62, 0, -0.55], max: [0.62, TIP_Y + 0.02, 0.55] },
  size: 1.0,
  look: {
    roughness: 0.32,
    clearcoat: 0.7,
    bumps: [
      { pattern: 'grain', scale: 60, depth: 0.0008 },
      { pattern: 'cells', scale: 24, depth: 0.0045 },
    ],
  },
  surface: (x, y, z) => {
    const [lx] = yaw(x, z, -TURN);
    const r = len2(lx, TIP_Y - y);
    if (r > R - 0.065) return [0.3, 0.75, 1, 0];
    if (r > R - 0.11) return [0.45, 0.4, 0, 0.3];
    return [0.24, 0.9, 0, 1];
  },
  color: (v) => {
    const p = palette(v);
    return (x, y, z): RGB => {
      const [lx, lz] = yaw(x, z, -TURN);
      const r = len2(lx, TIP_Y - y);
      if (r > R - 0.035) {
        // Outer rind: wavy dark and light stripes running around the melon.
        const stripe = Math.sin(lz * 34 + noise3(lx * 6, y * 6, lz * 6) * 3);
        return mix(p.rindLight, p.rindDark, smoothstep(-0.2, 0.3, stripe));
      }
      if (r > R - 0.065) return p.inner;
      // Pale band between rind and flesh, fading into the red.
      if (r > R - 0.11) return mix(p.white, p.flesh, smoothstep(R - 0.075, R - 0.11, r));
      const grain = noise3(lx * 26, y * 26, lz * 26);
      return mix(p.flesh, p.fleshDeep, grain * 0.35 + smoothstep(R - 0.2, R - 0.11, r) * 0.2);
    };
  },
  details: () => {
    // Seeds half-sunk into both flat faces, in two loose arcs.
    const rand = seededRandom(0x3ee5);
    const seeds: BufferGeometry[] = [];
    const black = lin('#1C1411');
    for (const face of [1, -1]) {
      for (let k = 0; k < 13; k++) {
        const ring = k % 2 ? 0.48 : 0.62;
        const a = (rand() * 2 - 1) * (HALF - 0.12);
        const lx = Math.sin(a) * ring * R;
        const ly = TIP_Y - Math.cos(a) * ring * R;
        const [wx, wz] = yaw(lx, 0, TURN);
        const [nx, nz] = yaw(0, face, TURN);
        const t = surfaceAlong(sdf, [wx, ly, wz], [nx, 0, nz], 0.5);
        const s = new SphereGeometry(0.022, 10, 8);
        s.scale(0.7, 1.35, 0.55);
        s.rotateZ(-a * 0.8);
        s.rotateY(TURN);
        s.translate(wx + nx * (t - 0.006), ly, wz + nz * (t - 0.006));
        seeds.push(paint(s, black));
      }
    }
    return seeds;
  },
  regions: {
    flesh: (x, y, z) => smoothstep(R - 0.1, R - 0.3, len2(yaw(x, z, -TURN)[0], TIP_Y - y)),
  },
});
