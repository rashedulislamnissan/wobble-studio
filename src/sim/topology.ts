/**
 * Cutting topology (CLAUDE.md §10, Level 2 on our lattice): given a new piece label for
 * every tet, duplicate the nodes shared by differently-labelled tets so the pieces become
 * physically separate, then relabel by connected component (a cut through a ring leaves
 * two arcs on one side). Pure data in, data out — unit-tested in tests/topology.test.ts.
 */

export interface Topology {
  /** Rest positions per node (xyz). */
  rest: Float64Array;
  /** Current state per node (xyz), carried across rebuilds. */
  pos: Float64Array;
  prev: Float64Array;
  vel: Float64Array;
  /** Four node indices per tet. */
  tets: Uint32Array;
  /** Original lattice tet index for every current tet (embedding looks up cells by it). */
  tetOrig: Int32Array;
  /** Piece id per tet and per node. */
  tetPiece: Uint16Array;
  nodePiece: Uint16Array;
  pieceCount: number;
}

export interface SplitResult {
  topology: Topology;
  /**
   * For every new piece: the old piece it came from and the side label (as given in
   * `label`) of its tets. Used to build each piece's rest-space SDF.
   */
  origin: { oldPiece: number; label: number }[];
  /** Old tet index → new tet index (-1 if removed). Remaps embeddings of untouched pieces. */
  tetMap: Int32Array;
}

/**
 * Split by per-tet labels. `label[t]` is any small integer (e.g. 0/1 for the two sides of a
 * cut); -1 removes the tet entirely (scooped or eaten). Nodes are duplicated wherever two
 * incident tets carry a different (oldPiece, label) pair.
 */
export function splitTopology(top: Topology, label: Int32Array): SplitResult {
  const nTets = top.tets.length / 4;
  const nNodes = top.rest.length / 3;

  // Group key per tet: old piece and side label together.
  const groupKey = (t: number) => top.tetPiece[t] * 1024 + (label[t] + 1);

  // 1) New node per (node, group). Map keys are node * 2^20 + group key.
  const nodeMap = new Map<number, number>();
  const srcNode: number[] = [];
  const newTets: number[] = [];
  const keptTets: number[] = [];
  for (let t = 0; t < nTets; t++) {
    if (label[t] < 0) continue;
    const g = groupKey(t);
    keptTets.push(t);
    for (let k = 0; k < 4; k++) {
      const n = top.tets[t * 4 + k];
      const key = n * 1048576 + g;
      let id = nodeMap.get(key);
      if (id === undefined) {
        id = srcNode.length;
        nodeMap.set(key, id);
        srcNode.push(n);
      }
      newTets.push(id);
    }
  }

  // 2) Connected components over the new tets (union-find on nodes).
  const parent = new Int32Array(srcNode.length).map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let i = 0; i < newTets.length; i += 4) {
    const a = find(newTets[i]);
    for (let k = 1; k < 4; k++) {
      const b = find(newTets[i + k]);
      if (a !== b) parent[b] = a;
    }
  }
  const compOf = new Map<number, number>();
  const origin: SplitResult['origin'] = [];
  const tetPiece = new Uint16Array(keptTets.length);
  for (let i = 0; i < keptTets.length; i++) {
    const root = find(newTets[i * 4]);
    let c = compOf.get(root);
    if (c === undefined) {
      c = origin.length;
      compOf.set(root, c);
      const t = keptTets[i];
      origin.push({ oldPiece: top.tetPiece[t], label: label[t] });
    }
    tetPiece[i] = c;
  }

  // 3) Copy node data.
  const m = srcNode.length;
  const rest = new Float64Array(m * 3);
  const pos = new Float64Array(m * 3);
  const prev = new Float64Array(m * 3);
  const vel = new Float64Array(m * 3);
  for (let i = 0; i < m; i++) {
    const s = srcNode[i] * 3;
    for (let k = 0; k < 3; k++) {
      rest[i * 3 + k] = top.rest[s + k];
      pos[i * 3 + k] = top.pos[s + k];
      prev[i * 3 + k] = top.prev[s + k];
      vel[i * 3 + k] = top.vel[s + k];
    }
  }
  const nodePiece = new Uint16Array(m);
  const tets = new Uint32Array(newTets);
  for (let i = 0; i < keptTets.length; i++) {
    for (let k = 0; k < 4; k++) nodePiece[tets[i * 4 + k]] = tetPiece[i];
  }
  const tetOrig = new Int32Array(keptTets.length);
  for (let i = 0; i < keptTets.length; i++) tetOrig[i] = top.tetOrig[keptTets[i]];

  void nNodes;
  const tetMap = new Int32Array(nTets).fill(-1);
  for (let i = 0; i < keptTets.length; i++) tetMap[keptTets[i]] = i;
  return {
    topology: { rest, pos, prev, vel, tets, tetOrig, tetPiece, nodePiece, pieceCount: origin.length },
    origin,
    tetMap,
  };
}

