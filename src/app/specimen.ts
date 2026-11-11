/**
 * A specimen: one object on stage, possibly cut into pieces. Owns the soft body (all
 * pieces share one solver), one render mesh per piece, each piece's rest-space SDF (the
 * original shape intersected with every cut that made it), interpolation buffers, region
 * weights for special actions and the "show mesh" wireframe.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  LineBasicNodeMaterial,
  LineSegments,
  type Material,
  type Mesh,
  type Scene,
} from 'three/webgpu';
import { SIM } from '../config';
import { filterTriangles, type ObjectMesher } from '../objects/build';
import type { Shape, Variant } from '../objects/types';
import { DeformableMesh } from '../render/deformMesh';
import { buildCellTets, buildTetInverses, embedInPiece, type CellTets } from '../sim/embed';
import { buildLatticeTetMesh, tetVolume, type Sdf, type TetMesh, type Vec3Tuple } from '../sim/lattice';
import { SoftBody, type SoftBodyParams } from '../sim/softbody';
import { rigidFit, splitTopology, type Topology } from '../sim/topology';

/** Surface sample points per piece used for tool contact. */
const PROXY_TARGET = 1800;
/** A side of a cut needs at least this many tets to become a piece (avoids slivers). */
const MIN_TETS_PER_SIDE = 10;
/** Pieces smaller than this fraction of the original fade away. */
const SHARD_FRACTION = 0.012;
const SHARD_FADE_SECONDS = 0.7;
export const MAX_PIECES = 24;

export type Field = (x: number, y: number, z: number) => number;

export interface Piece {
  sdf: Sdf;
  view: DeformableMesh;
  detailIds: number[];
  restVolume: number;
  /** Seconds of fade remaining (0 = alive). */
  fade: number;
  fadeTotal: number;
  /** Lift while fading (scooped pieces rise out of the spoon). */
  lift: number;
}

export interface SpecimenOptions {
  shape: Shape;
  mesher: ObjectMesher;
  variant: Variant;
  params: SoftBodyParams;
  material: Material;
  /** Lattice cells across the largest dimension. */
  resolution: number;
  /** Drop height above the floor when spawned. */
  dropHeight?: number;
}

export interface CutOptions {
  /** World-space separation velocity applied along ±normal. */
  normal?: [number, number, number];
  separation?: number;
  /** Fade (remove) the pieces on the negative side of the field (scoops, bites). */
  removeInside?: boolean;
  /** Lift applied while fading removed pieces. */
  lift?: number;
  /** Only cut these pieces (default: all). */
  only?: number[];
}

export class Specimen {
  body!: SoftBody;
  pieces: Piece[] = [];
  readonly shape: Shape;
  readonly tetMesh: TetMesh;
  /** Rest height of the visible object (floor to top). */
  readonly height: number;
  readonly originalVolume: number;
  variant: Variant;
  /** Bumped on every topology change (tools re-read state). */
  revision = 0;

  private tetOrig!: Int32Array;
  private tetPiece!: Uint16Array;
  private prevStep!: Float64Array;
  private lerped!: Float64Array;
  private wire: LineSegments | null = null;
  private readonly regionWeights = new Map<string, Float32Array>();
  private cellTets: CellTets = { start: new Int32Array(1), list: new Int32Array(0) };
  private tetInverses: Float32Array = new Float32Array(0);
  private readonly spawnY: number;
  private readonly floorY: number;
  private readonly params: SoftBodyParams;
  private readonly material: Material;
  private readonly mesher: ObjectMesher;
  private substeps: number = SIM.substeps;

