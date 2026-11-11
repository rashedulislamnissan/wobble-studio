/** The Phase 1 dev blob (?dev=blob): a softly flattened jelly drop. */
import { lin } from '../color';
import type { ShapeBuilder } from '../types';

const RADIUS = 0.55;
/** Vertical squash: it sits like a drop of jelly instead of rolling like a ball. */
const FLATTEN = 1.18;

export const blob: ShapeBuilder = () => ({
  sdf: (x, y, z) => Math.hypot(x, y * FLATTEN, z) - RADIUS,
  bounds: { min: [-RADIUS, -RADIUS / FLATTEN, -RADIUS], max: [RADIUS, RADIUS / FLATTEN, RADIUS] },
  size: RADIUS * 2,
  color: (v) => {
    const c = lin(v.color);
    return () => c;
  },
});
