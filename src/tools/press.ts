/**
 * Press: a glass plate lowers onto the object. Drag down to squash, up to ease off;
 * release and the plate lifts away. Firm materials resist (the plate stops early).
 */
import { BoxGeometry, Mesh, MeshPhysicalNodeMaterial } from 'three/webgpu';
import type { Collider } from '../sim/softbody';
import { yieldFactor, type PointerSample, type Tool, type ToolContext } from './tool';

const PLATE_THICKNESS = 0.035;
/** Pointer travel (NDC units) for a full press. */
const FULL_DRAG = 0.55;
const MAX_SQUASH = 0.72;
/** Plate follows its target with this smoothing rate (1/s) — avoids instant crushes. */
const FOLLOW = 14;
const LIFT_SPEED = 3.2;

export class PressTool implements Tool {
  readonly id = 'press';
  readonly anywhere = true;
  readonly cursor = { idle: 'ns-resize', hover: 'ns-resize', active: 'ns-resize' };
  private collider: Extract<Collider, { kind: 'plate' }> | null = null;
  private plate: Mesh | null = null;
  private startY = 0;
  private top = 0;
  private target = 0;
  private minY = 0;
  private lifting = false;
  private lastSoundDepth = 0;

  private ensurePlate(ctx: ToolContext) {
    if (this.plate) return this.plate;
    const mat = new MeshPhysicalNodeMaterial({
      color: 0xffffff,
      roughness: 0.08,
      transparent: true,
      opacity: 0.4,
      clearcoat: 1,
      depthWrite: false,
    });
    this.plate = new Mesh(new BoxGeometry(1, PLATE_THICKNESS, 1), mat);
    this.plate.renderOrder = 2;
    this.plate.visible = false;
    ctx.scene.add(this.plate);
    return this.plate;
  }

  private objectTop(ctx: ToolContext) {
    const pos = ctx.specimen.body.pos;
    let maxY = -Infinity;
    for (let i = 1; i < pos.length; i += 3) maxY = Math.max(maxY, pos[i]);
    return maxY;
  }

  down(ctx: ToolContext, p: PointerSample): boolean {
    const plate = this.ensurePlate(ctx);
    this.top = this.objectTop(ctx) + 0.01;
    const h = ctx.specimen.height;
    this.minY = Math.max(0.06, this.top - h * MAX_SQUASH * yieldFactor(ctx.stiffness()));
    this.startY = p.ndcY;
    this.target = this.top;
    this.lifting = false;
    this.lastSoundDepth = 0;
    if (!this.collider) {
      this.collider = { kind: 'plate', y: this.top + 0.3, depth: 0, contacts: 0 };
      ctx.specimen.body.colliders.push(this.collider);
    }
    const com = ctx.specimen.body.centerOfMass();
    const span = ctx.specimen.shape.size * 1.7;
    plate.scale.set(span, 1, span);
    plate.position.set(com[0], this.collider.y + PLATE_THICKNESS / 2, com[2]);
    plate.visible = true;
    return true;
  }

  move(_ctx: ToolContext, p: PointerSample) {
    if (!this.collider || this.lifting) return;
    const t = Math.min(1, Math.max(0, (this.startY - p.ndcY) / FULL_DRAG));
    this.target = this.top + (this.minY - this.top) * t;
  }

  update(ctx: ToolContext, dt: number) {
    if (!this.collider || !this.plate) return;
    if (this.lifting) {
      this.collider.y += LIFT_SPEED * dt;
      if (this.collider.y > this.top + 0.6) {
        this.cancel(ctx);
        return;
      }
    } else {
      this.collider.y += (this.target - this.collider.y) * (1 - Math.exp(-FOLLOW * dt));
      // Sound in steps as the press deepens.
      const depth = (this.top - this.collider.y) / Math.max(0.01, this.top - this.minY);
      if (depth - this.lastSoundDepth > 0.22) {
        this.lastSoundDepth = depth;
        ctx.sound('press', Math.min(1, depth));
      }
    }
    this.plate.position.y = this.collider.y + PLATE_THICKNESS / 2;
  }

  up() {
    this.lifting = true;
  }

  cancel(ctx: ToolContext) {
    if (this.collider) {
      const list = ctx.specimen.body.colliders;
      const i = list.indexOf(this.collider);
      if (i >= 0) list.splice(i, 1);
    }
    this.collider = null;
    this.lifting = false;
    if (this.plate) this.plate.visible = false;
  }

  dispose(ctx: ToolContext) {
    this.cancel(ctx);
    if (this.plate) {
      ctx.scene.remove(this.plate);
      this.plate.geometry.dispose();
      (this.plate.material as MeshPhysicalNodeMaterial).dispose();
      this.plate = null;
    }
  }
}
