/**
 * Small debris: crumbs, juice droplets, shimmer, powder, chips, shards, smears.
 * One instanced mesh, CPU-simulated (a few hundred at most), so it costs one draw call.
 */
import {
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshPhysicalNodeMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three/webgpu';

export type ParticleKind = 'crumbs' | 'juice' | 'shimmer' | 'powder' | 'chips' | 'shards' | 'smear';

interface KindSpec {
  size: [number, number];
  speed: [number, number];
  gravity: number;
  life: [number, number];
  bounce: number;
  /** Squash on the y axis (flakes and shards are flat). */
  flat: number;
  lighten: number;
}

const KINDS: Record<ParticleKind, KindSpec> = {
  crumbs: { size: [0.01, 0.026], speed: [0.6, 1.8], gravity: 1, life: [1.4, 2.4], bounce: 0.25, flat: 0.62, lighten: -0.08 },
  juice: { size: [0.008, 0.022], speed: [1.2, 2.8], gravity: 1, life: [0.5, 1.1], bounce: 0, flat: 1, lighten: 0.15 },
  shimmer: { size: [0.006, 0.014], speed: [0.4, 1.2], gravity: 0.15, life: [0.4, 0.9], bounce: 0, flat: 1, lighten: 0.6 },
  powder: { size: [0.02, 0.05], speed: [0.2, 0.7], gravity: 0.05, life: [0.8, 1.6], bounce: 0, flat: 1, lighten: 0.75 },
  chips: { size: [0.014, 0.03], speed: [1, 2.4], gravity: 1, life: [1.2, 2], bounce: 0.3, flat: 0.45, lighten: 0 },
  shards: { size: [0.016, 0.04], speed: [0.8, 2.2], gravity: 1, life: [1.5, 2.6], bounce: 0.35, flat: 0.35, lighten: 0 },
  smear: { size: [0.014, 0.03], speed: [0.3, 1], gravity: 1, life: [0.8, 1.4], bounce: 0, flat: 0.6, lighten: 0.05 },
};

const MAX = 360;
const GRAVITY = -9.8;

export class Particles {
  private readonly mesh: InstancedMesh;
  private readonly pos = new Float32Array(MAX * 3);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly size = new Float32Array(MAX);
  private readonly kind: ParticleKind[] = new Array(MAX).fill('crumbs');
  private readonly spin = new Float32Array(MAX * 4);
  private cursor = 0;
  private active = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly c = new Color();
  /** Multiplier for reduced-motion users. */
  amount = 1;

  constructor(scene: Scene) {
    const mat = new MeshPhysicalNodeMaterial({ roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.4 });
    this.mesh = new InstancedMesh(new IcosahedronGeometry(1, 1), mat, MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.set(0xffffff));
    }
    scene.add(this.mesh);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) this.amount = 0.4;
  }

  /** Spray `count` particles from a point, biased along `dir` (default: up). */
  burst(kind: ParticleKind, at: [number, number, number], count: number, color: string, dir: [number, number, number] = [0, 1, 0]) {
    const spec = KINDS[kind];
    const base = new Color(color).lerp(new Color(spec.lighten >= 0 ? 0xffffff : 0x6b4a2a), Math.abs(spec.lighten));
    const n = Math.round(count * this.amount);
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const rand = (a: number, b: number) => a + Math.random() * (b - a);
      // Random direction in a cone around dir.
      let dx = dir[0] + rand(-0.8, 0.8), dy = dir[1] + rand(-0.3, 0.8), dz = dir[2] + rand(-0.8, 0.8);
      const l = Math.hypot(dx, dy, dz) || 1;
      const sp = rand(spec.speed[0], spec.speed[1]);
      dx = (dx / l) * sp; dy = (dy / l) * sp; dz = (dz / l) * sp;
      this.pos.set([at[0] + rand(-0.03, 0.03), at[1] + rand(-0.02, 0.03), at[2] + rand(-0.03, 0.03)], i * 3);
      this.vel.set([dx, dy, dz], i * 3);
      this.maxLife[i] = this.life[i] = rand(spec.life[0], spec.life[1]);
      this.size[i] = rand(spec.size[0], spec.size[1]);
      this.kind[i] = kind;
      this.spin.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      this.c.copy(base).offsetHSL(0, 0, rand(-0.05, 0.05));
      this.mesh.setColorAt(i, this.c);
    }
    this.active = MAX;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    if (this.active === 0) return;
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      const spec = KINDS[this.kind[i]];
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j + 1] += GRAVITY * spec.gravity * dt;
      const drag = spec.gravity < 0.3 ? Math.exp(-2.5 * dt) : 1;
      this.vel[j] *= drag; this.vel[j + 1] *= drag; this.vel[j + 2] *= drag;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      const r = this.size[i];
      if (this.pos[j + 1] < r * spec.flat) {
        this.pos[j + 1] = r * spec.flat;
        this.vel[j + 1] = -this.vel[j + 1] * spec.bounce;
        this.vel[j] *= 0.6;
        this.vel[j + 2] *= 0.6;
        if (spec.bounce === 0) {
          this.vel[j] = this.vel[j + 2] = 0; // juice and smear stick
        }
      }
      const t = this.life[i] / this.maxLife[i];
      const scale = this.life[i] <= 0 ? 0 : r * Math.min(1, t * 3);
      const sp = this.spin.subarray(i * 4, i * 4 + 4);
      this.q.set(sp[0], sp[1], sp[2], sp[3]).normalize();
      this.v.set(this.pos[j], this.pos[j + 1], this.pos[j + 2]);
      this.s.set(scale, scale * spec.flat, scale);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      if (this.life[i] > 0) alive++;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.active = alive;
  }
}
