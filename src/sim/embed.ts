/**
 * Embed a render surface in the tet mesh: each render vertex stores the tet it lives in
 * plus barycentric weights, so it follows the deforming simulation exactly.
 */
import { TETS_PER_CELL, type TetMesh } from './lattice';

export interface Embedding {
  tet: Uint32Array;
  /** Four barycentric weights per vertex (the last is 1 - sum of the others). */
  bary: Float32Array;
}

function barycentric(
  pos: ArrayLike<number>,
  tets: Uint32Array,
  t: number,
  px: number,
  py: number,
  pz: number,
  out: Float32Array,
): boolean {
  const a = tets[t * 4] * 3;
  const b = tets[t * 4 + 1] * 3;
  const c = tets[t * 4 + 2] * 3;
  const d = tets[t * 4 + 3] * 3;
  const m00 = pos[b] - pos[a], m10 = pos[b + 1] - pos[a + 1], m20 = pos[b + 2] - pos[a + 2];
  const m01 = pos[c] - pos[a], m11 = pos[c + 1] - pos[a + 1], m21 = pos[c + 2] - pos[a + 2];
  const m02 = pos[d] - pos[a], m12 = pos[d + 1] - pos[a + 1], m22 = pos[d + 2] - pos[a + 2];
  const det =
    m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20);
  if (Math.abs(det) < 1e-14) return false;
  const rx = px - pos[a], ry = py - pos[a + 1], rz = pz - pos[a + 2];
  const inv = 1 / det;
  const u = ((m11 * m22 - m12 * m21) * rx + (m02 * m21 - m01 * m22) * ry + (m01 * m12 - m02 * m11) * rz) * inv;
  const v = ((m12 * m20 - m10 * m22) * rx + (m00 * m22 - m02 * m20) * ry + (m02 * m10 - m00 * m12) * rz) * inv;
  const w = ((m10 * m21 - m11 * m20) * rx + (m01 * m20 - m00 * m21) * ry + (m00 * m11 - m01 * m10) * rz) * inv;
  out[0] = 1 - u - v - w;
  out[1] = u;
  out[2] = v;
  out[3] = w;
  return true;
}

/**
 * Find the host tet for each point. Points in occupied cells use that cell's tets; points
 * that fall just outside the lattice search a growing neighbourhood and use the tet they are
 * "most inside" (barycentric extrapolation, stable for small distances).
 */
export function embedPoints(points: ArrayLike<number>, mesh: TetMesh): Embedding {
  const n = points.length / 3;
  const tet = new Uint32Array(n);
  const bary = new Float32Array(n * 4);
  const { origin, cellSize, dims, cellFirstTet } = mesh.lattice;
  const tmp = new Float32Array(4);

  for (let i = 0; i < n; i++) {
    const px = points[i * 3], py = points[i * 3 + 1], pz = points[i * 3 + 2];
    const ci = Math.floor((px - origin[0]) / cellSize);
    const cj = Math.floor((py - origin[1]) / cellSize);
    const ck = Math.floor((pz - origin[2]) / cellSize);
    let bestT = -1;
    let bestScore = -Infinity;
    const best = new Float32Array(4);

    for (let r = 0; r <= 3 && bestScore < -1e-6; r++) {
      for (let dk = -r; dk <= r; dk++) {
        for (let dj = -r; dj <= r; dj++) {
          for (let di = -r; di <= r; di++) {
            if (Math.max(Math.abs(di), Math.abs(dj), Math.abs(dk)) !== r) continue;
            const x = ci + di, y = cj + dj, z = ck + dk;
            if (x < 0 || y < 0 || z < 0 || x >= dims[0] || y >= dims[1] || z >= dims[2]) continue;
            const first = cellFirstTet[x + dims[0] * (y + dims[1] * z)];
            if (first < 0) continue;
            for (let t = first; t < first + TETS_PER_CELL; t++) {
              if (!barycentric(mesh.positions, mesh.tets, t, px, py, pz, tmp)) continue;
              const score = Math.min(tmp[0], tmp[1], tmp[2], tmp[3]);
              if (score > bestScore) {
                bestScore = score;
                bestT = t;
                best.set(tmp);
              }
            }
          }
        }
      }
    }

    if (bestT < 0) {
      // Fallback: brute force over every tet (only for stray points far from the lattice).
      for (let t = 0; t < mesh.tets.length / 4; t++) {
        if (!barycentric(mesh.positions, mesh.tets, t, px, py, pz, tmp)) continue;
        const score = Math.min(tmp[0], tmp[1], tmp[2], tmp[3]);
        if (score > bestScore) {
          bestScore = score;
          bestT = t;
          best.set(tmp);
        }
      }
    }
    tet[i] = Math.max(0, bestT);
    bary.set(best, i * 4);
  }
  return { tet, bary };
}

/** Write deformed positions of the embedded points into `out` (xyz per point). */
export function skinPoints(
  embedding: Embedding,
  tets: Uint32Array,
  particles: ArrayLike<number>,
  out: Float32Array,
) {
  const { tet, bary } = embedding;
  for (let i = 0; i < tet.length; i++) {
    const t = tet[i] * 4;
    const a = tets[t] * 3, b = tets[t + 1] * 3, c = tets[t + 2] * 3, d = tets[t + 3] * 3;
    const w0 = bary[i * 4], w1 = bary[i * 4 + 1], w2 = bary[i * 4 + 2], w3 = bary[i * 4 + 3];
    const o = i * 3;
    out[o] = particles[a] * w0 + particles[b] * w1 + particles[c] * w2 + particles[d] * w3;
    out[o + 1] = particles[a + 1] * w0 + particles[b + 1] * w1 + particles[c + 1] * w2 + particles[d + 1] * w3;
    out[o + 2] = particles[a + 2] * w0 + particles[b + 2] * w1 + particles[c + 2] * w2 + particles[d + 2] * w3;
  }
}
