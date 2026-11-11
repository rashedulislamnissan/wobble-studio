/**
 * Surface Nets mesher: SDF → closed, indexed triangle mesh with vertex colours.
 * Vertices are projected back onto the iso-surface for accuracy, so shapes stay crisp
 * at modest grid resolutions.
 */
import { BufferAttribute, BufferGeometry } from 'three/webgpu';
import type { Sdf, Vec3Tuple } from '../sim/lattice';

export type ColorFn = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => [number, number, number];

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

  // Sample the field at grid nodes.
  const field = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) field[i + nx * (j + ny * k)] = sdf(o[0] + i * h, o[1] + j * h, o[2] + k * h);
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
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
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
  }

  // Quads for every grid edge crossing the surface.
  const index: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // Split along the shorter diagonal for nicer triangles.
    const dAC = dist2(pos, a, c);
    const dBD = dist2(pos, b, d);
    const tris = dAC < dBD ? [a, b, c, a, c, d] : [a, b, d, b, c, d];
    if (flip) for (let t = 0; t < 6; t += 3) [tris[t + 1], tris[t + 2]] = [tris[t + 2], tris[t + 1]];
    index.push(...tris);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
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
  }

  // Project vertices onto the surface (Newton steps along the numerical gradient).
  const steps = opts.project ?? 2;
  const e = h * 0.25;
  const normals = new Float32Array(pos.length);
  for (let v = 0; v < pos.length; v += 3) {
    let x = pos[v], y = pos[v + 1], z = pos[v + 2];
    let gx = 0, gy = 1, gz = 0;
    for (let s = 0; s <= steps; s++) {
      const d = sdf(x, y, z);
      gx = sdf(x + e, y, z) - sdf(x - e, y, z);
      gy = sdf(x, y + e, z) - sdf(x, y - e, z);
      gz = sdf(x, y, z + e) - sdf(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1;
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
