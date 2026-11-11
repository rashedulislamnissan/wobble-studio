/** Shared building blocks for object shapes: 2D outlines, extrusion, eyes, surface finding. */
import { SphereGeometry, type BufferGeometry } from 'three/webgpu';
import { paint } from '../build';
import { lin } from '../color';
import { len2, len3, type Sdf } from '../sdf';

/** Inigo Quilez's five-point star, radius r, inner ratio rf. Point up. */
export function star2(px: number, py: number, r: number, rf: number) {
  const k1x = 0.809016994375, k1y = -0.587785252292;
  const k2x = -k1x, k2y = k1y;
  let x = Math.abs(px), y = py;
  let d = 2 * Math.max(k1x * x + k1y * y, 0);
  x -= d * k1x; y -= d * k1y;
  d = 2 * Math.max(k2x * x + k2y * y, 0);
  x -= d * k2x; y -= d * k2y;
  x = Math.abs(x);
  y -= r;
  const bax = rf * -k1y, bay = rf * k1x - 1;
  const h = Math.min(r, Math.max(0, (x * bax + y * bay) / (bax * bax + bay * bay)));
  return len2(x - bax * h, y - bay * h) * Math.sign(y * bax - x * bay);
}

/** Inigo Quilez's heart: tip at (0,0), lobes reach y ≈ 1, half-width ≈ 0.6. */
export function heart2(px: number, py: number) {
  const x = Math.abs(px), y = py;
  if (y + x > 1) return len2(x - 0.25, y - 0.75) - Math.SQRT2 / 4;
  const m = 0.5 * Math.max(x + y, 0);
  const a = (x - 0) ** 2 + (y - 1) ** 2;
  const b = (x - m) ** 2 + (y - m) ** 2;
  return Math.sqrt(Math.min(a, b)) * Math.sign(x - y);
}

/**
 * Extrude a 2D distance along z with rounded edges. A large `round` (close to halfT)
 * gives a soft, pillowy jelly-mould profile.
 */
export function extrude(d2: number, z: number, halfT: number, round: number) {
  const wx = d2 + round;
  const wy = Math.abs(z) - halfT + round;
  return Math.min(Math.max(wx, wy), 0) + len2(Math.max(wx, 0), Math.max(wy, 0)) - round;
}

/** Distance along a ray from `o` in direction `d` to the surface (bisection). */
export function surfaceAlong(sdf: Sdf, o: [number, number, number], d: [number, number, number], maxT = 2): number {
  let lo = 0, hi = maxT;
  const inside0 = sdf(o[0], o[1], o[2]) < 0;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const inside = sdf(o[0] + d[0] * mid, o[1] + d[1] * mid, o[2] + d[2] * mid) < 0;
    if (inside === inside0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Glossy eyes on the surface: a dark ball sunk partly into the body plus a tiny white
 * catch-light, placed by casting from an interior point toward `dir`.
 */
export function eyes(
  sdf: Sdf,
  from: [number, number, number][],
  dir: (i: number) => [number, number, number],
  radius: number,
  opts: { sink?: number; highlight?: boolean; color?: string; stretchY?: number } = {},
): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const dark = lin(opts.color ?? '#15121A');
  const white = lin('#FFFFFF');
  from.forEach((o, i) => {
    const d = dir(i);
    const l = len3(d[0], d[1], d[2]);
    const n: [number, number, number] = [d[0] / l, d[1] / l, d[2] / l];
    const t = surfaceAlong(sdf, o, n) - radius * (opts.sink ?? 0.45);
    const c: [number, number, number] = [o[0] + n[0] * t, o[1] + n[1] * t, o[2] + n[2] * t];
    const g = new SphereGeometry(radius, 18, 14);
    if (opts.stretchY) g.scale(1, opts.stretchY, 1);
    g.translate(c[0], c[1], c[2]);
    out.push(paint(g, dark));
    if (opts.highlight !== false) {
      const hl = new SphereGeometry(radius * 0.32, 10, 8);
      const off = radius * 0.62;
      hl.translate(c[0] + n[0] * off - 0.35 * radius, c[1] + n[1] * off + 0.42 * radius * (opts.stretchY ?? 1), c[2] + n[2] * off);
      out.push(paint(hl, white));
    }
  });
  return out;
}

/** Rotate (x, z) about the y axis by angle a. */
export const yaw = (x: number, z: number, a: number): [number, number] => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c * x - s * z, s * x + c * z];
};
