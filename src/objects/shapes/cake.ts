/**
 * Layer cake slice: a rounded wedge of three sponge layers and two cream layers, frosted
 * on top and on the back, with a cream rosette and a strawberry.
 */
import { LatheGeometry, SphereGeometry, Vector2, type BufferGeometry } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint } from '../build';
import { lin, mix, noise3, smoothstep, type RGB } from '../color';
import { smoothUnion, sphere, type Sdf, len2 } from '../sdf';
import type { ShapeBuilder, Variant } from '../types';

const R = 0.86;
const H = 0.6;
const HALF_ANGLE = 0.4;
const ROUND = 0.035;
/** Centroid of a circular sector, so the slice is centred on the origin. */
const CENTROID = (2 * R * Math.sin(HALF_ANGLE)) / (3 * HALF_ANGLE);
const TURN = 2.35; // tip toward the viewer, layered side on show
const cos = Math.cos(TURN);
const sin = Math.sin(TURN);
const toLocal = (x: number, z: number): [number, number] => [cos * x - sin * z + CENTROID, sin * x + cos * z];
const toWorld = (lx: number, lz: number): [number, number] => {
  const x = lx - CENTROID;
  return [cos * x + sin * lz, -sin * x + cos * lz];
};

/** Inigo Quilez's 2D pie (sector) distance, axis along +x. */
function pie(px: number, pz: number) {
  const sc = Math.sin(HALF_ANGLE), cc = Math.cos(HALF_ANGLE);
  const qx = Math.abs(pz);
  const qy = px;
  const l = len2(qx, qy) - R;
  const t = Math.min(R, Math.max(0, qx * sc + qy * cc));
  const m = len2(qx - sc * t, qy - cc * t);
  return Math.max(l, m * Math.sign(cc * qx - sc * qy));
}

const wedge: Sdf = (x, y, z) => {
  const [lx, lz] = toLocal(x, z);
  const d2 = pie(lx, lz) + ROUND;
  const dy = Math.abs(y - H / 2) - H / 2 + ROUND;
  return Math.min(Math.max(d2, dy), 0) + len2(Math.max(d2, 0), Math.max(dy, 0)) - ROUND;
};

const ROSETTE: [number, number, number] = [R * 0.68, H + 0.035, 0];
const rosetteWorld = toWorld(ROSETTE[0], ROSETTE[2]);
const sdf: Sdf = smoothUnion(0.04, wedge, sphere(rosetteWorld[0], ROSETTE[1], rosetteWorld[1], 0.085));

const LAYERS = [
  { to: 0.17, kind: 'sponge' },
  { to: 0.215, kind: 'cream' },
  { to: 0.385, kind: 'sponge' },
  { to: 0.43, kind: 'cream' },
  { to: 0.56, kind: 'sponge' },
  { to: 99, kind: 'frosting' },
] as const;

const PALETTES: Record<string, { sponge: string; spongeDark: string; cream: string; frosting: string }> = {
  vanilla: { sponge: '#EFD39A', spongeDark: '#D4AE6C', cream: '#FAEEDB', frosting: '#F5E8D2' },
  chocolate: { sponge: '#6B3E26', spongeDark: '#4E2A18', cream: '#EEDCC4', frosting: '#3F2316' },
  strawberry: { sponge: '#F2D7A8', spongeDark: '#D9B278', cream: '#F4A9BA', frosting: '#EE97AB' },
};

function palette(v: Variant) {
  const p = PALETTES[v.id] ?? PALETTES.vanilla;
  return { sponge: lin(p.sponge), spongeDark: lin(p.spongeDark), cream: lin(p.cream), frosting: lin(p.frosting) };
}

export const cake: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-0.75, 0, -0.75], max: [0.75, H + 0.13, 0.75] },
  size: 1.1,
  look: { roughness: 0.82, clearcoat: 0, sheen: 0.4, detail: 'crumb' },
  color: (v) => {
    const p = palette(v);
    return (x, y, z): RGB => {
      const [lx, lz] = toLocal(x, z);
      const r = len2(lx, lz);
      if (y > H - 0.03 || r > R - 0.035) return p.frosting;
      const layer = LAYERS.find((l) => y < l.to)!;
      if (layer.kind === 'cream') return p.cream;
      if (layer.kind === 'frosting') return p.frosting;
      // Sponge crumb: mottled with darker pores, slightly toasted near the base.
      const crumb = noise3(x * 34, y * 34, z * 34);
      const pores = smoothstep(0.62, 0.8, noise3(x * 70 + 3, y * 70, z * 70));
      const toast = smoothstep(0.05, 0.0, y) * 0.5;
      return mix(mix(p.sponge, p.spongeDark, crumb * 0.35 + pores * 0.5), p.spongeDark, toast);
    };
  },
  details: () => {
    const [bx, bz] = rosetteWorld;
    const by = ROSETTE[1] + 0.055;
    return [paint(strawberry(bx, by, bz), lin('#D21F35')), paint(leaves(bx, by + 0.15, bz), lin('#4C8B2B')), paint(seeds(bx, by, bz), lin('#F4D27A'))];
  },
});

/** A plump strawberry: lathe profile, tip down into the cream. */
function strawberry(x: number, y: number, z: number): BufferGeometry {
  const pts: Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12; // 0 = tip, 1 = shoulder
    const r = 0.078 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.55) * (1 - Math.pow(t, 6) * 0.35);
    pts.push(new Vector2(Math.max(0.001, r), t * 0.16));
  }
  pts.push(new Vector2(0.001, 0.165));
  const g = new LatheGeometry(pts, 18);
  g.translate(x, y, z);
  return g;
}

/** Five pointed sepals fanned out on top of the berry. */
function leaves(x: number, y: number, z: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const leaf = new SphereGeometry(1, 8, 4);
    leaf.scale(0.05, 0.008, 0.018);
    leaf.translate(0.04, 0, 0);
    leaf.rotateZ(0.25);
    leaf.rotateY((k / 5) * Math.PI * 2);
    parts.push(leaf);
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  g.translate(x, y, z);
  return g;
}

/** Tiny golden seeds dotted over the berry. */
function seeds(x: number, y: number, z: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 22; k++) {
    const t = 0.25 + (k % 6) * 0.11;
    const a = k * 2.4;
    const r = 0.078 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.55) + 0.002;
    const s = new SphereGeometry(0.008, 4, 3);
    s.scale(1, 1.6, 1);
    s.translate(Math.cos(a) * r, t * 0.16, Math.sin(a) * r);
    parts.push(s.toNonIndexed());
  }
  const g = mergeGeometries(parts)!;
  g.translate(x, y, z);
  return g;
}
