/**
 * Poke: a fingertip presses into the surface where you click. Hold to press deeper,
 * drag to slide the dent, release to let it spring back. Firm materials only dent.
 *
 * The finger pushes along the view ray tilted toward the floor, so the object is pinned
 * against the table and dents, rather than sliding away from a horizontal push.
 */
import { Mesh, MeshPhysicalNodeMaterial, SphereGeometry, Vector3 } from 'three/webgpu';
import type { Collider } from '../sim/softbody';
import { yieldFactor, type PointerSample, type Tool, type ToolContext } from './tool';

const TIP_RADIUS = 0.08; // fraction of object size
const MAX_DEPTH = 0.26; // fraction of object size, for the softest materials
const PRESS_RATE = 7; // how fast the finger sinks in (1/s)
const DOWN_BIAS = 0.75; // how much the push leans toward the floor

export class PokeTool implements Tool {
  readonly id = 'poke';
  readonly cursor = { idle: 'default', hover: 'pointer', active: 'none' };
  private collider: Extract<Collider, { kind: 'sphere' }> | null = null;
  private readonly origin = new Vector3();
  private readonly ray = new Vector3();
  private readonly push = new Vector3();
  private hitDist = 0;
  private elapsed = 0;
  private radius = 0;
  private maxDepth = 0;
  private sounded = false;
  private tip: Mesh | null = null;

  private ensureTip(ctx: ToolContext) {
    if (this.tip) return this.tip;
    const mat = new MeshPhysicalNodeMaterial({
      color: 0xffffff,
      roughness: 0.35,
      transparent: true,
      opacity: 0.55,
      clearcoat: 0.6,
    });
    this.tip = new Mesh(new SphereGeometry(1, 24, 16), mat);
    this.tip.visible = false;
    this.tip.renderOrder = 3;
    ctx.scene.add(this.tip);
    return this.tip;
  }

  down(ctx: ToolContext, p: PointerSample): boolean {
    const hit = ctx.pick(p.ndcX, p.ndcY);
    if (!hit) return false;
    const r = ctx.ray(p.ndcX, p.ndcY);
    this.origin.copy(r.origin);
    this.ray.copy(r.direction);
    this.hitDist = r.origin.distanceTo(hit.point);
    this.push.copy(r.direction).add(new Vector3(0, -DOWN_BIAS, 0)).normalize();
    // Scale by the thinner of length and height so flat objects get a dent, not a squash.
    const size = Math.min(ctx.specimen.shape.size, ctx.specimen.height * 1.25);
    this.radius = size * TIP_RADIUS;
    this.maxDepth = size * MAX_DEPTH * yieldFactor(ctx.stiffness());
    this.elapsed = 0;
    this.sounded = false;
    this.collider = { kind: 'sphere', x: 0, y: 0, z: 0, r: this.radius, depth: 0, contacts: 0 };
    this.place(0);
    ctx.specimen.body.colliders.push(this.collider);
    ctx.specimen.body.holdHorizontal = true;
    const tip = this.ensureTip(ctx);
    tip.scale.setScalar(this.radius * 0.98);
    tip.visible = true;
    return true;
  }

  move(ctx: ToolContext, p: PointerSample) {
    if (!this.collider) return;
    const r = ctx.ray(p.ndcX, p.ndcY);
    this.origin.copy(r.origin);
    this.ray.copy(r.direction);
  }

  update(ctx: ToolContext, dt: number) {
    if (!this.collider) return;
    this.elapsed += dt;
    const depth = this.maxDepth * (1 - Math.exp(-this.elapsed * PRESS_RATE));
    this.place(depth);
    if (!this.sounded && this.collider.contacts > 0) {
      this.sounded = true;
      ctx.sound('poke', 0.6);
    }
  }

  private place(depth: number) {
    if (!this.collider) return;
    // The contact point slides with the pointer at the original distance from the camera;
    // the fingertip starts just outside it and sinks in along the push direction.
    const bx = this.origin.x + this.ray.x * this.hitDist;
    const by = this.origin.y + this.ray.y * this.hitDist;
    const bz = this.origin.z + this.ray.z * this.hitDist;
    const d = depth - this.radius;
    this.collider.x = bx + this.push.x * d;
    this.collider.y = Math.max(this.radius * 0.5, by + this.push.y * d);
    this.collider.z = bz + this.push.z * d;
    this.tip?.position.set(this.collider.x, this.collider.y, this.collider.z);
  }

  up(ctx: ToolContext) {
    if (this.collider && this.collider.contacts > 0) ctx.sound('release', 0.35);
    this.cancel(ctx);
  }

  cancel(ctx: ToolContext) {
    if (this.tip) this.tip.visible = false;
    if (!this.collider) return;
    ctx.specimen.body.holdHorizontal = false;
    const list = ctx.specimen.body.colliders;
    const i = list.indexOf(this.collider);
    if (i >= 0) list.splice(i, 1);
    this.collider = null;
  }

  dispose(ctx: ToolContext) {
    this.cancel(ctx);
    if (this.tip) {
      ctx.scene.remove(this.tip);
      this.tip.geometry.dispose();
      (this.tip.material as MeshPhysicalNodeMaterial).dispose();
      this.tip = null;
    }
  }
}
