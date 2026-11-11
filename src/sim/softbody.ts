/**
 * XPBD soft-body solver (CPU). Edge (shear/stretch) + tet volume constraints,
 * solved with the "small steps" scheme: many substeps, one iteration each.
 *
 * Feel parameters are expressed as material moduli rather than raw compliance so the
 * behaviour stays the same when the lattice resolution changes (auto-quality).
 */
import { SIM } from '../config';
import { seededRandom, shuffleRecords, tetVolume, uniqueEdges, type TetMesh } from './lattice';
import type { Topology } from './topology';

/** Max inter-piece separation per substep (world units): pieces ease apart. */
const PIECE_PUSH_PER_SUBSTEP = 0.0012;

export type Collider =
  | { kind: 'sphere'; x: number; y: number; z: number; r: number; depth: number; contacts: number }
  | { kind: 'plate'; y: number; depth: number; contacts: number };

export interface SoftBodyParams {
  /** Young's-modulus-like stiffness of edges. Higher = firmer. */
  stiffness: number;
  /** Bulk modulus for volume preservation; Infinity = incompressible. */
  bulk: number;
  /** Internal damping rate (1/s): removes non-rigid motion only, so tosses keep momentum. */
  damping: number;
  /** Simulation density (mass per unit volume). */
  density: number;
  /**
   * Shape matching strength per frame, 0..1 (Müller et al. 2005). 0 = pure soft body
   * (jelly); near 1 = a solid that moves as one piece and only gives slightly (apple,
   * cheese, chocolate). Applied per piece, so cut pieces stay solid too.
   */
  rigidity?: number;
  /**
   * Plasticity: strain beyond `yield` (fraction of rest length) flows into the rest shape
   * at `rate` (1/s), so a dent stays; `recover` (1/s) slowly restores the original shape
   * (bread springs back, cake mostly doesn't).
   */
  plastic?: { yield: number; rate: number; recover: number };
}

// Volume-gradient vertex order (face opposite each vertex), consistent with tetVolume().
const VOL_ORDER = [
  [1, 3, 2],
  [0, 2, 3],
  [0, 3, 1],
  [0, 1, 2],
] as const;

export class SoftBody {
  readonly count: number;
  readonly pos: Float64Array;
  readonly prev: Float64Array;
  readonly vel: Float64Array;
  readonly invMass: Float32Array;
  readonly mass: Float32Array;
  readonly rest: Float64Array;
  readonly tets: Uint32Array;
  readonly edges: Uint32Array;
  readonly restLen: Float32Array;
  readonly restVol: Float32Array;
  /** Shuffled solve order for tets (avoids spatial sweep bias). */
  readonly tetOrder: Uint32Array;
  readonly totalRestVolume: number;
  /** 1 while a particle touches the floor this substep. */
  readonly contact: Uint8Array;
  /** Fastest landing speed and number of landings since the last read (see takeImpact). */
  impactSpeed = 0;
  impactCount = 0;

  /** Read and clear the impact accumulator (once per rendered frame). */
  takeImpact() {
    const r = { speed: this.impactSpeed, count: this.impactCount, fraction: this.impactCount / this.count };
    this.impactSpeed = 0;
    this.impactCount = 0;
    return r;
  }
  /** Particle-space floor: particles stop here so the *render surface* touches y = 0. */
  floorY = 0;

  params: SoftBodyParams;
  substeps: number = SIM.substeps;

  // Grab state
  private grabIdx: Uint32Array = new Uint32Array(0);
  private grabWeight: Float32Array = new Float32Array(0);
  private grabOffset: Float32Array = new Float32Array(0);
  private grabTarget = new Float32Array(3);
  private grabCompliance = 0;
  grabbing = false;

  constructor(mesh: TetMesh, params: SoftBodyParams) {
    this.params = { ...params };
    this.count = mesh.positions.length / 3;
    this.pos = new Float64Array(mesh.positions);
    this.prev = new Float64Array(mesh.positions);
    this.rest = new Float64Array(mesh.positions);
    this.vel = new Float64Array(this.count * 3);
    this.invMass = new Float32Array(this.count);
    this.mass = new Float32Array(this.count);
    this.contact = new Uint8Array(this.count);
    this.tets = mesh.tets;
    this.edges = mesh.edges;

    this.restVol = new Float32Array(this.tets.length / 4);
    let total = 0;
    for (let t = 0; t < this.restVol.length; t++) {
      const [a, b, c, d] = this.tets.subarray(t * 4, t * 4 + 4);
      const v = tetVolume(this.pos, a, b, c, d);
      this.restVol[t] = v;
      total += v;
      const m = (v * params.density) / 4;
      this.mass[a] += m;
      this.mass[b] += m;
      this.mass[c] += m;
      this.mass[d] += m;
    }
    this.totalRestVolume = total;
    this.tetOrder = new Uint32Array(this.restVol.length).map((_, i) => i);
    const rand = seededRandom(0x7e7);
    for (let i = this.tetOrder.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = this.tetOrder[i];
      this.tetOrder[i] = this.tetOrder[j];
      this.tetOrder[j] = tmp;
    }
    for (let i = 0; i < this.count; i++) this.invMass[i] = this.mass[i] > 0 ? 1 / this.mass[i] : 0;

    this.restLen = new Float32Array(this.edges.length / 2);
    for (let e = 0; e < this.restLen.length; e++) {
      const i = this.edges[e * 2] * 3;
      const j = this.edges[e * 2 + 1] * 3;
      this.restLen[e] = Math.hypot(
        this.pos[i] - this.pos[j],
        this.pos[i + 1] - this.pos[j + 1],
        this.pos[i + 2] - this.pos[j + 2],
      );
    }
  }

