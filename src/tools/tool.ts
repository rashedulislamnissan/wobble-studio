import type { Camera, Object3D, Vector3 } from 'three/webgpu';
import type { Specimen } from '../app/specimen';

/** Everything a tool needs to act on the stage. */
export interface ToolContext {
  camera: Camera;
  specimen: Specimen;
  /** Raycast the specimen surface at normalised device coords; returns world hit or null. */
  pick(ndcX: number, ndcY: number): { point: Vector3; object: Object3D } | null;
  /** World-space ray for the pointer. */
  ray(ndcX: number, ndcY: number): { origin: Vector3; direction: Vector3 };
}

export interface PointerSample {
  ndcX: number;
  ndcY: number;
  /** Time in ms (performance.now). */
  t: number;
}

export interface Tool {
  readonly id: string;
  /** CSS cursor while hovering the stage / while active. */
  readonly cursor: { idle: string; hover: string; active: string };
  /** Return true if the tool takes this pointer (otherwise the camera orbits). */
  down(ctx: ToolContext, p: PointerSample): boolean;
  move(ctx: ToolContext, p: PointerSample): void;
  up(ctx: ToolContext, p: PointerSample): void;
  /** Called every physics step while active (for continuous tools). */
  update?(ctx: ToolContext, dt: number): void;
  cancel(ctx: ToolContext): void;
}