  constructor(private readonly scene: Scene, opts: SpecimenOptions) {
    this.shape = opts.shape;
    this.mesher = opts.mesher;
    this.variant = opts.variant;
    this.material = opts.material;
    this.params = { ...opts.params };
    const { min, max } = opts.shape.bounds;
    this.tetMesh = buildLatticeTetMesh(opts.shape.sdf, min, max, opts.shape.size / opts.resolution, {
      inflate: opts.shape.inflate,
    });

    // Whole-object render mesh decides floor offset and height.
    const whole = this.mesher.buildWhole(this.variant);
    const pos = whole.getAttribute('position').array as Float32Array;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < pos.length; i += 3) {
      minY = Math.min(minY, pos[i]);
      maxY = Math.max(maxY, pos[i]);
    }
    this.height = maxY - minY;
    let minParticleY = Infinity;
    for (let i = 1; i < this.tetMesh.positions.length; i += 3) minParticleY = Math.min(minParticleY, this.tetMesh.positions[i]);
    // Particles may sit outside the surface: lower the particle floor so the visible
    // surface (not the lattice) rests on y = 0.
    this.floorY = minParticleY - minY;
    this.spawnY = -minY + (opts.dropHeight ?? 0);

    let vol = 0;
    const t = this.tetMesh.tets;
    for (let k = 0; k < t.length; k += 4) vol += tetVolume(this.tetMesh.positions, t[k], t[k + 1], t[k + 2], t[k + 3]);
    this.originalVolume = vol;