  /** The original rest shape (plasticity and inflation work relative to it). */
  private restLen0: Float32Array | null = null;
  private restVol0: Float32Array | null = null;
  private inflation = 1;

  private ensureRestBase() {
    if (!this.restLen0) {
      this.restLen0 = new Float32Array(this.restLen);
      this.restVol0 = new Float32Array(this.restVol);
    }
  }

  /**
   * Scale the rest shape (1 = normal). Used for Puffy's "Puff up": the body swells as its
   * springs and volumes relax toward the new rest size, then deflates when set back.
   */
  setInflation(f: number) {
    this.ensureRestBase();
    this.inflation = f;
    const f3 = f * f * f;
    for (let e = 0; e < this.restLen.length; e++) this.restLen[e] = this.restLen0![e] * f;
    for (let t = 0; t < this.restVol.length; t++) this.restVol[t] = this.restVol0![t] * f3;
  }

  /** Undo plastic deformation (Reset). */
  restoreRestShape() {
    if (!this.restLen0) return;
    this.restLen.set(this.restLen0);
    this.restVol.set(this.restVol0!);
    this.inflation = 1;
  }

  /**
   * Plastic flow, once per frame: edges and tets stretched or squashed beyond the yield
   * strain take on part of that deformation as their new rest shape; meanwhile the rest
   * shape creeps back toward the original at the recovery rate.
   */
  private applyPlasticity(dt: number) {
    const pl = this.params.plastic;
    if (!pl) return;
    this.ensureRestBase();
    const flow = 1 - Math.exp(-pl.rate * dt);
    const back = 1 - Math.exp(-pl.recover * dt);
    const { pos, edges, restLen, tets, restVol } = this;
    const base = this.restLen0!;
    const baseV = this.restVol0!;
    for (let e = 0; e < restLen.length; e++) {
      const a = edges[e * 2] * 3, b = edges[e * 2 + 1] * 3;
      const dx = pos[a] - pos[b], dy = pos[a + 1] - pos[b + 1], dz = pos[a + 2] - pos[b + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const r0 = base[e];
      const over = len - restLen[e];
      const lim = pl.yield * r0;
      let r = restLen[e];
      if (over > lim) r += (over - lim) * flow;
      else if (over < -lim) r += (over + lim) * flow;
      r += (r0 - r) * back;
      // Never let an edge collapse or balloon: keep within a sane band of the original.
      restLen[e] = Math.min(r0 * 1.6, Math.max(r0 * 0.45, r));
    }
    for (let t = 0; t < restVol.length; t++) {
      const k = t * 4;
      const v = tetVolume(pos, tets[k], tets[k + 1], tets[k + 2], tets[k + 3]);
      const v0 = baseV[t];
      const over = v - restVol[t];
      const lim = pl.yield * 2 * v0;
      let r = restVol[t];
      if (over > lim) r += (over - lim) * flow;
      else if (over < -lim) r += (over + lim) * flow;
      r += (v0 - r) * back;
      restVol[t] = Math.min(v0 * 2, Math.max(v0 * 0.3, r));
    }
  }

  // ---------------------------------------------------------------- shape matching

  private smRest: Float64Array | null = null; // rest offsets from piece centroid
  private smQuat: Float64Array | null = null; // warm-started rotation per piece

  /** Rest offsets per node relative to its piece's rest centroid (mass-weighted). */
  private prepareShapeMatching() {
    const n = this.count;
    const pieces = Math.max(1, this.pieceCount);
    const piece = this.nodePiece.length === n ? this.nodePiece : new Uint16Array(n);
    const cm = new Float64Array(pieces * 4);
    for (let i = 0; i < n; i++) {
      const p = piece[i] * 4, m = this.mass[i];
      cm[p] += this.rest[i * 3] * m;
      cm[p + 1] += this.rest[i * 3 + 1] * m;
      cm[p + 2] += this.rest[i * 3 + 2] * m;
      cm[p + 3] += m;
    }
    this.smRest = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = piece[i] * 4, M = cm[p + 3] || 1;
      this.smRest[i * 3] = this.rest[i * 3] - cm[p] / M;
      this.smRest[i * 3 + 1] = this.rest[i * 3 + 1] - cm[p + 1] / M;
      this.smRest[i * 3 + 2] = this.rest[i * 3 + 2] - cm[p + 2] / M;
    }
    this.smQuat = new Float64Array(pieces * 4);
    for (let p = 0; p < pieces; p++) this.smQuat[p * 4 + 3] = 1;
  }

