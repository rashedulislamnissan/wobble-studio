/** Material definitions are pure data (§5). The engine reads these; no per-material ifs. */

export type MaterialId =
  | 'jelly'
  | 'fruit-crisp'
  | 'fruit-juicy'
  | 'sponge'
  | 'cream'
  | 'mochi'
  | 'firm-dairy'
  | 'brittle';

export interface Range {
  min: number;
  max: number;
  /** Default slider position 0..1 (log-interpolated between min and max). */
  default: number;
}

export interface MaterialDef {
  id: MaterialId;
  label: string;
  /** Edge stiffness modulus range for the Firmness slider. */
  stiffness: Range;
  /** Internal damping rate range (1/s) for the damping slider. */
  damping: Range;
  /** Bulk modulus for volume preservation (Infinity = incompressible). */
  bulk: number;
  /** Simulation density (relative). */
  density: number;
  /** Display density for the Mass readout, g/cm³. */
  displayDensity: number;
  /** Brittle materials hide the damping slider. */
  dampingAdjustable: boolean;
  /** Slider end labels. */
  firmnessLabels: [string, string];
  dampingLabels: [string, string];
  /** Rendering hints. */
  look: {
    kind: 'jelly' | 'solid' | 'subsurface';
    roughness: number;
    clarity?: number;
    clearcoat?: number;
  };
}

/** Log interpolation for perceptually even sliders. */
export function rangeValue(r: Range, t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return r.min * Math.pow(r.max / r.min, c);
}

export function rangePosition(r: Range, value: number): number {
  return Math.log(value / r.min) / Math.log(r.max / r.min);
}
