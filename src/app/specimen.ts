/**
 * A specimen: one soft object on stage. Owns the simulation body, the render mesh that
 * follows it, interpolation buffers and the optional "show mesh" wireframe.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  LineBasicNodeMaterial,
  LineSegments,
  type BufferGeometry as Geo,
  type Material,
  type Scene,
} from 'three/webgpu';
import { SIM } from '../config';
import { DeformableMesh } from '../render/deformMesh';
import { buildLatticeTetMesh, type Sdf, type TetMesh, type Vec3Tuple } from '../sim/lattice';
import { SoftBody, type SoftBodyParams } from '../sim/softbody';

export interface SpecimenShape {
  sdf: Sdf;
  bounds: { min: Vec3Tuple; max: Vec3Tuple };
  /** Largest dimension in world units. */
  size: number;
  renderGeometry(detail: number): Geo;
}

export interface SpecimenOptions {
  shape: SpecimenShape;
  params: SoftBodyParams;
  material: Material;
  /** Lattice cells across the largest dimension. */
  resolution: number;
  renderDetail: number;
  /** Drop height above the floor when spawned or reset. */
  dropHeight?: number;
}

export class Specimen {
  readonly body: SoftBody;
  readonly tetMesh: TetMesh;
  readonly view: DeformableMesh;
  readonly shape: SpecimenShape;
  private readonly prevStep: Float64Array;
  private readonly lerped: Float64Array;
  private wire: LineSegments | null = null;
  private readonly spawnY: number;

  constructor(private readonly scene: Scene, opts: SpecimenOptions) {
    this.shape = opts.shape;
    const { min, max } = opts.shape.bounds;
    const cell = opts.shape.size / opts.resolution;
    this.tetMesh = buildLatticeTetMesh(opts.shape.sdf, min, max, cell);
    this.body = new SoftBody(this.tetMesh, opts.params);

    this.view = new DeformableMesh(opts.shape.renderGeometry(opts.renderDetail), this.tetMesh, opts.material);
    // Particles may sit slightly outside the surface; lower the particle floor so the
    // visible surface (not the lattice) rests on y = 0.
    let minParticleY = Infinity;
    for (let i = 1; i < this.body.rest.length; i += 3) minParticleY = Math.min(minParticleY, this.body.rest[i]);
    this.body.floorY = minParticleY - this.view.restMinY;

    this.spawnY = -this.view.restMinY + (opts.dropHeight ?? 0);
    this.body.translate(0, this.spawnY, 0);
    this.prevStep = new Float64Array(this.body.pos);
    this.lerped = new Float64Array(this.body.pos.length);
    this.view.update(this.body.pos);
    scene.add(this.view.mesh);
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
      this.updateWire(this.lerped.some((v) => v !== 0) ? this.lerped : this.body.pos);
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
