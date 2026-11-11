/**
 * XPBD soft-body solver (CPU). Edge (shear/stretch) + tet volume constraints,
 * solved with the "small steps" scheme: many substeps, one iteration each.
 *
 * Feel parameters are expressed as material moduli rather than raw compliance so the
 * behaviour stays the same when the lattice resolution changes (auto-quality).
 */
import { SIM } from '../config';
import { seededRandom, tetVolume, type TetMesh } from './lattice';

export interface SoftBodyParams {
  /** Young's-modulus-like stiffness of edges. Higher = firmer. */
  stiffness: number;
  /** Bulk modulus for volume preservation; Infinity = incompressible. */
  bulk: number;
  /** Internal damping rate (1/s): removes non-rigid motion only, so tosses keep momentum. */
  damping: number;
  /** Simulation density (mass per unit volume). */
  density: number;
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
    this.pos.set(this.rest);
    this.vel.fill(0);
    this.endGrab();
    this.translate(dx, dy, dz);
  }

  /** Advance by one fixed frame step. */
  step(dt: number) {
    const n = this.substeps;
    const sdt = dt / n;
    for (let s = 0; s < n; s++) {
      this.integrate(sdt);
      this.solveEdges(sdt);
      this.solveVolumes(sdt);
      if (this.grabbing) this.solveGrab(sdt);
      this.solveCollisions();
      this.updateVelocities(sdt);
      this.applyContactFriction(sdt);
      if ((s & 3) === 3 || s === n - 1) this.applyEdgeDamping(sdt * ((s & 3) + 1));
    }
    this.applyAirDragAndClamp(dt);
  }

  /**
   * Internal damping: removes the relative velocity of each edge's endpoints *along* the
   * edge. Rigid translation and rotation have no along-edge component, so throws and spins
   * keep their momentum while squash, stretch and wobble settle - including squash against
   * the floor, which a centre-of-mass based damper cannot see. Run every few substeps.
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
      // Spring stiffness of an edge â‰ˆ E * restLength, so compliance = 1 / (E * L).
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
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      contact[i] = 0;
      if (pos[k + 1] <= floor) {
        pos[k + 1] = floor;
        // Never let a contact particle move upward faster than it moved before landing:
        // prev is clamped so the floor adds no artificial bounce.
        if (prev[k + 1] < floor) prev[k + 1] = floor;
        contact[i] = 1;
      }
      if (pos[k + 1] > ceiling) pos[k + 1] = ceiling;
      if (pos[k] < -halfWidth) pos[k] = -halfWidth;
      else if (pos[k] > halfWidth) pos[k] = halfWidth;
      if (pos[k + 2] < -halfDepth) pos[k + 2] = -halfDepth;
      else if (pos[k + 2] > halfDepth) pos[k + 2] = halfDepth;
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
  beginGrab(hit: ArrayLike<number>, radius: number, compliance: number): boolean {
    const idx: number[] = [];
    const weights: number[] = [];
    const offsets: number[] = [];
    let nearest = -1;
    let nearestD = Infinity;
    for (let i = 0; i < this.count; i++) {
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
    this.grabCompliance = compliance;
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
