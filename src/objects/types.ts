import type { BufferGeometry } from 'three/webgpu';
import type { MaterialId } from '../materials/types';
import type { Sdf, Vec3Tuple } from '../sim/lattice';
import type { TintOverride } from '../tint/tint';
import type { ColorFn } from './mesher';

export type Group = 'jelly' | 'fruit' | 'soft' | 'firm';

export type ToolId =
  | 'hand'
  | 'poke'
  | 'press'
  | 'knife'
  | 'wavy'
  | 'cutter'
  | 'fork'
  | 'spoon'
  | 'hammer';

export interface Variant {
  id: string;
  label: string;
  /** Dominant colour: drives the tint and the swatch. */
  color: string;
  /** Extremes for the contrast guard (translucent or two-tone objects). */
  darkest?: string;
  lightest?: string;
  tintOverride?: TintOverride;
}

export interface ObjectAction {
  id: string;
  label: string;
}

export interface ObjectDef {
  id: string;
  no: number;
  group: Group;
  /** Editorial title: first line, indented second line (may be empty). */
  title: [string, string];
  description: string;
  material: MaterialId;
  variants: Variant[];
  /** Hue (deg) used when a variant is near-grey (white mochi, white bread). */
  neutralHue?: number;
  tools: ToolId[];
  actions: ObjectAction[];
  /** Lazy shape module, so only the selected object's code is loaded. */
  load: () => Promise<ShapeBuilder>;
  /** Default Firmness slider position (0..1) if this object differs from its material. */
  firmness?: number;
  /** The variety changes the shape itself (Swiss vs cheddar): rebuild on change. */
  rebuildOnVariant?: boolean;
}

/** Everything needed to simulate and draw one object. */
export interface Shape {
  sdf: Sdf;
  bounds: { min: Vec3Tuple; max: Vec3Tuple };
  /** Largest dimension (world units). */
  size: number;
  /** Per-variant vertex colour function (linear-ish sRGB 0..1). */
  color: (variant: Variant) => ColorFn;
  /** Thin render-only details (stems, eyes, sprinkles), embedded in the body. */
  details?: (variant: Variant) => BufferGeometry[];
  /** Named particle regions for special actions (weight 0..1 by rest position). */
  regions?: Record<string, (x: number, y: number, z: number) => number>;
  /** Optional tuning for this object's look (on top of its material's look). */
  look?: {
    roughness?: number;
    clearcoat?: number;
    sheen?: number;
    detail?: 'pores' | 'crumb' | 'speckle' | 'none';
    /**
     * Optional per-pixel colour (TSL): receives the vertex colour and rest-space position
     * nodes, returns a vec3 node. For patterns finer than the mesh (citrus membranes).
     */
    shade?: (base: unknown, rest: unknown) => unknown;
  };
  /** Lattice inflation override (default 0.3). */
  inflate?: number;
  /**
   * Bottom-heavy mass ("weeble"): extra mass toward the base, so tall soft objects rock
   * back upright instead of toppling. 0 = uniform.
   */
  ballast?: number;
  /**
   * Brittle objects break only along these rest-space planes (n·p = d), e.g. a chocolate
   * bar's grooves. Knife and hammer snap to the nearest one.
   */
  snapPlanes?: [number, number, number, number][];
}

export type ShapeBuilder = (variant?: Variant) => Shape;
