/**
 * Knife and wavy knife (§10): draw a line across the object; a blade presses down along
 * it and the object parts there. The cut is the plane through the eye and the drawn
 * line, so it lands exactly where you drew. The wavy knife adds a ripple to that plane.
 */
import { BoxGeometry, Mesh, MeshPhysicalNodeMaterial, Quaternion, Vector3, Matrix4 } from 'three/webgpu';
import type { PointerSample, Tool, ToolContext } from './tool';

const MIN_DRAG_PX = 24;
const PRESS_SECONDS = 0.26;
const EXIT_SECONDS = 0.22;

export class KnifeTool implements Tool {
  readonly anywhere = true;
  readonly cursor = { idle: 'crosshair', hover: 'crosshair', active: 'crosshair' };
  private start: PointerSample | null = null;
  private end: PointerSample | null = null;
  private blade: Mesh | null = null;
  private anim: { t: number; plane: Vector3; d: number; u: Vector3; top: number; bottom: number; centre: Vector3; field: (x: number, y: number, z: number) => number; done: boolean } | null = null;

  /** ripple: wave amplitude as a fraction of object size (0 = straight knife). */
  constructor(readonly id: 'knife' | 'wavy', private readonly ripple = 0) {}

  private ensureBlade(ctx: ToolContext) {
    if (this.blade) return this.blade;
    const mat = new MeshPhysicalNodeMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.22, clearcoat: 0.4 });
    this.blade = new Mesh(new BoxGeometry(1, 1, 1), mat);
    this.blade.visible = false;
    this.blade.castShadow = true;
    ctx.scene.add(this.blade);
    return this.blade;
  }

  down(_ctx: ToolContext, p: PointerSample): boolean {
    if (this.anim) return false;
    this.start = p;
    this.end = p;
    return true;
  }

  move(ctx: ToolContext, p: PointerSample) {
    if (!this.start) return;
    this.end = p;
    ctx.overlay.line(this.start.x, this.start.y, p.x, p.y, this.ripple > 0 ? 7 : 0, 30);
  }

  up(ctx: ToolContext) {
    const a = this.start;
    const b = this.end;
    this.start = this.end = null;
    if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) < MIN_DRAG_PX) {
      ctx.overlay.clearLine();
      return;
    }
    const ra = ctx.ray(a.ndcX, a.ndcY);
    const rb = ctx.ray(b.ndcX, b.ndcY);
    // Plane through the eye containing both pointer rays.
    const n = new Vector3().crossVectors(ra.direction, rb.direction).normalize();
    if (!Number.isFinite(n.x) || n.lengthSq() < 0.5) {
      ctx.overlay.clearLine();
      return;
    }
    const d = n.dot(ra.origin);
    const size = ctx.specimen.shape.size;
    const amp = this.ripple * size;
    const wavelength = size * 0.2;
    // Axis along the cut line (horizontal within the plane where possible).
    const u = new Vector3().crossVectors(n, new Vector3(0, 1, 0));
    if (u.lengthSq() < 1e-3) u.crossVectors(n, new Vector3(1, 0, 0));
    u.normalize();
    const field =
      amp > 0
        ? (x: number, y: number, z: number) =>
            n.x * x + n.y * y + n.z * z - d + amp * Math.sin(((u.x * x + u.y * y + u.z * z) / wavelength) * Math.PI * 2)
        : (x: number, y: number, z: number) => n.x * x + n.y * y + n.z * z - d;

    // Blade sits in the plane, centred over the object, and presses down.
    const com = ctx.specimen.body.centerOfMass();
    const c = new Vector3(com[0], com[1], com[2]);
    const centre = c.clone().addScaledVector(n, -(n.dot(c) - d));
    const pos = ctx.specimen.body.pos;
    let top = -Infinity;
    for (let i = 1; i < pos.length; i += 3) top = Math.max(top, pos[i]);
    this.anim = { t: 0, plane: n, d, u, top: top + 0.35, bottom: -0.05, centre, field, done: false };
    const blade = this.ensureBlade(ctx);
    const v = new Vector3().crossVectors(u, n).normalize(); // in-plane, mostly vertical
    const basis = new Matrix4().makeBasis(u, v, n);
    blade.quaternion.copy(new Quaternion().setFromRotationMatrix(basis));
    blade.scale.set(size * 1.35, size * 0.42, 0.012);
    blade.visible = true;
    this.placeBlade(0);
  }

  private placeBlade(k: number) {
    if (!this.blade || !this.anim) return;
    const a = this.anim;
    const half = this.blade.scale.y / 2;
    const y = a.top + half + (a.bottom - a.top) * k;
    this.blade.position.set(a.centre.x, y, a.centre.z);
  }

  update(ctx: ToolContext, dt: number) {
    const a = this.anim;
    if (!a) return;
    a.t += dt;
    if (!a.done) {
      const k = Math.min(1, a.t / PRESS_SECONDS);
      this.placeBlade(k * k * (3 - 2 * k) * 0.82);
      if (k >= 1) {
        a.done = true;
        a.t = 0;
        ctx.overlay.clearLine();
        const cut = ctx.cut(a.field, { normal: [a.plane.x, a.plane.y, a.plane.z], separation: 0.32 });
        if (cut) {
          ctx.sound('slice', 0.7);
          ctx.debris([a.centre.x, Math.max(0.1, a.top - 0.45), a.centre.z], 18, [a.plane.x * 0.3, 1, a.plane.z * 0.3]);
        }
      }
    } else {
      const k = Math.min(1, a.t / EXIT_SECONDS);
      this.placeBlade(0.82 + 0.18 * k);
      if (this.blade) this.blade.scale.z = 0.012 * (1 - k * 0.9);
      if (k >= 1) {
        this.anim = null;
        if (this.blade) this.blade.visible = false;
      }
    }
  }

  cancel(ctx: ToolContext) {
    this.start = this.end = null;
    ctx.overlay.clearLine();
  }

  dispose(ctx: ToolContext) {
    this.cancel(ctx);
    this.anim = null;
    if (this.blade) {
      ctx.scene.remove(this.blade);
      this.blade.geometry.dispose();
      (this.blade.material as MeshPhysicalNodeMaterial).dispose();
      this.blade = null;
    }
  }
}