    this.initWhole(whole, this.spawnY);
  }

  /** (Re)build the uncut object from scratch. */
  private initWhole(geometry: BufferGeometry, lift: number) {
    for (const p of this.pieces) this.disposePiece(p);
    const rest = new Float64Array(this.tetMesh.positions);
    const nTets = this.tetMesh.tets.length / 4;
    const top: Topology = {
      rest,
      pos: new Float64Array(rest),
      prev: new Float64Array(rest),
      vel: new Float64Array(rest.length),
      tets: new Uint32Array(this.tetMesh.tets),
      tetOrig: new Int32Array(nTets).map((_, i) => i),
      tetPiece: new Uint16Array(nTets),
      nodePiece: new Uint16Array(rest.length / 3),
      pieceCount: 1,
    };
    for (let i = 1; i < top.pos.length; i += 3) {
      top.pos[i] += lift;
      top.prev[i] += lift;
    }
    this.adoptTopology(top);
    const piece = this.makePiece(this.shape.sdf, geometry, 0, this.mesher.detailCentroids.map((_, i) => i));
    piece.restVolume = this.originalVolume;
    this.pieces = [piece];
    this.refreshProxies();
    this.revision++;
  }

  /** Install a topology: new solver body, tet bookkeeping, buffers. */
  private adoptTopology(top: Topology) {
    const old = this.body;
    const body = SoftBody.fromTopology(top, this.params);
    body.params = this.params;
    body.substeps = old?.substeps ?? this.substeps;
    body.floorY = this.floorY;
    body.pieceGap = this.tetMesh.lattice.cellSize * 0.42;
    this.applyBallast(body);
    if (old) {
      body.colliders = old.colliders;
      body.holdHorizontal = old.holdHorizontal;
    }
    this.body = body;
    this.tetOrig = top.tetOrig;
    this.tetPiece = top.tetPiece;
    this.prevStep = new Float64Array(body.pos);
    this.lerped = new Float64Array(body.pos);
    this.regionWeights.clear();
    // Original cell → current tets (pieces may share a cell).
    const d = this.tetMesh.lattice.dims;
    this.cellTets = buildCellTets(d[0] * d[1] * d[2], this.tetMesh.tetCell, top.tetOrig);
    this.tetInverses = buildTetInverses(top.rest, top.tets);
    if (this.wire) {
      this.setShowMesh(false);
      this.setShowMesh(true);
    }
  }

  /** Weight the base: mass grows toward the bottom of the (rest) shape. */
  private applyBallast(body: SoftBody) {
    const k = this.shape.ballast ?? 0;
    if (k <= 0) return;
    const { min, max } = this.shape.bounds;
    const span = max[1] - min[1] || 1;
    for (let i = 0; i < body.count; i++) {
      const t = Math.min(1, Math.max(0, (body.rest[i * 3 + 1] - min[1]) / span));
      body.mass[i] *= 1 + k * (1 - t) * (1 - t);
      body.invMass[i] = body.mass[i] > 0 ? 1 / body.mass[i] : 0;
    }
  }

  private makePiece(sdf: Sdf, geometry: BufferGeometry, index: number, detailIds: number[]): Piece {
    const pos = geometry.getAttribute('position').array as Float32Array;
    const emb = embedInPiece(pos, this.body.rest, this.body.tets, this.tetPiece, index, this.tetMesh.lattice, this.cellTets, this.tetInverses);
    // Surfaces of other components that share this SDF region embed badly: drop them.
    const bodyVerts = (geometry.userData.piece?.bodyVerts as number | undefined) ?? pos.length / 3;
    // (Only far-off surfaces: rippled cuts legitimately reach half a cell past their tets.)
    filterTriangles(geometry, (v) => v >= bodyVerts || emb.score[v] > -2.5);
    const view = new DeformableMesh(geometry, emb, this.body.tets, this.material);
    this.scene.add(view.mesh);
    return { sdf, view, detailIds, restVolume: 0, fade: 0, fadeTotal: 0, lift: 0 };
  }

  private disposePiece(p: Piece) {
    this.scene.remove(p.view.mesh);
    p.view.dispose();
  }

  // ---------------------------------------------------------------- per frame

  set substepCount(n: number) {
    this.substeps = n;
    this.body.substeps = n;
  }

  step(dt: number) {
    this.prevStep.set(this.body.pos);
    this.body.step(dt);
    // Fade tiny shards and removed pieces; delete them when done.
    let finished = false;
    for (const p of this.pieces) {
      if (p.fade <= 0) continue;
      p.fade = Math.max(0, p.fade - dt);
      if (p.fade === 0) finished = true;
    }
    if (finished) this.dropFaded();
  }

  /** Update visuals from interpolated physics state. */
  render(alpha: number) {
    const a = this.prevStep;
    const b = this.body.pos;
    const out = this.lerped;
    for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * alpha;
    for (const p of this.pieces) {
      p.view.update(out);
      const m = p.view.mesh;
      if (p.fadeTotal > 0) {
        // Shrink toward the piece's centre and rise.
        const k = p.fade / p.fadeTotal;
        const f = p.view.footprint({ x: 0, z: 0, radius: 0, minY: 0 });
        const s = 0.15 + 0.85 * k;
        m.scale.setScalar(s);
        m.position.set(f.x * (1 - s), (1 - k) * p.lift, f.z * (1 - s));
      }
    }
    if (this.wire) this.updateWire(out);
  }

  meshes(): Mesh[] {
    return this.pieces.filter((p) => p.fade === 0).map((p) => p.view.mesh);
  }

  /** Union footprint of all visible pieces (contact shadow). */
  footprint(out: { x: number; z: number; radius: number; minY: number }) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity;
    const f = { x: 0, z: 0, radius: 0, minY: 0 };
    for (const p of this.pieces) {
      if (p.fade > 0) continue;
      p.view.footprint(f);
      minX = Math.min(minX, f.x - f.radius);
      maxX = Math.max(maxX, f.x + f.radius);
      minZ = Math.min(minZ, f.z - f.radius);
      maxZ = Math.max(maxZ, f.z + f.radius);
      minY = Math.min(minY, f.minY);
    }
    out.x = (minX + maxX) / 2;
    out.z = (minZ + maxZ) / 2;
    out.radius = Math.max(maxX - minX, maxZ - minZ) / 2;
    out.minY = minY;
    return out;
  }

  // ---------------------------------------------------------------- cutting

  get pieceCount() {
    return this.pieces.filter((p) => p.fade === 0).length;
  }

  /**
   * Cut along a world-space signed field (negative side vs positive side). Each piece the
   * field crosses splits in two; its new pieces get exact cut faces from the field mapped
   * into rest space. Returns false if nothing was cut (missed, sliver, or piece cap).
   */
  cut(field: Field, opts: CutOptions = {}): boolean {
    const body = this.body;
    const nT = body.tets.length / 4;
    const label = new Int32Array(nT);
    const nPieces = this.pieces.length;
    const counts = new Int32Array(nPieces * 2);
    const pos = body.pos;
    for (let t = 0; t < nT; t++) {
      const a = body.tets[t * 4] * 3, b = body.tets[t * 4 + 1] * 3, c = body.tets[t * 4 + 2] * 3, d = body.tets[t * 4 + 3] * 3;
      const side = field(
        (pos[a] + pos[b] + pos[c] + pos[d]) / 4,
        (pos[a + 1] + pos[b + 1] + pos[c + 1] + pos[d + 1]) / 4,
        (pos[a + 2] + pos[b + 2] + pos[c + 2] + pos[d + 2]) / 4,
      ) < 0 ? 0 : 1;
      label[t] = side;
      counts[this.tetPiece[t] * 2 + side]++;
    }
    const split = new Set<number>();
    for (let p = 0; p < nPieces; p++) {
      if (this.pieces[p].fade > 0) continue;
      if (opts.only && !opts.only.includes(p)) continue;
      if (counts[p * 2] >= MIN_TETS_PER_SIDE && counts[p * 2 + 1] >= MIN_TETS_PER_SIDE) split.add(p);
    }
    if (split.size === 0 || this.pieceCount + split.size > MAX_PIECES) return false;
    for (let t = 0; t < nT; t++) if (!split.has(this.tetPiece[t])) label[t] = 0;

    // Rest-space version of the field for every split piece (best-fit rigid transform).
    const restField = new Map<number, Field>();
    for (const p of split) {
      const nodes: number[] = [];
      for (let i = 0; i < body.count; i++) if (body.nodePiece[i] === p) nodes.push(i);
      const { C, c, R } = rigidFit(body.rest, body.pos, nodes, body.mass);
      restField.set(p, (x, y, z) => {
        const X = x - C[0], Y = y - C[1], Z = z - C[2];
        return field(
          R[0] * X + R[1] * Y + R[2] * Z + c[0],
          R[3] * X + R[4] * Y + R[5] * Z + c[1],
          R[6] * X + R[7] * Y + R[8] * Z + c[2],
        );
      });
    }

    const result = splitTopology(this.currentTopology(), label);
    this.applySplit(result, (_j, o) => {
      const parent = this.pieces[o.oldPiece];
      const f = restField.get(o.oldPiece)!;
      const parentSdf = parent.sdf;
      return o.label === 0 ? (x, y, z) => Math.max(parentSdf(x, y, z), f(x, y, z)) : (x, y, z) => Math.max(parentSdf(x, y, z), -f(x, y, z));
    }, split);

    // Separate the halves and fade what was scooped out.
    const sep = opts.separation ?? 0.35;
    for (let j = 0; j < this.pieces.length; j++) {
      const o = result.origin[j];
      if (!split.has(o.oldPiece)) continue;
      const sign = o.label === 0 ? -1 : 1;
      if (opts.normal && sep > 0) {
        const v: [number, number, number] = [opts.normal[0] * sep * sign, opts.normal[1] * sep * sign, opts.normal[2] * sep * sign];
        this.impulsePiece(j, v);
      }
      if (opts.removeInside && o.label === 0) this.fadePiece(j, SHARD_FADE_SECONDS, opts.lift ?? 0.25);
    }
    this.fadeShards();
    return true;
  }

  /** Remove pieces outright (after fading). */
  private dropFaded() {
    const nT = this.body.tets.length / 4;
    const label = new Int32Array(nT);
    let any = false;
    for (let t = 0; t < nT; t++) {
      const p = this.pieces[this.tetPiece[t]];
      if (p.fade === 0 && p.fadeTotal > 0) {
        label[t] = -1;
        any = true;
      }
    }
    if (!any) return;
    const result = splitTopology(this.currentTopology(), label);
    this.applySplit(result, () => {
      throw new Error('dropFaded never creates new surfaces');
    }, new Set());
  }

  private currentTopology(): Topology {
    const b = this.body;
    return {
      rest: b.rest,
      pos: b.pos,
      prev: b.prev,
      vel: b.vel,
      tets: b.tets,
      tetOrig: this.tetOrig,
      tetPiece: this.tetPiece,
      nodePiece: b.nodePiece,
      pieceCount: this.pieces.length,
    };
  }

  /**
   * Install a split: untouched pieces keep their meshes (tet indices remapped); pieces that
   * came from a split parent get a fresh SDF and mesh.
   */
  private applySplit(
    result: ReturnType<typeof splitTopology>,
    newSdf: (j: number, o: { oldPiece: number; label: number }) => Sdf,
    split: Set<number>,
  ) {
    const oldPieces = this.pieces;
    this.adoptTopology(result.topology);
    const top = result.topology;
    const next: Piece[] = [];
    // Children of each split parent, to hand out its details.
    const children = new Map<number, number[]>();
    result.origin.forEach((o, j) => {
      if (!split.has(o.oldPiece)) return;
      let list = children.get(o.oldPiece);
      if (!list) children.set(o.oldPiece, (list = []));
      list.push(j);
    });
    const sdfs = result.origin.map((o, j) => (split.has(o.oldPiece) ? newSdf(j, o) : oldPieces[o.oldPiece].sdf));

    for (let j = 0; j < result.origin.length; j++) {
      const o = result.origin[j];
      const parent = oldPieces[o.oldPiece];
      if (!split.has(o.oldPiece)) {
        parent.view.remapTets(result.tetMap, top.tets);
        next.push(parent);
        continue;
      }
      // Details go to whichever child contains them most.
      const detailIds = parent.detailIds.filter((id) => {
        const [x, y, z] = this.mesher.detailCentroids[id];
        let best = j;
        let bestD = Infinity;
        for (const k of children.get(o.oldPiece)!) {
          const d = sdfs[k](x, y, z);
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
        return best === j;
      });
      const [min, max] = this.restBounds(top, j);
      const geometry = this.mesher.build(sdfs[j], min, max, this.variant, detailIds);
      next.push(this.makePiece(sdfs[j], geometry, j, detailIds));
    }
    for (const p of oldPieces) if (!next.includes(p)) this.disposePiece(p);
    this.pieces = next;
    // Rest volumes per piece.
    const vols = new Float64Array(next.length);
    for (let t = 0; t < top.tetPiece.length; t++) {
      const k = t * 4;
      vols[top.tetPiece[t]] += tetVolume(top.rest, top.tets[k], top.tets[k + 1], top.tets[k + 2], top.tets[k + 3]);
    }
    next.forEach((p, i) => (p.restVolume = vols[i]));
    this.refreshProxies();
    this.revision++;
  }

  private restBounds(top: Topology, piece: number): [Vec3Tuple, Vec3Tuple] {
    const min: Vec3Tuple = [Infinity, Infinity, Infinity];
    const max: Vec3Tuple = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < top.nodePiece.length; i++) {
      if (top.nodePiece[i] !== piece) continue;
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], top.rest[i * 3 + k]);
        max[k] = Math.max(max[k], top.rest[i * 3 + k]);
      }
    }
    // Clip to the object's own bounds (lattice nodes overhang the surface a little).
    const b = this.shape.bounds;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.max(min[k], b.min[k]);
      max[k] = Math.min(max[k], b.max[k]);
    }
    return [min, max];
  }

  private fadeShards() {
    for (const p of this.pieces) {
      if (p.fade === 0 && p.fadeTotal === 0 && p.restVolume < this.originalVolume * SHARD_FRACTION) {
        p.fade = p.fadeTotal = SHARD_FADE_SECONDS;
      }
    }
  }

  fadePiece(j: number, seconds: number, lift = 0) {
    const p = this.pieces[j];
    if (!p || p.fadeTotal > 0) return;
    p.fade = p.fadeTotal = seconds;
    p.lift = lift;
  }

  /** Every piece contributes surface proxies for tool contact. */
  private refreshProxies() {
    const tets: number[] = [];
    const bary: number[] = [];
    for (const p of this.pieces) {
      const e = p.view.embedding;
      const stride = Math.max(1, Math.round((e.tet.length * this.pieces.length) / PROXY_TARGET));
      for (let i = 0; i < e.tet.length; i += stride) {
        tets.push(e.tet[i]);
        bary.push(e.bary[i * 4], e.bary[i * 4 + 1], e.bary[i * 4 + 2], e.bary[i * 4 + 3]);
      }
    }
    this.body.setSurfaceProxies(new Uint32Array(tets), new Float32Array(bary));
  }

  /**
   * For brittle objects: the snap plane nearest to a world point, as a world-space field
   * plus normal, or null if the object has no snap planes.
   */
  snapField(point: [number, number, number]): { field: Field; normal: [number, number, number] } | null {
    const planes = this.shape.snapPlanes;
    if (!planes?.length) return null;
    // Piece nearest the point.
    const b = this.body;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < b.count; i++) {
      const d = (b.pos[i * 3] - point[0]) ** 2 + (b.pos[i * 3 + 1] - point[1]) ** 2 + (b.pos[i * 3 + 2] - point[2]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = b.nodePiece[i];
      }
    }
    const nodes: number[] = [];
    for (let i = 0; i < b.count; i++) if (b.nodePiece[i] === best) nodes.push(i);
    const { C, c, R } = rigidFit(b.rest, b.pos, nodes, b.mass);
    let pick: { field: Field; normal: [number, number, number]; dist: number } | null = null;
    for (const [nx, ny, nz, d] of planes) {
      // World plane: n_w = R n, passing through R (p0 - C) + c with p0 = n d.
      const wn: [number, number, number] = [
        R[0] * nx + R[1] * ny + R[2] * nz,
        R[3] * nx + R[4] * ny + R[5] * nz,
        R[6] * nx + R[7] * ny + R[8] * nz,
      ];
      const p0 = [nx * d - C[0], ny * d - C[1], nz * d - C[2]];
      const wp = [
        R[0] * p0[0] + R[1] * p0[1] + R[2] * p0[2] + c[0],
        R[3] * p0[0] + R[4] * p0[1] + R[5] * p0[2] + c[1],
        R[6] * p0[0] + R[7] * p0[1] + R[8] * p0[2] + c[2],
      ];
      const wd = wn[0] * wp[0] + wn[1] * wp[1] + wn[2] * wp[2];
      const dist = Math.abs(wn[0] * point[0] + wn[1] * point[1] + wn[2] * point[2] - wd);
      if (!pick || dist < pick.dist) {
        pick = { field: (x, y, z) => wn[0] * x + wn[1] * y + wn[2] * z - wd, normal: wn, dist };
      }
    }
    return pick && { field: pick.field, normal: pick.normal };
  }

  /** Which piece owns a render mesh (for tools that act on one piece). */
  pieceOf(mesh: Mesh): number {
    return this.pieces.findIndex((p) => p.view.mesh === mesh);
  }

  impulsePiece(j: number, v: [number, number, number]) {
    const { vel, nodePiece } = this.body;
    for (let i = 0; i < this.body.count; i++) {
      if (nodePiece[i] !== j) continue;
      vel[i * 3] += v[0];
      vel[i * 3 + 1] += v[1];
      vel[i * 3 + 2] += v[2];
    }
  }

  // ---------------------------------------------------------------- whole-object actions

  /** Put the object back together and drop it in again. */
  reset(dropHeight = 0.6) {
    if (this.pieces.length > 1 || this.pieces[0]?.fadeTotal) {
      this.initWhole(this.mesher.buildWhole(this.variant), this.spawnY + dropHeight);
      return;
    }
    const body = this.body;
    body.pos.set(body.rest);
    body.vel.fill(0);
    body.endGrab();
    body.translate(0, this.spawnY + dropHeight, 0);
    this.prevStep.set(body.pos);
  }

  setVariant(v: Variant) {
    this.variant = v;
    for (const p of this.pieces) this.mesher.recolor(p.view.source, v);
  }

  /** Per-node weights for a named region, computed lazily from rest positions. */
  region(name: string): Float32Array | null {
    const fn = this.shape.regions?.[name];
    if (!fn) return null;
    let w = this.regionWeights.get(name);
    if (!w) {
      const rest = this.body.rest;
      w = new Float32Array(this.body.count);
      for (let i = 0; i < this.body.count; i++) w[i] = fn(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]);
      this.regionWeights.set(name, w);
    }
    return w;
  }

  /** Add velocity to every node, scaled by an optional region weight. */
  impulse(v: [number, number, number], weights?: Float32Array | null) {
    const vel = this.body.vel;
    for (let i = 0; i < this.body.count; i++) {
      const k = weights ? weights[i] : 1;
      if (k === 0) continue;
      vel[i * 3] += v[0] * k;
      vel[i * 3 + 1] += v[1] * k;
      vel[i * 3 + 2] += v[2] * k;
    }
  }

  /** Radial velocity from the centre of mass: >0 swells, <0 squeezes. */
  pulse(strength: number, weights?: Float32Array | null) {
    const com = this.body.centerOfMass();
    const { pos, vel } = this.body;
    for (let i = 0; i < this.body.count; i++) {
      const k = (weights ? weights[i] : 1) * strength;
      if (k === 0) continue;
      const j = i * 3;
      vel[j] += (pos[j] - com[0]) * k;
      vel[j + 1] += (pos[j + 1] - com[1]) * k * 0.6;
      vel[j + 2] += (pos[j + 2] - com[2]) * k;
    }
  }

  /** A gentle randomised shove: lifts slightly and adds a little spin. */
  nudge() {
    const { vel, pos } = this.body;
    const com = this.body.centerOfMass();
    const dir = Math.random() < 0.5 ? -1 : 1;
    const push = 1.1 + Math.random() * 0.5;
    for (let i = 0; i < this.body.count; i++) {
      const j = i * 3;
      const ry = pos[j + 1] - com[1];
      vel[j] += dir * push * (0.6 + ry * 1.4);
      vel[j + 1] += 1.6;
      vel[j + 2] += (Math.random() - 0.5) * 0.2;
    }
  }

  setShowMesh(show: boolean) {
    if (show && !this.wire) {
      const edges = this.body.edges;
      const geo = new BufferGeometry();
      const attr = new BufferAttribute(new Float32Array(edges.length * 3), 3);
      attr.setUsage(DynamicDrawUsage);
      geo.setAttribute('position', attr);
      const mat = new LineBasicNodeMaterial({ color: 0x1f1b18, transparent: true, opacity: 0.28, depthTest: false });
      this.wire = new LineSegments(geo, mat);
      this.wire.frustumCulled = false;
      this.wire.renderOrder = 10;
      this.scene.add(this.wire);
      this.updateWire(this.body.pos);
    } else if (!show && this.wire) {
      this.scene.remove(this.wire);
      this.wire.geometry.dispose();
      (this.wire.material as Material).dispose();
      this.wire = null;
    }
  }

  private updateWire(p: ArrayLike<number>) {
    if (!this.wire) return;
    const attr = this.wire.geometry.getAttribute('position') as BufferAttribute;
    const arr = attr.array as Float32Array;
    const e = this.body.edges;
    for (let k = 0; k < e.length; k++) {
      const i = e[k] * 3;
      arr[k * 3] = p[i];
      arr[k * 3 + 1] = p[i + 1];
      arr[k * 3 + 2] = p[i + 2];
    }
    attr.needsUpdate = true;
  }

  /** Live stats for the readout row: mass and volume track what is left after cuts. */
  stats(densityGPerCm3: number) {
    const cm3PerUnit3 = SIM.cmPerUnit ** 3;
    let restLeft = 0;
    for (const p of this.pieces) if (p.fade === 0) restLeft += p.restVolume;
    // Current volume of visible pieces only.
    const b = this.body;
    let current = 0;
    for (let t = 0; t < this.tetPiece.length; t++) {
      if (this.pieces[this.tetPiece[t]].fade > 0) continue;
      const k = t * 4;
      current += tetVolume(b.pos, b.tets[k], b.tets[k + 1], b.tets[k + 2], b.tets[k + 3]);
    }
    return {
      massG: restLeft * cm3PerUnit3 * densityGPerCm3,
      volumePct: (current / this.originalVolume) * 100,
      kinetic: b.kineticEnergy(),
      pieces: this.pieceCount,
    };
  }

  dispose() {
    this.setShowMesh(false);
    for (const p of this.pieces) this.disposePiece(p);
    this.pieces = [];
  }
}
