/**
 * Hand: pinch-grab a soft region and drag; release to let it wobble or toss it.
 * The drag plane faces the camera through the grab point, so motion follows the pointer.
 * Only the piece you clicked is grabbed, so cut pieces can be picked up one by one.
 */
import { Plane, Vector3, type Mesh } from 'three/webgpu';
import { GRAB, SIM } from '../config';
import type { PointerSample, Tool, ToolContext } from './tool';

export class HandTool implements Tool {
  readonly id: string = 'hand';
  readonly cursor = { idle: 'default', hover: 'grab', active: 'grabbing' };
  /** Grab radius as a fraction of object size. */
  protected radiusFraction: number = GRAB.radiusFraction;
  /** Fork: a sharp pierce sound on grab. */
  protected pierce = false;
  private readonly plane = new Plane();
  private readonly target = new Vector3();
  private readonly forward = new Vector3();
  private readonly start = new Vector3();
  private active = false;

  down(ctx: ToolContext, p: PointerSample): boolean {
    const hit = ctx.pick(p.ndcX, p.ndcY);
    if (!hit) return false;
    ctx.camera.getWorldDirection(this.forward);
    // A camera-facing plane, tilted toward vertical so drags lift instead of skidding.
    this.forward.y *= 0.35;
    this.forward.normalize();
    this.plane.setFromNormalAndCoplanarPoint(this.forward, hit.point);
    this.start.copy(hit.point);
    this.target.copy(hit.point);
    // Solids are held by a bigger area, so they come along whole instead of pinching.
    const rigidity = ctx.specimen.body.params.rigidity ?? 0;
    const radius = ctx.specimen.shape.size * (this.radiusFraction + 0.45 * rigidity);
    const piece = ctx.specimen.pieceOf(hit.object as Mesh);
    this.active = ctx.specimen.body.beginGrab(
      [hit.point.x, hit.point.y, hit.point.z],
      radius,
      GRAB.compliance,
      ctx.specimen.pieceCount > 1 ? piece : -1,
    );
    if (this.active && this.pierce) ctx.sound('poke', 0.5);
    return this.active;
  }

  move(ctx: ToolContext, p: PointerSample) {
    if (!this.active) return;
    const { origin, direction } = ctx.ray(p.ndcX, p.ndcY);
    const denom = this.plane.normal.dot(direction);
    if (Math.abs(denom) < 1e-5) return;
    const t = -(origin.dot(this.plane.normal) + this.plane.constant) / denom;
    if (t <= 0) return;
    this.target.copy(direction).multiplyScalar(t).add(origin);
    const { halfWidth, halfDepth, ceiling } = SIM.bounds;
    this.target.x = Math.max(-halfWidth, Math.min(halfWidth, this.target.x));
    this.target.z = Math.max(-halfDepth, Math.min(halfDepth, this.target.z));
    this.target.y = Math.max(GRAB.minHeight, Math.min(ceiling - 0.2, this.target.y));
    ctx.specimen.body.moveGrab([this.target.x, this.target.y, this.target.z]);
  }

  up(ctx: ToolContext) {
    if (this.active) {
      // A stretched release snaps back audibly; a gentle one stays quiet.
      const stretch = this.target.distanceTo(this.start) / ctx.specimen.shape.size;
      if (stretch > 0.12) ctx.sound('release', Math.min(1, stretch));
    }
    this.cancel(ctx);
  }

  cancel(ctx: ToolContext) {
    if (!this.active) return;
    this.active = false;
    ctx.specimen.body.endGrab();
  }
}