  /**
   * Pull every piece toward its best rigid fit (rotation from the polar decomposition of the
   * moment matrix, warm-started quaternion iteration). Scales are inflation-aware.
   */
  private solveShapeMatching(k: number) {
    if (!this.smRest || this.smRest.length !== this.count * 3) this.prepareShapeMatching();
    const n = this.count;
    const pieces = Math.max(1, this.pieceCount);
    const piece = this.nodePiece.length === n ? this.nodePiece : new Uint16Array(n);
    const { pos, mass } = this;
    const q = this.smRest!;
    const s = this.inflation;
    // Centroids.
    const c = new Float64Array(pieces * 4);
    for (let i = 0; i < n; i++) {
      const p = piece[i] * 4, m = mass[i];
      c[p] += pos[i * 3] * m; c[p + 1] += pos[i * 3 + 1] * m; c[p + 2] += pos[i * 3 + 2] * m; c[p + 3] += m;
    }
    for (let p = 0; p < pieces; p++) {
      const M = c[p * 4 + 3] || 1;
      c[p * 4] /= M; c[p * 4 + 1] /= M; c[p * 4 + 2] /= M;
    }
    // Moment matrices A = sum m (x - c) q^T.
    const A = new Float64Array(pieces * 9);
    for (let i = 0; i < n; i++) {
      const p = piece[i], m = mass[i];
      const px = pos[i * 3] - c[p * 4], py = pos[i * 3 + 1] - c[p * 4 + 1], pz = pos[i * 3 + 2] - c[p * 4 + 2];
      const qx = q[i * 3] * m, qy = q[i * 3 + 1] * m, qz = q[i * 3 + 2] * m;
      const o = p * 9;
      A[o] += px * qx; A[o + 1] += px * qy; A[o + 2] += px * qz;
      A[o + 3] += py * qx; A[o + 4] += py * qy; A[o + 5] += py * qz;
      A[o + 6] += pz * qx; A[o + 7] += pz * qy; A[o + 8] += pz * qz;
    }
    const R = new Float64Array(pieces * 9);
    for (let p = 0; p < pieces; p++) this.rotationOf(A, p, R);
    for (let i = 0; i < n; i++) {
      const p = piece[i];
      const o = p * 9;
      const qx = q[i * 3] * s, qy = q[i * 3 + 1] * s, qz = q[i * 3 + 2] * s;
      const gx = R[o] * qx + R[o + 1] * qy + R[o + 2] * qz + c[p * 4];
      const gy = R[o + 3] * qx + R[o + 4] * qy + R[o + 5] * qz + c[p * 4 + 1];
      const gz = R[o + 6] * qx + R[o + 7] * qy + R[o + 8] * qz + c[p * 4 + 2];
      pos[i * 3] += (gx - pos[i * 3]) * k;
      pos[i * 3 + 1] += (gy - pos[i * 3 + 1]) * k;
      pos[i * 3 + 2] += (gz - pos[i * 3 + 2]) * k;
    }
  }

  /** Müller 2016 rotation extraction, a few warm-started iterations per call. */
  private rotationOf(A: Float64Array, p: number, out: Float64Array) {
    const qq = this.smQuat!;
    let x = qq[p * 4], y = qq[p * 4 + 1], z = qq[p * 4 + 2], w = qq[p * 4 + 3];
    const a = p * 9;
    for (let it = 0; it < 6; it++) {
      // R from quaternion (columns r0, r1, r2).
      const r00 = 1 - 2 * (y * y + z * z), r01 = 2 * (x * y - z * w), r02 = 2 * (x * z + y * w);
      const r10 = 2 * (x * y + z * w), r11 = 1 - 2 * (x * x + z * z), r12 = 2 * (y * z - x * w);
      const r20 = 2 * (x * z - y * w), r21 = 2 * (y * z + x * w), r22 = 1 - 2 * (x * x + y * y);
      // omega = sum_j r_j × a_j / |sum r_j · a_j|
      const a0x = A[a], a0y = A[a + 3], a0z = A[a + 6];
      const a1x = A[a + 1], a1y = A[a + 4], a1z = A[a + 7];
      const a2x = A[a + 2], a2y = A[a + 5], a2z = A[a + 8];
      const ox = r10 * a0z - r20 * a0y + (r11 * a1z - r21 * a1y) + (r12 * a2z - r22 * a2y);
      const oy = r20 * a0x - r00 * a0z + (r21 * a1x - r01 * a1z) + (r22 * a2x - r02 * a2z);
      const oz = r00 * a0y - r10 * a0x + (r01 * a1y - r11 * a1x) + (r02 * a2y - r12 * a2x);
      const den = Math.abs(r00 * a0x + r10 * a0y + r20 * a0z + r01 * a1x + r11 * a1y + r21 * a1z + r02 * a2x + r12 * a2y + r22 * a2z) + 1e-12;
      const wx = ox / den, wy = oy / den, wz = oz / den;
      const ang = Math.sqrt(wx * wx + wy * wy + wz * wz);
      if (ang < 1e-9) break;
      const h = ang / 2, sn = Math.sin(h) / ang;
      const dx = wx * sn, dy = wy * sn, dz = wz * sn, dw = Math.cos(h);
      const nx = dw * x + dx * w + dy * z - dz * y;
      const ny = dw * y - dx * z + dy * w + dz * x;
      const nz = dw * z + dx * y - dy * x + dz * w;
      const nw = dw * w - dx * x - dy * y - dz * z;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
      x = nx / l; y = ny / l; z = nz / l; w = nw / l;
    }
    qq[p * 4] = x; qq[p * 4 + 1] = y; qq[p * 4 + 2] = z; qq[p * 4 + 3] = w;
    const o = p * 9;
    out[o] = 1 - 2 * (y * y + z * z); out[o + 1] = 2 * (x * y - z * w); out[o + 2] = 2 * (x * z + y * w);
    out[o + 3] = 2 * (x * y + z * w); out[o + 4] = 1 - 2 * (x * x + z * z); out[o + 5] = 2 * (y * z - x * w);
    out[o + 6] = 2 * (x * z - y * w); out[o + 7] = 2 * (y * z + x * w); out[o + 8] = 1 - 2 * (x * x + y * y);
  }

