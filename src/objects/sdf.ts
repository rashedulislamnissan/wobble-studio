/**
 * Small signed-distance-function toolkit for building objects in code.
 * Every function returns a distance (negative inside). Shapes compose with smooth
 * unions so soft objects get soft, organic joins.
 */
import type { Sdf } from '../sim/lattice';

export type { Sdf };

export const sphere = (cx: number, cy: number, cz: number, r: number): Sdf => (x, y, z) =>
  Math.hypot(x - cx, y - cy, z - cz) - r;

/** Ellipsoid (Inigo Quilez's bound; good enough for meshing and lattice tests). */
export const ellipsoid =
  (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): Sdf =>
  (x, y, z) => {
    const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
    const k0 = Math.hypot(px, py, pz);
    const k1 = Math.hypot(px / rx, py / ry, pz / rz);
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
  };

export const roundBox =
  (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, r: number): Sdf =>
  (x, y, z) => {
    const qx = Math.abs(x - cx) - hx + r;
    const qy = Math.abs(y - cy) - hy + r;
    const qz = Math.abs(z - cz) - hz + r;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
  };

/** Capsule between two points with radii ra → rb (a rounded cone). */
export const capsule =
  (ax: number, ay: number, az: number, bx: number, by: number, bz: number, ra: number, rb = ra): Sdf =>
  (x, y, z) => {
    const pax = x - ax, pay = y - ay, paz = z - az;
    const bax = bx - ax, bay = by - ay, baz = bz - az;
    const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
    return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - (ra + (rb - ra) * h);
  };

/** Vertical capped cylinder with rounded edges. */
export const roundCylinder =
  (cx: number, cy: number, cz: number, r: number, halfH: number, round: number): Sdf =>
  (x, y, z) => {
    const dx = Math.hypot(x - cx, z - cz) - r + round;
    const dy = Math.abs(y - cy) - halfH + round;
    return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - round;
  };

/** Torus lying in the XZ plane. */
export const torus = (cx: number, cy: number, cz: number, R: number, r: number): Sdf => (x, y, z) =>
  Math.hypot(Math.hypot(x - cx, z - cz) - R, y - cy) - r;

/** Solid of revolution around Y from a 2D profile distance (r = radial distance). */
export const lathe = (profile: (r: number, y: number) => number): Sdf => (x, y, z) =>
  profile(Math.hypot(x, z), y);

// ------------------------------------------------------------------ operators

export const union = (...fs: Sdf[]): Sdf => (x, y, z) => {
  let d = Infinity;
  for (const f of fs) d = Math.min(d, f(x, y, z));
  return d;
};

/** Polynomial smooth minimum: blends shapes over distance k. */
export function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

export const smoothUnion = (k: number, ...fs: Sdf[]): Sdf => (x, y, z) => {
  let d = fs[0](x, y, z);
  for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y, z), k);
  return d;
};

export const subtract = (a: Sdf, b: Sdf, k = 0): Sdf => (x, y, z) =>
  k > 0 ? -smin(-a(x, y, z), b(x, y, z), k) : Math.max(a(x, y, z), -b(x, y, z));

export const intersect = (a: Sdf, b: Sdf, k = 0): Sdf => (x, y, z) =>
  k > 0 ? -smin(-a(x, y, z), -b(x, y, z), k) : Math.max(a(x, y, z), b(x, y, z));

export const translate = (f: Sdf, tx: number, ty: number, tz: number): Sdf => (x, y, z) =>
  f(x - tx, y - ty, z - tz);

/** Rotate a shape about the Z axis by angle (radians). */
export const rotateZ = (f: Sdf, a: number): Sdf => {
  const c = Math.cos(-a), s = Math.sin(-a);
  return (x, y, z) => f(c * x - s * y, s * x + c * y, z);
};

export const rotateY = (f: Sdf, a: number): Sdf => {
  const c = Math.cos(-a), s = Math.sin(-a);
  return (x, y, z) => f(c * x + s * z, y, -s * x + c * z);
};

export const rotateX = (f: Sdf, a: number): Sdf => {
  const c = Math.cos(-a), s = Math.sin(-a);
  return (x, y, z) => f(x, c * y - s * z, s * y + c * z);
};

/** Mirror across the Z=0 plane (|z|): symmetric left/right details. */
export const mirrorZ = (f: Sdf): Sdf => (x, y, z) => f(x, y, Math.abs(z));

/** 2D helpers for lathe profiles. */
export const box2 = (px: number, py: number, hx: number, hy: number, r = 0) => {
  const qx = Math.abs(px) - hx + r;
  const qy = Math.abs(py) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

/** Cheap deterministic hash noise in [0, 1). */
export function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
