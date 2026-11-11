/**
 * Hand: pinch-grab a soft region and drag; release to let it wobble or toss it.
 * The drag plane faces the camera through the grab point, so motion follows the pointer.
 */
import { Plane, Vector3 } from 'three/webgpu';
import { GRAB, SIM } from '../config';
import type { PointerSample, Tool, ToolContext } from './tool';

export class HandTool implements Tool {
  readonly id = 'hand';
  readonly cursor = { idle: 'default', hover: 'grab', active: 'grabbing' };
  private readonly plane = new Plane();
  private readonly target = new Vector3();
  private readonly forward = new Vector3();
  private active = false;

  down(ctx: ToolContext, p: PointerSample): boolean {
    const hit = ctx.pick(p.ndcX, p.ndcY);
    if (!hit) return false;
    ctx.camera.getWorldDirection(this.forward);
    // A camera-facing plane, tilted toward vertical so drags lift instead of skidding.
    this.forward.y *= 0.35;
    this.forward.normalize();
    this.plane.setFromNormalAndCoplanarPoint(this.forward, hit.point);
    const radius = ctx.specimen.shape.size * GRAB.radiusFraction;
    this.active = ctx.specimen.body.beginGrab(
      [hit.point.x, hit.point.y, hit.point.z],
      radius,
      GRAB.compliance,
    );
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
    this.cancel(ctx);
  }

  cancel(ctx: ToolContext) {
    if (!this.active) return;
    this.active = false;
    ctx.specimen.body.endGrab();
  }
}