  /** Translate the whole body (used to place it on the stage). */
  translate(dx: number, dy: number, dz: number) {
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3] += dx;
      this.pos[i * 3 + 1] += dy;
      this.pos[i * 3 + 2] += dz;
    }
    this.prev.set(this.pos);
  }

  reset(dx = 0, dy = 0, dz = 0) {
    this.restoreRestShape();
    this.pos.set(this.rest);
    this.vel.fill(0);
    this.endGrab();
    this.translate(dx, dy, dz);
  }

  /** Advance by one fixed frame step. */
  step(dt: number) {
    const n = this.substeps;
    const sdt = dt / n;
    // Per-substep share of the per-frame rigidity, so feel doesn't depend on substeps.
    const rig = Math.min(0.995, this.params.rigidity ?? 0);
    const smK = rig > 0 ? 1 - Math.pow(1 - rig, 1 / n) : 0;
    for (let s = 0; s < n; s++) {
      this.integrate(sdt);
      this.solveEdges(sdt);
      this.solveVolumes(sdt);
      if (this.grabbing) this.solveGrab(sdt);
      // After the grab: a held solid is carried as a whole instead of stretching locally.
      if (smK > 0) this.solveShapeMatching(smK);
      this.solveCollisions();
      this.updateVelocities(sdt);
      this.applyContactFriction(sdt);
      if (this.holdHorizontal) this.cancelHorizontalDrift();
      this.applyEdgeDamping(sdt);
    }
    this.applyContactDrag(dt);
    this.applyAirDragAndClamp(dt);
    this.applyPlasticity(dt);
  }

  /**
   * Rolling resistance: while resting on the floor, all motion (rigid rocking and rolling
   * included) decays in proportion to how much of the body is in contact. Stiff, round
   * objects would otherwise rock forever, since internal damping deliberately ignores rigid
   * motion. Airborne bodies are untouched.
   */
  private applyContactDrag(dt: number) {
    let touching = 0;
    for (let i = 0; i < this.count; i++) touching += this.contact[i];
    if (touching === 0) return;
    const share = Math.min(1, (touching / this.count) * SIM.contactDragShare);
    const k = Math.exp(-SIM.contactDrag * share * dt);
    const v = this.vel;
    for (let i = 0; i < v.length; i++) v[i] *= k;
  }

  /**
   * Internal damping: removes the relative velocity of each edge's endpoints *along* the
   * edge. Rigid translation and rotation have no along-edge component, so throws and spins
   * keep their momentum while squash, stretch and wobble settle - including squash against
   * the floor, which a centre-of-mass based damper cannot see. Runs every substep: stiff
   * materials vibrate faster than a sparser schedule can sample, and would ring forever.
   */
  private applyEdgeDamping(dt: number) {
    const k = 1 - Math.exp(-this.params.damping * dt * SIM.edgeDampingScale);
    if (k <= 0) return;
    const { pos, vel, invMass, edges } = this;
    const count = edges.length / 2;
    for (let e = 0; e < count; e++) {
      const i = edges[e * 2];
      const j = edges[e * 2 + 1];
      const wi = invMass[i];
      const wj = invMass[j];
      const w = wi + wj;
      if (w === 0) continue;
      const a = i * 3;
      const b = j * 3;
      let nx = pos[b] - pos[a];
      let ny = pos[b + 1] - pos[a + 1];
      let nz = pos[b + 2] - pos[a + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len < 1e-9) continue;
      nx /= len;
      ny /= len;
      nz /= len;
      const vr =
        (vel[b] - vel[a]) * nx + (vel[b + 1] - vel[a + 1]) * ny + (vel[b + 2] - vel[a + 2]) * nz;
      const c = (vr * k) / w;
      vel[a] += nx * c * wi;
      vel[a + 1] += ny * c * wi;
      vel[a + 2] += nz * c * wi;
      vel[b] -= nx * c * wj;
      vel[b + 1] -= ny * c * wj;
      vel[b + 2] -= nz * c * wj;
    }
  }

  private integrate(sdt: number) {
    const { pos, prev, vel, invMass } = this;
    const g = SIM.gravity * sdt;
    for (let i = 0; i < this.count; i++) {
      if (invMass[i] === 0) continue;
      const k = i * 3;
      vel[k + 1] += g;
      prev[k] = pos[k];
      prev[k + 1] = pos[k + 1];
      prev[k + 2] = pos[k + 2];
      pos[k] += vel[k] * sdt;
      pos[k + 1] += vel[k + 1] * sdt;
      pos[k + 2] += vel[k + 2] * sdt;
    }
  }

  private solveEdges(sdt: number) {
    const { pos, invMass, edges, restLen } = this;
    const invStiffDt2 = 1 / (this.params.stiffness * sdt * sdt);
    const count = restLen.length;
    for (let e = 0; e < count; e++) {
      const i = edges[e * 2];
      const j = edges[e * 2 + 1];
      const wi = invMass[i];
      const wj = invMass[j];
      const w = wi + wj;
      if (w === 0) continue;
      const a = i * 3;
      const b = j * 3;
      const dx = pos[a] - pos[b];
      const dy = pos[a + 1] - pos[b + 1];
      const dz = pos[a + 2] - pos[b + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-9) continue;
      const rl = restLen[e];
      // Spring stiffness of an edge ≈ E * restLength, so compliance = 1 / (E * L).
      const alpha = invStiffDt2 / rl;
      const s = -(len - rl) / (w + alpha) / len;
      pos[a] += dx * s * wi;
      pos[a + 1] += dy * s * wi;
      pos[a + 2] += dz * s * wi;
      pos[b] -= dx * s * wj;
      pos[b + 1] -= dy * s * wj;
      pos[b + 2] -= dz * s * wj;
    }
  }

  private readonly grads = new Float32Array(12);

  private solveVolumes(sdt: number) {
    const { pos, invMass, tets, restVol, grads, tetOrder } = this;
    const bulk = this.params.bulk;
    const invBulkDt2 = Number.isFinite(bulk) ? 1 / (bulk * sdt * sdt) : 0;
    const count = restVol.length;
    for (let n = 0; n < count; n++) {
      const t = tetOrder[n];
      const base = t * 4;
      let w = 0;
      for (let j = 0; j < 4; j++) {
        const o = VOL_ORDER[j];
        const p0 = tets[base + o[0]] * 3;
        const p1 = tets[base + o[1]] * 3;
        const p2 = tets[base + o[2]] * 3;
        const ax = pos[p1] - pos[p0], ay = pos[p1 + 1] - pos[p0 + 1], az = pos[p1 + 2] - pos[p0 + 2];
        const bx = pos[p2] - pos[p0], by = pos[p2 + 1] - pos[p0 + 1], bz = pos[p2 + 2] - pos[p0 + 2];
        const gx = (ay * bz - az * by) / 6;
        const gy = (az * bx - ax * bz) / 6;
        const gz = (ax * by - ay * bx) / 6;
        grads[j * 3] = gx;
        grads[j * 3 + 1] = gy;
        grads[j * 3 + 2] = gz;
        w += invMass[tets[base + j]] * (gx * gx + gy * gy + gz * gz);
      }
      if (w === 0) continue;
      const vol = tetVolume(pos, tets[base], tets[base + 1], tets[base + 2], tets[base + 3]);
      // Volume stiffness of a tet = K / V0, so compliance = V0 / K.
      const alpha = invBulkDt2 * restVol[t];
      const s = -(vol - restVol[t]) / (w + alpha);
      for (let j = 0; j < 4; j++) {
        const id = tets[base + j];
        const k = s * invMass[id];
        pos[id * 3] += grads[j * 3] * k;
        pos[id * 3 + 1] += grads[j * 3 + 1] * k;
        pos[id * 3 + 2] += grads[j * 3 + 2] * k;
      }
    }
  }

  private solveCollisions() {
    const { pos, prev } = this;
    const { halfWidth, halfDepth, ceiling } = SIM.bounds;
    const floor = this.floorY;
    const contact = this.contact;
    const vel = this.vel;
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      const was = contact[i];
      contact[i] = 0;
      if (pos[k + 1] <= floor) {
        pos[k + 1] = floor;
        // Never let a contact particle move upward faster than it moved before landing:
        // prev is clamped so the floor adds no artificial bounce.
        if (prev[k + 1] < floor) prev[k + 1] = floor;
        contact[i] = 1;
        if (!was) {
          // Landing: record how hard (drives impact sounds and particles).
          const s = -vel[k + 1];
          if (s > this.impactSpeed) this.impactSpeed = s;
          this.impactCount++;
        }
      }
      if (pos[k + 1] > ceiling) pos[k + 1] = ceiling;
      if (pos[k] < -halfWidth) pos[k] = -halfWidth;
      else if (pos[k] > halfWidth) pos[k] = halfWidth;
      if (pos[k + 2] < -halfDepth) pos[k + 2] = -halfDepth;
      else if (pos[k + 2] > halfDepth) pos[k + 2] = halfDepth;
    }
    if (this.colliders.length) this.solveColliders();
    if (this.pieceCount > 1) this.solvePieceCollisions();
  }

  /**
   * While a tool presses on the body (poke), cancel its net horizontal drift: the object
   * stays put and dents, like jelly gripping its plate, instead of sliding away.
   */
  holdHorizontal = false;

  private cancelHorizontalDrift() {
    const { vel, mass } = this;
    let m = 0, vx = 0, vz = 0;
    for (let i = 0; i < this.count; i++) {
      m += mass[i];
      vx += vel[i * 3] * mass[i];
      vz += vel[i * 3 + 2] * mass[i];
    }
    if (m === 0) return;
    vx /= m;
    vz /= m;
    for (let i = 0; i < this.count; i++) {
      vel[i * 3] -= vx;
      vel[i * 3 + 2] -= vz;
    }
  }

  /** Kinematic tool colliders (poke fingertip, press plate). Contact depth feeds audio. */
  colliders: Collider[] = [];

  /** Piece id per node; pieces collide with each other but not with themselves. */
  nodePiece: Uint16Array = new Uint16Array(0);
  pieceCount = 1;
  /** Inter-piece contact distance (world units), set from the lattice cell size. */
  pieceGap = 0.04;

  /** Build a body for a (cut) topology, carrying over its node state. */
  static fromTopology(top: Topology, params: SoftBodyParams): SoftBody {
    const edges = uniqueEdges(top.tets, top.rest.length / 3);
    shuffleRecords(edges, 2, seededRandom(0x5eed));
    const body = new SoftBody(
      { positions: new Float32Array(top.rest), tets: top.tets, edges } as unknown as TetMesh,
      params,
    );
    body.rest.set(top.rest);
    body.pos.set(top.pos);
    body.prev.set(top.prev);
    body.vel.set(top.vel);
    body.nodePiece = top.nodePiece;
    body.pieceCount = top.pieceCount;
    return body;
  }

  // Spatial hash scratch for inter-piece collisions.
  private hashHead = new Int32Array(0);
  private hashNext = new Int32Array(0);

  /** Keep different pieces from passing through each other (node-level, spatial hash). */
  private solvePieceCollisions() {
    const n = this.count;
    const { pos, invMass, nodePiece } = this;
    const r = this.pieceGap;
    const inv = 1 / r;
    const TABLE = 8192;
    if (this.hashHead.length !== TABLE) this.hashHead = new Int32Array(TABLE);
    if (this.hashNext.length < n) this.hashNext = new Int32Array(n);
    const head = this.hashHead.fill(-1);
    const next = this.hashNext;
    const cellKey = (x: number, y: number, z: number) =>
      ((Math.floor(x * inv) * 92837111) ^ (Math.floor(y * inv) * 689287499) ^ (Math.floor(z * inv) * 283923481)) & (TABLE - 1);
    for (let i = 0; i < n; i++) {
      const k = cellKey(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      next[i] = head[k];
      head[k] = i;
    }
    const r2 = r * r;
    for (let i = 0; i < n; i++) {
      const xi = pos[i * 3], yi = pos[i * 3 + 1], zi = pos[i * 3 + 2];
      const cx = Math.floor(xi * inv), cy = Math.floor(yi * inv), cz = Math.floor(zi * inv);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const k = (((cx + dx) * 92837111) ^ ((cy + dy) * 689287499) ^ ((cz + dz) * 283923481)) & (TABLE - 1);
        for (let j = head[k]; j >= 0; j = next[j]) {
          if (j <= i || nodePiece[j] === nodePiece[i]) continue;
          const ex = pos[j * 3] - xi, ey = pos[j * 3 + 1] - yi, ez = pos[j * 3 + 2] - zi;
          const d2 = ex * ex + ey * ey + ez * ez;
          if (d2 >= r2 || d2 < 1e-12) continue;
          const d = Math.sqrt(d2);
          const wi = invMass[i], wj = invMass[j];
          const w = wi + wj;
          if (w === 0) continue;
          // Cap the push per substep: freshly cut seams start almost touching, and an
          // uncapped push would turn into a violent separation velocity.
          const s = Math.min(r - d, PIECE_PUSH_PER_SUBSTEP) / d / w;
          pos[i * 3] -= ex * s * wi; pos[i * 3 + 1] -= ey * s * wi; pos[i * 3 + 2] -= ez * s * wi;
          pos[j * 3] += ex * s * wj; pos[j * 3 + 1] += ey * s * wj; pos[j * 3 + 2] += ez * s * wj;
        }
      }
    }
  }

  /**
   * Surface proxies: sample points on the visible surface, embedded in the tets. Tool
   * colliders act on these (not on lattice nodes), so contact happens exactly at the
   * surface and small tools cannot slip between lattice nodes.
   */
  private proxyTet: Uint32Array = new Uint32Array(0);
  private proxyBary: Float32Array = new Float32Array(0);

  setSurfaceProxies(tet: Uint32Array, bary: Float32Array) {
    this.proxyTet = tet;
    this.proxyBary = bary;
  }

  private solveColliders() {
    const { pos, invMass, tets, proxyTet, proxyBary } = this;
    const useProxies = proxyTet.length > 0;
    for (const c of this.colliders) {
      c.depth = 0;
      c.contacts = 0;
      const n = useProxies ? proxyTet.length : this.count;
      for (let p = 0; p < n; p++) {
        // Current position of the sample point.
        let x: number, y: number, z: number;
        let t = 0;
        if (useProxies) {
          t = proxyTet[p] * 4;
          const b0 = proxyBary[p * 4], b1 = proxyBary[p * 4 + 1], b2 = proxyBary[p * 4 + 2], b3 = proxyBary[p * 4 + 3];
          const i0 = tets[t] * 3, i1 = tets[t + 1] * 3, i2 = tets[t + 2] * 3, i3 = tets[t + 3] * 3;
          x = pos[i0] * b0 + pos[i1] * b1 + pos[i2] * b2 + pos[i3] * b3;
          y = pos[i0 + 1] * b0 + pos[i1 + 1] * b1 + pos[i2 + 1] * b2 + pos[i3 + 1] * b3;
          z = pos[i0 + 2] * b0 + pos[i1 + 2] * b1 + pos[i2 + 2] * b2 + pos[i3 + 2] * b3;
        } else {
          x = pos[p * 3]; y = pos[p * 3 + 1]; z = pos[p * 3 + 2];
        }
        // Desired displacement of the sample point.
        let mx = 0, my: number, mz = 0, pen: number;
        if (c.kind === 'sphere') {
          const dx = x - c.x, dy = y - c.y, dz = z - c.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          // Count near-touching points as contact (resting contact sits right at r).
          const touch = c.r * 1.04;
          if (d2 >= touch * touch) continue;
          const d = Math.sqrt(d2);
          pen = Math.max(0, c.r - d);
          if (d > 1e-6) {
            mx = (dx / d) * pen; my = (dy / d) * pen; mz = (dz / d) * pen;
          } else {
            my = -pen;
          }
        } else {
          if (y <= c.y - 0.004) continue;
          pen = Math.max(0, y - c.y);
          my = -pen;
        }
        if (pen > c.depth) c.depth = pen;
        c.contacts++;
        if (!useProxies) {
          pos[p * 3] += mx; pos[p * 3 + 1] += my; pos[p * 3 + 2] += mz;
          continue;
        }
        // Distribute to the tet nodes (PBD for an embedded point): node k moves by
        // b_k * w_k * m / sum(b_j^2 * w_j), which moves the point by exactly m.
        let denom = 0;
        for (let k = 0; k < 4; k++) {
          const b = proxyBary[p * 4 + k];
          denom += b * b * invMass[tets[t + k]];
        }
        if (denom < 1e-12) continue;
        for (let k = 0; k < 4; k++) {
          const node = tets[t + k];
          const f = (proxyBary[p * 4 + k] * invMass[node]) / denom;
          pos[node * 3] += mx * f;
          pos[node * 3 + 1] += my * f;
          pos[node * 3 + 2] += mz * f;
        }
      }
    }
  }

  /**
   * Velocity-level floor friction: kinetic friction decays sliding quickly, and very slow
   * sliding sticks (static friction). Tossed objects tumble instead of skating.
   */
  private applyContactFriction(sdt: number) {
    const { vel, contact } = this;
    const decay = Math.exp(-SIM.floorFriction * sdt);
    const stick2 = SIM.staticFrictionSpeed * SIM.staticFrictionSpeed;
    for (let i = 0; i < this.count; i++) {
      if (contact[i] === 0) continue;
      const k = i * 3;
      if (vel[k + 1] < 0) vel[k + 1] = 0;
      const vx = vel[k], vz = vel[k + 2];
      if (vx * vx + vz * vz < stick2) {
        vel[k] = 0;
        vel[k + 2] = 0;
      } else {
        vel[k] = vx * decay;
        vel[k + 2] = vz * decay;
      }
    }
  }

  private updateVelocities(sdt: number) {
    const { pos, prev, vel, invMass } = this;
    const inv = 1 / sdt;
    for (let i = 0; i < this.count; i++) {
      if (invMass[i] === 0) continue;
      const k = i * 3;
      vel[k] = (pos[k] - prev[k]) * inv;
      vel[k + 1] = (pos[k + 1] - prev[k + 1]) * inv;
      vel[k + 2] = (pos[k + 2] - prev[k + 2]) * inv;
    }
  }

  private applyAirDragAndClamp(dt: number) {
    const drag = Math.exp(-SIM.airDrag * dt);
    const max2 = SIM.maxSpeed * SIM.maxSpeed;
    const { vel } = this;
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      let x = vel[j] * drag, y = vel[j + 1] * drag, z = vel[j + 2] * drag;
      const s2 = x * x + y * y + z * z;
      if (s2 > max2) {
        const f = SIM.maxSpeed / Math.sqrt(s2);
        x *= f; y *= f; z *= f;
      }
      vel[j] = x; vel[j + 1] = y; vel[j + 2] = z;
    }
  }

  // ---------------------------------------------------------------- grabbing

  /**
   * Grab the region around `hit`: particles within `radius` are pulled toward the pointer
   * with a falloff, which reads as a soft pinch rather than a single stretched vertex.
   */
  beginGrab(hit: ArrayLike<number>, radius: number, compliance: number, piece = -1): boolean {
    const idx: number[] = [];
    const weights: number[] = [];
    const offsets: number[] = [];
    let nearest = -1;
    let nearestD = Infinity;
    for (let i = 0; i < this.count; i++) {
      if (piece >= 0 && this.nodePiece[i] !== piece) continue;
      const j = i * 3;
      const dx = this.pos[j] - hit[0];
      const dy = this.pos[j + 1] - hit[1];
      const dz = this.pos[j + 2] - hit[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < nearestD) {
        nearestD = d;
        nearest = i;
      }
      if (d < radius) {
        const f = 1 - d / radius;
        idx.push(i);
        weights.push(f * f);
        offsets.push(dx, dy, dz);
      }
    }
    if (idx.length === 0 && nearest >= 0) {
      const j = nearest * 3;
      idx.push(nearest);
      weights.push(1);
      offsets.push(this.pos[j] - hit[0], this.pos[j + 1] - hit[1], this.pos[j + 2] - hit[2]);
    }
    if (idx.length === 0) return false;
    this.grabIdx = new Uint32Array(idx);
    this.grabWeight = new Float32Array(weights);
    this.grabOffset = new Float32Array(offsets);
    this.grabTarget.set([hit[0], hit[1], hit[2]]);
    // Solids are carried, not stretched: a softer grip lets shape matching move the whole
    // body (it trails the pointer slightly, which reads as weight).
    this.grabCompliance = compliance * (1 + 15 * (this.params.rigidity ?? 0));
    this.grabbing = true;
    return true;
  }

  moveGrab(target: ArrayLike<number>) {
    this.grabTarget[0] = target[0];
    this.grabTarget[1] = target[1];
    this.grabTarget[2] = target[2];
  }

  endGrab() {
    this.grabbing = false;
    this.grabIdx = new Uint32Array(0);
  }

  private solveGrab(sdt: number) {
    const { pos, invMass, grabIdx, grabWeight, grabOffset, grabTarget } = this;
    const a = this.grabCompliance / (sdt * sdt);
    for (let n = 0; n < grabIdx.length; n++) {
      const i = grabIdx[n];
      const w = invMass[i];
      if (w === 0) continue;
      const s = w / (w + a / grabWeight[n]);
      const j = i * 3;
      pos[j] += (grabTarget[0] + grabOffset[n * 3] - pos[j]) * s;
      pos[j + 1] += (grabTarget[1] + grabOffset[n * 3 + 1] - pos[j + 1]) * s;
      pos[j + 2] += (grabTarget[2] + grabOffset[n * 3 + 2] - pos[j + 2]) * s;
    }
  }

  // ---------------------------------------------------------------- stats

  currentVolume(): number {
    let v = 0;
    const { tets, pos } = this;
    for (let t = 0; t < tets.length; t += 4) v += tetVolume(pos, tets[t], tets[t + 1], tets[t + 2], tets[t + 3]);
    return v;
  }

  kineticEnergy(): number {
    let e = 0;
    const { vel, mass } = this;
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      e += 0.5 * mass[i] * (vel[j] * vel[j] + vel[j + 1] * vel[j + 1] + vel[j + 2] * vel[j + 2]);
    }
    return e;
  }

  centerOfMass(out: Float32Array | number[] = new Float32Array(3)) {
    let M = 0, x = 0, y = 0, z = 0;
    for (let i = 0; i < this.count; i++) {
      const m = this.mass[i];
      M += m;
      x += this.pos[i * 3] * m;
      y += this.pos[i * 3 + 1] * m;
      z += this.pos[i * 3 + 2] * m;
    }
    out[0] = x / M;
    out[1] = y / M;
    out[2] = z / M;
    return out;
  }
}
