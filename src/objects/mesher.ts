/**
 * Surface Nets mesher: SDF → closed, indexed triangle mesh with vertex colours.
 * Vertices are projected back onto the iso-surface for accuracy, so shapes stay crisp
 * at modest grid resolutions.
 */
import { BufferAttribute, BufferGeometry } from 'three/webgpu';
import type { Sdf, Vec3Tuple } from '../sim/lattice';
import { len3 } from './sdf';

/**
 * Vertex colour at a surface point. `depth` is how far inside the original shape the point
 * is: 0 on the skin, > 0 on faces exposed by cutting (shapes colour their interior there).
 */
export type ColorFn = (
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  depth?: number,
) => [number, number, number];

export interface MeshOptions {
  /** Grid cells across the largest dimension. */
  resolution: number;
  /** Optional per-vertex colour (linear RGB 0..1). */
  color?: ColorFn;
  /** Newton projection steps onto the surface. */
  project?: number;
}

export function meshSdf(sdf: Sdf, min: Vec3Tuple, max: Vec3Tuple, opts: MeshOptions): BufferGeometry {
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const h = size / opts.resolution;
  const pad = 2;
  const o: Vec3Tuple = [min[0] - pad * h, min[1] - pad * h, min[2] - pad * h];
  const nx = Math.ceil((max[0] - min[0]) / h) + 2 * pad + 1;
  const ny = Math.ceil((max[1] - min[1]) / h) + 2 * pad + 1;
  const nz = Math.ceil((max[2] - min[2]) / h) + 2 * pad + 1;

  // Sample the field at grid nodes, narrow-band: a coarse pass first, then exact values
  // only in blocks the surface can pass through. Far blocks just keep their sign, which is
  // all surface nets needs there. ~10x fewer SDF evaluations for typical shapes.
  const field = new Float32Array(nx * ny * nz);
  const B = 4;
  const cx = Math.ceil((nx - 1) / B) + 1, cy = Math.ceil((ny - 1) / B) + 1, cz = Math.ceil((nz - 1) / B) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) coarse[i + cx * (j + cy * k)] = sdf(o[0] + i * B * h, o[1] + j * B * h, o[2] + k * B * h);
  // A block is safe to skip if every corner is farther from the surface than the block
  // diagonal (SDFs are 1-Lipschitz, so no surface can cross it).
  const reach = B * h * Math.sqrt(3) * 1.05;
  const bx = cx - 1, by = cy - 1, bz = cz - 1;
  const active = new Uint8Array(bx * by * bz);
  for (let bk = 0; bk < cz - 1; bk++) {
    for (let bj = 0; bj < cy - 1; bj++) {
      for (let bi = 0; bi < cx - 1; bi++) {
        let minAbs = Infinity;
        let sign = 0;
        for (let c = 0; c < 8; c++) {
          const v = coarse[bi + (c & 1) + cx * (bj + ((c >> 1) & 1) + cy * (bk + ((c >> 2) & 1)))];
          minAbs = Math.min(minAbs, Math.abs(v));
          sign = v;
        }
        const skip = minAbs > reach;
        active[bi + bx * (bj + by * bk)] = skip ? 0 : 1;
        for (let k = bk * B; k <= Math.min(nz - 1, bk * B + B); k++)
          for (let j = bj * B; j <= Math.min(ny - 1, bj * B + B); j++)
            for (let i = bi * B; i <= Math.min(nx - 1, bi * B + B); i++) {
              const idx = i + nx * (j + ny * k);
              field[idx] = skip ? sign : sdf(o[0] + i * h, o[1] + j * h, o[2] + k * h);
            }
      }
    }
  }
  const F = (i: number, j: number, k: number) => field[i + nx * (j + ny * k)];

  // One vertex per cell that straddles the surface.
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const C = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos: number[] = [];
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const corner = new Float32Array(8);
  // Only blocks the surface can cross (uniform blocks have no sign changes).
  for (let bb = 0; bb < active.length; bb++) {
    if (!active[bb]) continue;
    const bi = bb % bx, bj = Math.floor(bb / bx) % by, bk = Math.floor(bb / (bx * by));
    for (let k = bk * B; k < Math.min(nz - 1, bk * B + B); k++)
    for (let j = bj * B; j < Math.min(ny - 1, bj * B + B); j++)
      for (let i = bi * B; i < Math.min(nx - 1, bi * B + B); i++) {
        let mask = 0;
        for (let b = 0; b < 8; b++) {
          const v = F(i + (b & 1), j + ((b >> 1) & 1), k + ((b >> 2) & 1));
          corner[b] = v;
          if (v < 0) mask |= 1 << b;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (const [a, b] of EDGES) {
          const va = corner[a], vb = corner[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          cnt++;
        }
        cellVert[C(i, j, k)] = pos.length / 3;
        pos.push(o[0] + (i + sx / cnt) * h, o[1] + (j + sy / cnt) * h, o[2] + (k + sz / cnt) * h);
      }
  }

  // Quads for every grid edge crossing the surface.
  const index: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // Split along the shorter diagonal for nicer triangles.
    const dAC = dist2(pos, a, c);
    const dBD = dist2(pos, b, d);
    if (dAC < dBD) {
      if (flip) index.push(a, c, b, a, d, c);
      else index.push(a, b, c, a, c, d);
    } else if (flip) index.push(a, d, b, b, d, c);
    else index.push(a, b, d, b, c, d);
  };
  for (let bb = 0; bb < active.length; bb++) {
    if (!active[bb]) continue;
    const bi = bb % bx, bj = Math.floor(bb / bx) % by, bk = Math.floor(bb / (bx * by));
    for (let k = Math.max(1, bk * B); k < Math.min(nz - 1, bk * B + B); k++)
    for (let j = Math.max(1, bj * B); j < Math.min(ny - 1, bj * B + B); j++)
      for (let i = Math.max(1, bi * B); i < Math.min(nx - 1, bi * B + B); i++) {
        const inside = F(i, j, k) < 0;
        if (i < nx - 1 && inside !== F(i + 1, j, k) < 0) {
          quad(cellVert[C(i, j - 1, k - 1)], cellVert[C(i, j, k - 1)], cellVert[C(i, j, k)], cellVert[C(i, j - 1, k)], !inside);
        }
        if (j < ny - 1 && inside !== F(i, j + 1, k) < 0) {
          quad(cellVert[C(i - 1, j, k - 1)], cellVert[C(i - 1, j, k)], cellVert[C(i, j, k)], cellVert[C(i, j, k - 1)], !inside);
        }
        if (k < nz - 1 && inside !== F(i, j, k + 1) < 0) {
          quad(cellVert[C(i - 1, j - 1, k)], cellVert[C(i, j - 1, k)], cellVert[C(i, j, k)], cellVert[C(i - 1, j, k)], !inside);
        }
      }
  }

  // Project vertices onto the surface (Newton steps along the numerical gradient).
  const steps = opts.project ?? 1;
  const e = h * 0.25;
  const normals = new Float32Array(pos.length);
  for (let v = 0; v < pos.length; v += 3) {
    let x = pos[v], y = pos[v + 1], z = pos[v + 2];
    let gx = 0, gy = 1, gz = 0;
    for (let s = 0; s <= steps; s++) {
      // Forward differences: 4 evaluations per step instead of 7.
      const d = sdf(x, y, z);
      gx = sdf(x + e, y, z) - d;
      gy = sdf(x, y + e, z) - d;
      gz = sdf(x, y, z + e) - d;
      const gl = len3(gx, gy, gz) || 1;
      gx /= gl; gy /= gl; gz /= gl;
      if (s === steps) break;
      // Clamp the step so a bad gradient near creases cannot fling a vertex.
      const step = Math.max(-h, Math.min(h, d));
      x -= gx * step; y -= gy * step; z -= gz * step;
    }
    pos[v] = x; pos[v + 1] = y; pos[v + 2] = z;
    normals[v] = gx; normals[v + 1] = gy; normals[v + 2] = gz;
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new BufferAttribute(normals, 3));
  if (opts.color) {
    const col = new Float32Array(pos.length);
    for (let v = 0; v < pos.length; v += 3) {
      const c = opts.color(pos[v], pos[v + 1], pos[v + 2], normals[v], normals[v + 1], normals[v + 2]);
      col[v] = c[0]; col[v + 1] = c[1]; col[v + 2] = c[2];
    }
    geo.setAttribute('color', new BufferAttribute(col, 3));
  }
  geo.setIndex(index);
  return geo;
}

function dist2(p: number[], a: number, b: number) {
  const dx = p[a * 3] - p[b * 3], dy = p[a * 3 + 1] - p[b * 3 + 1], dz = p[a * 3 + 2] - p[b * 3 + 2];
  return dx * dx + dy * dy + dz * dz;
}