/** Rest volume per piece (sum of its tets). */
export function pieceVolumes(top: Topology, tetVolume: (t: number) => number): Float64Array {
  const v = new Float64Array(top.pieceCount);
  for (let t = 0; t < top.tetPiece.length; t++) v[top.tetPiece[t]] += tetVolume(t);
  return v;
}

/**
 * Best-fit rigid transform from rest to current positions for a set of nodes (shape
 * matching): returns centroid of rest (C), centroid of current (c) and rotation R as a
 * row-major 3x3, such that current ≈ R (rest - C) + c.
 */
export function rigidFit(
  rest: ArrayLike<number>,
  pos: ArrayLike<number>,
  nodes: ArrayLike<number>,
  weights?: ArrayLike<number>,
) {
  let W = 0;
  const C = [0, 0, 0];
  const c = [0, 0, 0];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i] * 3;
    const w = weights ? weights[nodes[i]] : 1;
    W += w;
    for (let k = 0; k < 3; k++) {
      C[k] += rest[n + k] * w;
      c[k] += pos[n + k] * w;
    }
  }
  for (let k = 0; k < 3; k++) {
    C[k] /= W || 1;
    c[k] /= W || 1;
  }
  // A = sum w (x - c)(X - C)^T
  const A = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i] * 3;
    const w = weights ? weights[nodes[i]] : 1;
    const p = [pos[n] - c[0], pos[n + 1] - c[1], pos[n + 2] - c[2]];
    const q = [rest[n] - C[0], rest[n + 1] - C[1], rest[n + 2] - C[2]];
    for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) A[r * 3 + s] += w * p[r] * q[s];
  }
  return { C, c, R: extractRotation(A) };
}

/**
 * Rotation part of a 3x3 matrix (Müller et al. 2016, "A Robust Method to Extract the
 * Rotational Part of Deformations"), iterated on a quaternion. Row-major in and out.
 */
export function extractRotation(A: number[], iterations = 40): number[] {
  let qx = 0, qy = 0, qz = 0, qw = 1;
  const col = (m: number[], j: number) => [m[j], m[3 + j], m[6 + j]];
  for (let it = 0; it < iterations; it++) {
    const R = quatToMat(qx, qy, qz, qw);
    const r0 = col(R, 0), r1 = col(R, 1), r2 = col(R, 2);
    const a0 = col(A, 0), a1 = col(A, 1), a2 = col(A, 2);
    const cross = (u: number[], v: number[]) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const dot = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const c0 = cross(r0, a0), c1 = cross(r1, a1), c2 = cross(r2, a2);
    const denom = Math.abs(dot(r0, a0) + dot(r1, a1) + dot(r2, a2)) + 1e-9;
    const ox = (c0[0] + c1[0] + c2[0]) / denom;
    const oy = (c0[1] + c1[1] + c2[1]) / denom;
    const oz = (c0[2] + c1[2] + c2[2]) / denom;
    const w = Math.hypot(ox, oy, oz);
    if (w < 1e-9) break;
    const half = w / 2;
    const s = Math.sin(half) / w;
    const dx = ox * s, dy = oy * s, dz = oz * s, dw = Math.cos(half);
    // q = dq * q
    const nx = dw * qx + dx * qw + dy * qz - dz * qy;
    const ny = dw * qy - dx * qz + dy * qw + dz * qx;
    const nz = dw * qz + dx * qy - dy * qx + dz * qw;
    const nw = dw * qw - dx * qx - dy * qy - dz * qz;
    const l = Math.hypot(nx, ny, nz, nw);
    qx = nx / l; qy = ny / l; qz = nz / l; qw = nw / l;
  }
  return quatToMat(qx, qy, qz, qw);
}

function quatToMat(x: number, y: number, z: number, w: number): number[] {
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}
