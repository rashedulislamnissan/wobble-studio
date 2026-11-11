/**
 * Cutter, Spoon, Fork and Hammer (§10).
 *  - Cutter: stamps a star / heart / flower / round shape straight through, releasing it.
 *  - Spoon: scoops a rounded bite from where you click; the scoop lifts away.
 *  - Fork: pierces one piece and lifts it (a tighter grab than the hand).
 *  - Hammer: strikes; crisp fruit cracks into chunks, juicy fruit bursts, chocolate snaps.
 */
import { Vector3 } from 'three/webgpu';
import { stampOutline, type StampShape } from '../ui/stageOverlay';
import { HandTool } from './hand';
import type { PointerSample, Tool, ToolContext } from './tool';
import { len2, len3 } from '../objects/sdf';

/** 2D signed distance to a polygon (even-odd inside test). */
function polygonSdf(px: number, py: number, pts: [number, number][]) {
  let d = Infinity;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    const ex = xj - xi, ey = yj - yi;
    const wx = px - xi, wy = py - yi;
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, len2(wx - ex * t, wy - ey * t));
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside ? -d : d;
}

export class CutterTool implements Tool {
  readonly id = 'cutter';
  readonly cursor = { idle: 'default', hover: 'copy', active: 'copy' };
  shape: StampShape = 'star';

  /** Stamp radius as a fraction of object size. */
  private radiusFraction = 0.2;

  down(ctx: ToolContext, p: PointerSample): boolean {
    const hit = ctx.pick(p.ndcX, p.ndcY);
    if (!hit) return false;
    const ray = ctx.ray(p.ndcX, p.ndcY);
    // Prism along the view ray through the hit point.
    const axis = ray.direction.clone().normalize();
    const right = new Vector3().crossVectors(axis, new Vector3(0, 1, 0));
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
    right.normalize();
    const up = new Vector3().crossVectors(right, axis).normalize();
    const r = ctx.specimen.shape.size * this.radiusFraction;
    const outline = stampOutline(this.shape, 96);
    const centre = hit.point.clone();
    const field = (x: number, y: number, z: number) => {
      const dx = x - centre.x, dy = y - centre.y, dz = z - centre.z;
      const u = (dx * right.x + dy * right.y + dz * right.z) / r;
      const v = (dx * up.x + dy * up.y + dz * up.z) / r;
      return polygonSdf(u, v, outline) * r;
    };
    // Inside (label 0) gets -normal * separation: pop it toward the viewer.
    const ok = ctx.cut(field, { normal: [axis.x, axis.y, axis.z], separation: 0.55 });
    if (ok) {
      ctx.sound('slice', 0.55);
      ctx.debris([centre.x, centre.y, centre.z], 14, [-axis.x, 0.6, -axis.z]);
    }
    return false; // a single tap; the camera keeps the drag
  }

  move() {}
  up() {}
  cancel(ctx: ToolContext) {
    ctx.overlay.hideStamp();
  }

  /** Hover preview of the stamp outline. */
  hover(ctx: ToolContext, p: PointerSample, overObject: boolean) {
    if (!overObject) return ctx.overlay.hideStamp();
    const hit = ctx.pick(p.ndcX, p.ndcY);
    if (!hit) return ctx.overlay.hideStamp();
    const r = ctx.specimen.shape.size * this.radiusFraction;
    const ray = ctx.ray(p.ndcX, p.ndcY);
    const right = new Vector3().crossVectors(ray.direction, new Vector3(0, 1, 0)).normalize();
    const edge = hit.point.clone().addScaledVector(right, r);
    const a = ctx.toScreen(hit.point.x, hit.point.y, hit.point.z);
    const b = ctx.toScreen(edge.x, edge.y, edge.z);
    ctx.overlay.showStamp(this.shape, a.x, a.y, len2(b.x - a.x, b.y - a.y));
  }

  dispose(ctx: ToolContext) {
    ctx.overlay.hideStamp();
  }
}

export class SpoonTool implements Tool {
  readonly id = 'spoon';
  readonly cursor = { idle: 'default', hover: 'pointer', active: 'pointer' };

  down(ctx: ToolContext, p: PointerSample): boolean {
    const hit = ctx.pick(p.ndcX, p.ndcY);
    if (!hit) return false;
    const ray = ctx.ray(p.ndcX, p.ndcY);
    const r = Math.min(ctx.specimen.shape.size, ctx.specimen.height * 1.3) * 0.2;
    // Centre the scoop a little below the surface so it takes a rounded bite.
    const c = hit.point.clone().addScaledVector(ray.direction, r * 0.45);
    const field = (x: number, y: number, z: number) => len3(x - c.x, y - c.y, z - c.z) - r;
    const ok = ctx.cut(field, { removeInside: true, lift: 0.35, separation: 0 });
    if (ok) {
      ctx.sound('slice', 0.5);
      ctx.debris([hit.point.x, hit.point.y, hit.point.z], 8, [0, 1, 0]);
    }
    return false;
  }
  move() {}
  up() {}
  cancel() {}
}

/** Fork: pierce and lift a single piece. */
export class ForkTool extends HandTool {
  override readonly id = 'fork';
  override readonly cursor = { idle: 'default', hover: 'crosshair', active: 'grabbing' };
  protected override radiusFraction = 0.12;
  protected override pierce = true;
}

export class HammerTool implements Tool {
  readonly id = 'hammer';
  readonly cursor = { idle: 'default', hover: 'pointer', active: 'pointer' };

  down(ctx: ToolContext, p: PointerSample): boolean {
    const hit = ctx.pick(p.ndcX, p.ndcY);
    if (!hit) return false;
    const s = ctx.specimen;
    const hp = hit.point;
    const id = ctx.objectId();
    // A downward blow around the strike point.
    const radius = s.shape.size * 0.3;
    const { pos, vel } = s.body;
    for (let i = 0; i < s.body.count; i++) {
      const d = len3(pos[i * 3] - hp.x, pos[i * 3 + 1] - hp.y, pos[i * 3 + 2] - hp.z);
      if (d > radius) continue;
      vel[i * 3 + 1] -= 3.5 * (1 - d / radius);
    }
    const snap = s.snapField([hp.x, hp.y, hp.z]);
    if (snap) {
      const ok = ctx.cut(snap.field, { normal: snap.normal, separation: 0.5 });
      ctx.sound(ok ? 'break' : 'impact', 1);
      ctx.debris([hp.x, hp.y, hp.z], 18, [0, 1, 0]);
      return false;
    }
    const breaks = id === 'tomato' ? 4 : 2;
    let any = false;
    const base = Math.random() * Math.PI;
    for (let k = 0; k < breaks; k++) {
      // Mostly vertical planes through the strike point, fanned around it.
      const a = base + (k * Math.PI) / breaks + (Math.random() - 0.5) * 0.4;
      const n = new Vector3(Math.cos(a), (Math.random() - 0.5) * 0.3, Math.sin(a)).normalize();
      const d = n.dot(hp);
      if (ctx.cut((x, y, z) => n.x * x + n.y * y + n.z * z - d, { normal: [n.x, n.y, n.z], separation: 0.6 })) any = true;
    }
    ctx.sound(any ? 'break' : 'impact', 1);
    ctx.debris([hp.x, hp.y, hp.z], id === 'tomato' ? 46 : 22, [0, 1, 0]);
    return false;
  }
  move() {}
  up() {}
  cancel() {}
}
