/** The Phase 1 dev blob: a softly flattened jelly drop. */
import { IcosahedronGeometry, type BufferGeometry } from 'three/webgpu';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Sdf, Vec3Tuple } from '../../sim/lattice';

const RADIUS = 0.55;
/** Vertical squash: makes it sit like a drop of jelly instead of rolling like a ball. */
const FLATTEN = 1.18;

export const blob = {
  sdf: ((x, y, z) => Math.hypot(x, y * FLATTEN, z) - RADIUS) as Sdf,
  bounds: {
    min: [-RADIUS, -RADIUS / FLATTEN, -RADIUS] as Vec3Tuple,
    max: [RADIUS, RADIUS / FLATTEN, RADIUS] as Vec3Tuple,
  },
  size: RADIUS * 2,
  renderGeometry(detail: number): BufferGeometry {
    const g = new IcosahedronGeometry(RADIUS, detail);
    g.scale(1, 1 / FLATTEN, 1);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    return mergeVertices(g, 1e-5);
  },
};
