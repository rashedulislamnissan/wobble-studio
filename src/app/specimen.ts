/**
 * A specimen: one soft object on stage. Owns the simulation body, the render mesh that
 * follows it, interpolation buffers, region weights for special actions and the optional
 * "show mesh" wireframe.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  LineBasicNodeMaterial,
  LineSegments,
  type Material,
  type Scene,
} from 'three/webgpu';
import { SIM } from '../config';
import { DeformableMesh } from '../render/deformMesh';
import { buildLatticeTetMesh, type Sdf, type TetMesh, type Vec3Tuple } from '../sim/lattice';
import { SoftBody, type SoftBodyParams } from '../sim/softbody';

/** Surface sample points used for tool contact. */
const PROXY_TARGET = 1800;

export interface SpecimenShape {
  sdf: Sdf;
  bounds: { min: Vec3Tuple; max: Vec3Tuple };
  /** Largest dimension in world units. */
  size: number;
  inflate?: number;
  regions?: Record<string, (x: number, y: number, z: number) => number>;
}

export interface SpecimenOptions {
  shape: SpecimenShape;
  geometry: BufferGeometry;
  params: SoftBodyParams;
  material: Material;
  /** Lattice cells across the largest dimension. */
  resolution: number;
  /** Drop height above the floor when spawned. */
  dropHeight?: number;
}

export class Specimen {
  readonly body: SoftBody;
  readonly tetMesh: TetMesh;
  readonly view: DeformableMesh;
  readonly shape: SpecimenShape;
  /** Rest height of the visible object (floor to top). */
  readonly height: number;
  private readonly prevStep: Float64Array;
  private readonly lerped: Float64Array;
  private wire: LineSegments | null = null;
  private readonly spawnY: number;
  private readonly regionWeights = new Map<string, Float32Array>();

  constructor(private readonly scene: Scene, opts: SpecimenOptions) {
    this.shape = opts.shape;
    const { min, max } = opts.shape.bounds;
    const cell = opts.shape.size / opts.resolution;
    this.tetMesh = buildLatticeTetMesh(opts.shape.sdf, min, max, cell, { inflate: opts.shape.inflate });
    this.body = new SoftBody(this.tetMesh, opts.params);

    this.view = new DeformableMesh(opts.geometry, this.tetMesh, opts.material);
    // Particles may sit slightly outside the surface; lower the particle floor so the
    // visible surface (not the lattice) rests on y = 0.
    let minParticleY = Infinity;
    for (let i = 1; i < this.body.rest.length; i += 3) minParticleY = Math.min(minParticleY, this.body.rest[i]);
    this.body.floorY = minParticleY - this.view.restMinY;

    const pos = opts.geometry.getAttribute('position').array as Float32Array;
    let maxY = -Infinity;
    for (let i = 1; i < pos.length; i += 3) maxY = Math.max(maxY, pos[i]);
    this.height = maxY - this.view.restMinY;

    this.setupProxies();

    this.spawnY = -this.view.restMinY + (opts.dropHeight ?? 0);
    this.body.translate(0, this.spawnY, 0);
    this.prevStep = new Float64Array(this.body.pos);
    this.lerped = new Float64Array(this.body.pos.length);
    this.view.update(this.body.pos);
    scene.add(this.view.mesh);
  }

  /** Every Nth render vertex becomes a collision proxy (~PROXY_TARGET points). */
  private setupProxies() {
    const { tet, bary } = this.view.embedding;
    const stride = Math.max(1, Math.round(tet.length / PROXY_TARGET));
    const n = Math.ceil(tet.length / stride);
    const pt = new Uint32Array(n);
    const pb = new Float32Array(n * 4);
    for (let i = 0, j = 0; i < tet.length; i += stride, j++) {
      pt[j] = tet[i];
      pb.set(bary.subarray(i * 4, i * 4 + 4), j * 4);
    }
    this.body.setSurfaceProxies(pt, pb);
  }

  step(dt: number) {
    this.prevStep.set(this.body.pos);
    this.body.step(dt);
  }

  /** Update visuals from interpolated physics state. */
  render(alpha: number) {
    const a = this.prevStep;
    const b = this.body.pos;
    const out = this.lerped;
    for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * alpha;
    this.view.update(out);
    if (this.wire) this.updateWire(out);
  }

  reset(dropHeight = 0.6) {
    this.body.reset(0, this.spawnY + dropHeight, 0);
    this.prevStep.set(this.body.pos);
  }

  /** Per-particle weights for a named region, computed lazily from rest positions. */
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

  /** Add velocity to every particle, scaled by an optional region weight. */
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
      const edges = this.tetMesh.edges;
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
    const e = this.tetMesh.edges;
    for (let k = 0; k < e.length; k++) {
      const i = e[k] * 3;
      arr[k * 3] = p[i];
      arr[k * 3 + 1] = p[i + 1];
      arr[k * 3 + 2] = p[i + 2];
    }
    attr.needsUpdate = true;
  }

  /** Live stats for the readout row. */
  stats(densityGPerCm3: number) {
    const cm3PerUnit3 = SIM.cmPerUnit ** 3;
    const restVol = this.body.totalRestVolume;
    return {
      massG: restVol * cm3PerUnit3 * densityGPerCm3,
      volumePct: (this.body.currentVolume() / restVol) * 100,
      kinetic: this.body.kineticEnergy(),
      pieces: 1,
    };
  }

  dispose() {
    this.setShowMesh(false);
    this.scene.remove(this.view.mesh);
    this.view.dispose();
  }
}
