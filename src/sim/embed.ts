/**
 * Embed a render surface in the tet mesh: each render vertex stores the tet it lives in
 * plus barycentric weights, so it follows the deforming simulation exactly.
 */
import { TETS_PER_CELL, type TetMesh } from './lattice';

/** Barycentric score (min weight) at which a host tet is accepted without further search. */
const GOOD_ENOUGH = -0.06;

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

/**
 * Precomputed rest-space inverse of every tet (origin + 3x3 inverse = 12 floats), so a
 * barycentric query is one matrix-vector product instead of a matrix inversion.
 */
export function buildTetInverses(rest: ArrayLike<number>, tets: Uint32Array): Float32Array {
  const n = tets.length / 4;
  const out = new Float32Array(n * 12);
  for (let t = 0; t < n; t++) {
    const a = tets[t * 4] * 3, b = tets[t * 4 + 1] * 3, c = tets[t * 4 + 2] * 3, d = tets[t * 4 + 3] * 3;
    const m00 = rest[b] - rest[a], m10 = rest[b + 1] - rest[a + 1], m20 = rest[b + 2] - rest[a + 2];
    const m01 = rest[c] - rest[a], m11 = rest[c + 1] - rest[a + 1], m21 = rest[c + 2] - rest[a + 2];
    const m02 = rest[d] - rest[a], m12 = rest[d + 1] - rest[a + 1], m22 = rest[d + 2] - rest[a + 2];
    const det = m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20);
    const inv = Math.abs(det) < 1e-14 ? 0 : 1 / det;
    const o = t * 12;
    out[o] = rest[a]; out[o + 1] = rest[a + 1]; out[o + 2] = rest[a + 2];
    out[o + 3] = (m11 * m22 - m12 * m21) * inv; out[o + 4] = (m02 * m21 - m01 * m22) * inv; out[o + 5] = (m01 * m12 - m02 * m11) * inv;
    out[o + 6] = (m12 * m20 - m10 * m22) * inv; out[o + 7] = (m00 * m22 - m02 * m20) * inv; out[o + 8] = (m02 * m10 - m00 * m12) * inv;
    out[o + 9] = (m10 * m21 - m11 * m20) * inv; out[o + 10] = (m01 * m20 - m00 * m21) * inv; out[o + 11] = (m00 * m11 - m01 * m10) * inv;
  }
  return out;
}

/** Current tets per original lattice cell, in CSR form (several pieces can share a cell). */
export interface CellTets {
  start: Int32Array;
  list: Int32Array;
}

export function buildCellTets(cellCount: number, tetCellOrig: Int32Array, tetOrig: Int32Array): CellTets {
  const start = new Int32Array(cellCount + 1);
  for (let t = 0; t < tetOrig.length; t++) start[tetCellOrig[tetOrig[t]] + 1]++;
  for (let c = 0; c < cellCount; c++) start[c + 1] += start[c];
  const fill = start.slice(0, cellCount);
  const list = new Int32Array(tetOrig.length);
  for (let t = 0; t < tetOrig.length; t++) list[fill[tetCellOrig[tetOrig[t]]]++] = t;
  return { start, list };
}

/**
 * Embed points into the tets of one piece of a cut topology. `cellTets` lists, for each
 * original lattice cell, the current tets occupying it (several pieces can share a cell).
 * Returns per-point quality too: very negative scores mean the point lies far outside the
 * piece (it belongs to a different component) and should be discarded.
 */
export function embedInPiece(
  points: ArrayLike<number>,
  rest: ArrayLike<number>,
  tets: Uint32Array,
  tetPiece: Uint16Array,
  piece: number,
  lattice: TetMesh['lattice'],
  cellTets: CellTets,
  inverses: Float32Array,
): Embedding & { score: Float32Array } {
  void rest; // kept in the signature for callers; inverses carry the rest geometry
  void tets;
  const n = points.length / 3;
  const tet = new Uint32Array(n);
  const bary = new Float32Array(n * 4);
  const score = new Float32Array(n);
  const { origin, cellSize, dims } = lattice;
  const tmp = new Float32Array(4);
  const best = new Float32Array(4);
  for (let i = 0; i < n; i++) {
    const px = points[i * 3], py = points[i * 3 + 1], pz = points[i * 3 + 2];
    const ci = Math.floor((px - origin[0]) / cellSize);
    const cj = Math.floor((py - origin[1]) / cellSize);
    const ck = Math.floor((pz - origin[2]) / cellSize);
    let bestT = -1;
    let bestScore = -Infinity;
    // Slight extrapolation is invisible; stop searching once a host is this good.
    // A host more than one ring away is never right; rings grow as (2r+1)^3 cells.
    for (let r = 0; r <= 2 && bestScore < GOOD_ENOUGH && !(r >= 2 && bestT >= 0); r++) {
      for (let dk = -r; dk <= r; dk++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj), Math.abs(dk)) !== r) continue;
        const x = ci + di, y = cj + dj, z = ck + dk;
        if (x < 0 || y < 0 || z < 0 || x >= dims[0] || y >= dims[1] || z >= dims[2]) continue;
        const cell = x + dims[0] * (y + dims[1] * z);
        for (let q = cellTets.start[cell]; q < cellTets.start[cell + 1]; q++) {
          const t = cellTets.list[q];
          if (tetPiece[t] !== piece) continue;
          const o = t * 12;
          const rx = px - inverses[o], ry = py - inverses[o + 1], rz = pz - inverses[o + 2];
          tmp[1] = inverses[o + 3] * rx + inverses[o + 4] * ry + inverses[o + 5] * rz;
          tmp[2] = inverses[o + 6] * rx + inverses[o + 7] * ry + inverses[o + 8] * rz;
          tmp[3] = inverses[o + 9] * rx + inverses[o + 10] * ry + inverses[o + 11] * rz;
          tmp[0] = 1 - tmp[1] - tmp[2] - tmp[3];
          const s = Math.min(tmp[0], tmp[1], tmp[2], tmp[3]);
          if (s > bestScore) {
            bestScore = s;
            bestT = t;
            best.set(tmp);
          }
        }
      }
    }
    tet[i] = Math.max(0, bestT);
    bary.set(best, i * 4);
    score[i] = bestT < 0 ? -Infinity : bestScore;
  }
  return { tet, bary, score };
}
