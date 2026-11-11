/** Global tuning constants. Material-specific values live in src/materials. */

export const SIM = {
  /** Physics runs at a fixed rate regardless of display refresh. */
  stepHz: 60,
  /** XPBD small-steps: many substeps with one iteration each. */
  substeps: 14,
  minSubsteps: 6,
  /** Cap on catch-up steps after a long frame (tab switch, GC). */
  maxStepsPerFrame: 3,
  gravity: -9.8,
  /** Absolute speed cap, protects against explosions from extreme input. */
  maxSpeed: 14,
  /** Kinetic floor friction: decay rate (1/s) of sliding velocity for touching particles. */
  floorFriction: 9,
  /** Sliding slower than this (units/s) sticks to the floor. */
  staticFrictionSpeed: 0.03,
  /** Converts the material damping rate (1/s) into per-edge damping strength. */
  edgeDampingScale: 6,
  /** Rolling resistance (1/s) at full contact; see SoftBody.applyContactDrag. */
  contactDrag: 3.2,
  /** Contact fraction that counts as full contact (a resting body touches ~10% of particles). */
  contactDragShare: 8,
  /** Gentle air drag (per second) so tossed objects eventually rest. */
  airDrag: 0.04,
  /** Stage bounds: invisible walls keep objects in view. */
  bounds: { halfWidth: 2.6, halfDepth: 1.6, ceiling: 3.6 },
  /** Lattice cell size relative to the object's largest dimension. */
  latticeResolution: 11,
  /** Display scale: 1 world unit = this many centimetres (for grams/volume readouts). */
  cmPerUnit: 6.5,
} as const;

export const GRAB = {
  /** Radius of the grabbed region, as a fraction of object size. */
  radiusFraction: 0.24,
  /** Compliance of the grab spring (lower = stiffer pull). */
  compliance: 2e-5,
  /** Keep grab targets slightly above the floor. */
  minHeight: 0.04,
} as const;

export const RENDER = {
  maxPixelRatio: 2,
  fov: 30,
  cameraDistance: 6.2,
  cameraHeight: 1.75,
  lookAtHeight: 0.42,
  shadowMapSize: 2048,
} as const;
