/** A soft rounded drop in the variant colour, used until an object's real shape lands. */
import { lin } from '../color';
import { ellipsoid } from '../sdf';
import type { ShapeBuilder } from '../types';

export const placeholder: ShapeBuilder = () => ({
  sdf: ellipsoid(0, 0, 0, 0.55, 0.46, 0.55),
  bounds: { min: [-0.55, -0.46, -0.55], max: [0.55, 0.46, 0.55] },
  size: 1.1,
  color: (v) => {
    const c = lin(v.color);
    return () => c;
  },
});
