import type { Camera, Object3D, Scene, Vector3 } from 'three/webgpu';
import type { CutOptions, Field, Specimen } from '../app/specimen';
import type { SoundEvent } from '../audio/engine';
import type { StageOverlay } from '../ui/stageOverlay';

/** Everything a tool needs to act on the stage. */
export interface ToolContext {
  camera: Camera;
  scene: Scene;
  specimen: Specimen;
  /** Current firmness of the specimen (edge modulus) — tools scale their reach by it. */
  stiffness(): number;
  /** Raycast the specimen surface at normalised device coords; returns world hit or null. */
  pick(ndcX: number, ndcY: number): { point: Vector3; object: Object3D } | null;
  /** World-space ray for the pointer. */
  ray(ndcX: number, ndcY: number): { origin: Vector3; direction: Vector3 };
  /** Fire a sound event at intensity 0..1. */
  sound(event: SoundEvent, intensity: number): void;
  /** Material-appropriate debris (crumbs, juice, shimmer...) at a world point. */
  debris(at: [number, number, number], count: number, dir?: [number, number, number]): void;
  /** Cut the specimen along a world-space field; false if nothing was cut. */
  cut(field: Field, opts?: CutOptions): boolean;
  /** 2D guide layer over the stage. */
  overlay: StageOverlay;
  /** World point to client pixels. */
  toScreen(x: number, y: number, z: number): { x: number; y: number };
  /** Object id, for object-specific behaviour (tomato bursts, chocolate snaps). */
  objectId(): string;
}

export interface PointerSample {
  ndcX: number;
  ndcY: number;
  /** Client pixels (for overlay drawing). */
  x: number;
  y: number;
  /** Time in ms (performance.now). */
  t: number;
}

export interface Tool {
  readonly id: string;
  /** CSS cursor while hovering the stage / over the object / while active. */
  readonly cursor: { idle: string; hover: string; active: string };
  /** Tools that act anywhere (press) take the pointer even off the object. */
  readonly anywhere?: boolean;
  /** Return true if the tool takes this pointer (otherwise the camera orbits). */
  down(ctx: ToolContext, p: PointerSample): boolean;
  move(ctx: ToolContext, p: PointerSample): void;
  up(ctx: ToolContext, p: PointerSample): void;
  /** Called every physics step (tools animate even after release, e.g. a lifting plate). */
  update?(ctx: ToolContext, dt: number): void;
  /** Mouse hover (no buttons): previews such as the cutter outline. */
  hover?(ctx: ToolContext, p: PointerSample, overObject: boolean): void;
  cancel(ctx: ToolContext): void;
  /** Remove any scene objects (on tool switch / specimen change). */
  dispose?(ctx: ToolContext): void;
}

/**
 * How far a tool may push into a material: soft jelly yields deeply, a crisp apple only
 * dents (and slides instead). Normalised so jelly ≈ 1.
 */
export function yieldFactor(stiffness: number) {
  return Math.min(1, Math.sqrt(18 / Math.max(1, stiffness)));
}
