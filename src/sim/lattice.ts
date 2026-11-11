/**
 * Build a tetrahedral soft-body mesh from a signed distance function (negative inside).
 *
 * The shape is voxelised into a regular lattice; every occupied cube is split into six
 * tetrahedra (Kuhn subdivision, which is conforming across neighbouring cubes without
 * parity tricks). See docs/decisions.md for why we chose a lattice-tet representation.
 */

export type Sdf = (x: number, y: number, z: number) => number;
export type Vec3Tuple = [number, number, number];

export interface Lattice {
  origin: Vec3Tuple;
  cellSize: number;
  /** Cell counts along x, y, z. */
  dims: Vec3Tuple;
  /** For every cell, index of its first tet (6 consecutive) or -1 if empty. */
  cellFirstTet: Int32Array;
}

export interface TetMesh {
  /** Rest positions, xyz per particle. */
  positions: Float32Array;
  /** Four particle indices per tet, positively oriented. */
  tets: Uint32Array;
  /** Two particle indices per edge, unique. */
  edges: Uint32Array;
  lattice: Lattice;
  /** Cell index for each tet (6 tets per occupied cell). */
  tetCell: Int32Array;
}

/**
 * Five-tet cube split with alternating parity (conforming across neighbours). Corners are
 * indexed by bits x | y<<1 | z<<2. Alternating the split between neighbouring cells keeps
 * the lattice free of a global diagonal direction, which would otherwise make symmetric
 * bodies drift or lean.
 */
export const TETS_PER_CELL = 5;
const SPLIT_EVEN = [
  [1, 2, 4, 7],
  [0, 1, 2, 4],
  [3, 1, 2, 7],
  [5, 1, 4, 7],
  [6, 2, 4, 7],
] as const;
const SPLIT_ODD = [
  [0, 3, 5, 6],
  [1, 0, 3, 5],
  [2, 0, 3, 6],
  [4, 0, 5, 6],
  [7, 3, 5, 6],
] as const;

/** Deterministic PRNG (mulberry32) so builds are reproducible. */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shuffle fixed-size records in place (Gauss-Seidel order without spatial sweep bias). */
export function shuffleRecords(arr: Uint32Array, stride: number, rand: () => number) {
  const n = arr.length / stride;
  const tmp = new Uint32Array(stride);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    tmp.set(arr.subarray(i * stride, i * stride + stride));
    arr.copyWithin(i * stride, j * stride, j * stride + stride);
    arr.set(tmp, j * stride);
  }
}

export interface LatticeOptions {
  /**
   * A cell is occupied when the SDF at its centre is below `inflate * cellSize`.
   * Slight inflation keeps nearly all surface points inside the lattice.
   */
  inflate?: number;
  /** Optional filter, e.g. to drop cells for separate pieces. */
  includeCell?: (cx: number, cy: number, cz: number) => boolean;
}

export function buildLatticeTetMesh(
  sdf: Sdf,
  min: Vec3Tuple,
  max: Vec3Tuple,
  cellSize: number,
  options: LatticeOptions = {},
): TetMesh {
  const inflate = options.inflate ?? 0.3;
  const h = cellSize;
  // Pad by one cell so surface points near the bounds still have a host cell.
  const origin: Vec3Tuple = [min[0] - h * 0.5, min[1] - h * 0.5, min[2] - h * 0.5];
  const dims: Vec3Tuple = [
    Math.ceil((max[0] - min[0]) / h) + 1,
    Math.ceil((max[1] - min[1]) / h) + 1,
    Math.ceil((max[2] - min[2]) / h) + 1,
  ];
  const [nx, ny, nz] = dims;
  const nodeDims = [nx + 1, ny + 1, nz + 1];
  const nodeIndex = new Int32Array(nodeDims[0] * nodeDims[1] * nodeDims[2]).fill(-1);
  const cellFirstTet = new Int32Array(nx * ny * nz).fill(-1);

  const positions: number[] = [];
  const tets: number[] = [];
  const tetCell: number[] = [];

  const node = (i: number, j: number, k: number) => {
    const key = i + nodeDims[0] * (j + nodeDims[1] * k);
    let idx = nodeIndex[key];
    if (idx < 0) {
      idx = positions.length / 3;
      nodeIndex[key] = idx;
      positions.push(origin[0] + i * h, origin[1] + j * h, origin[2] + k * h);
    }
    return idx;
  };

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const cx = origin[0] + (i + 0.5) * h;
        const cy = origin[1] + (j + 0.5) * h;
        const cz = origin[2] + (k + 0.5) * h;
        if (sdf(cx, cy, cz) >= inflate * h) continue;
        if (options.includeCell && !options.includeCell(i, j, k)) continue;

        const corner: number[] = [];
        for (let b = 0; b < 8; b++) corner.push(node(i + (b & 1), j + ((b >> 1) & 1), k + ((b >> 2) & 1)));

        const cell = i + nx * (j + ny * k);
        cellFirstTet[cell] = tets.length / 4;
        const split = (i + j + k) & 1 ? SPLIT_ODD : SPLIT_EVEN;
        for (const t of split) {
          tets.push(corner[t[0]], corner[t[1]], corner[t[2]], corner[t[3]]);
          tetCell.push(cell);
        }
      }
    }
  }

  const pos = new Float32Array(positions);
  const tetArr = new Uint32Array(tets);
  orientTets(pos, tetArr);
  const edges = uniqueEdges(tetArr, pos.length / 3);
  // Tets keep their cell order (the embedding looks them up per cell); only the solver's
  // constraint order is shuffled, via a permutation it iterates.
  shuffleRecords(edges, 2, seededRandom(0x5eed));

  return {
    positions: pos,
    tets: tetArr,
    edges,
    lattice: { origin, cellSize: h, dims, cellFirstTet },
    tetCell: new Int32Array(tetCell),
  };
}

export function tetVolume(p: ArrayLike<number>, a: number, b: number, c: number, d: number): number {
  const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
  const e1x = p[b * 3] - ax, e1y = p[b * 3 + 1] - ay, e1z = p[b * 3 + 2] - az;
  const e2x = p[c * 3] - ax, e2y = p[c * 3 + 1] - ay, e2z = p[c * 3 + 2] - az;
  const e3x = p[d * 3] - ax, e3y = p[d * 3 + 1] - ay, e3z = p[d * 3 + 2] - az;
  const cx = e1y * e2z - e1z * e2y;
  const cy = e1z * e2x - e1x * e2z;
  const cz = e1x * e2y - e1y * e2x;
  return (cx * e3x + cy * e3y + cz * e3z) / 6;
}

/** Swap two vertices of any negatively oriented tet so every rest volume is positive. */
function orientTets(pos: Float32Array, tets: Uint32Array) {
  for (let t = 0; t < tets.length; t += 4) {
    if (tetVolume(pos, tets[t], tets[t + 1], tets[t + 2], tets[t + 3]) < 0) {
      const tmp = tets[t + 2];
      tets[t + 2] = tets[t + 3];
      tets[t + 3] = tmp;
    }
  }
}

export function uniqueEdges(tets: Uint32Array, particleCount: number): Uint32Array {
  const seen = new Set<number>();
  const out: number[] = [];
  const pairs = [
    [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
  ];
  for (let t = 0; t < tets.length; t += 4) {
    for (const [a, b] of pairs) {
      let i = tets[t + a];
      let j = tets[t + b];
      if (i > j) [i, j] = [j, i];
      const key = i * particleCount + j;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(i, j);
    }
  }
  return new Uint32Array(out);
}
