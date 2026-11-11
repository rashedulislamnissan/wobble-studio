/**
 * Procedural surface relief for realism: orange-peel dimples, apple-skin grain, sponge
 * pores, juicy vesicles, soft swirls. Heights are computed per pixel in *rest* space (so
 * the texture moves with the deforming object) and turned into a perturbed shading
 * normal with screen-space derivatives (Mikkelsen's surface-gradient bump mapping).
 *
 * Per-vertex `surf` attribute: x = roughness, y = clearcoat, z/w = strength of bump
 * layers A/B. That lets one object be glossy on the skin and matte in the flesh.
 */
import {
  abs,
  attribute,
  faceDirection,
  float,
  mx_noise_float,
  mx_worley_noise_float,
  normalView,
  positionView,
  smoothstep,
} from 'three/tsl';

export type BumpPattern = 'grain' | 'dimples' | 'pores' | 'cells' | 'swirl' | 'crust';

export interface BumpLayer {
  pattern: BumpPattern;
  /** Features per world unit. */
  scale: number;
  /** Height amplitude in world units (a few thousandths reads as fine texture). */
  depth: number;
}

type Vec3 = ReturnType<typeof attribute<'vec3'>>;
type Float = ReturnType<typeof float>;

/** Height field (roughly -1..1) for a pattern at rest-space point p. */
function pattern(kind: BumpPattern, p: Vec3): Float {
  switch (kind) {
    case 'grain':
      return mx_noise_float(p) as unknown as Float;
    case 'dimples': {
      // Pits around cell centres: citrus peel, strawberry seeds' sockets.
      const d = mx_worley_noise_float(p) as unknown as Float;
      return smoothstep(float(0.05), float(0.55), d).sub(1) as unknown as Float;
    }
    case 'cells': {
      // Plump cells with shallow valleys between them: juice vesicles, watermelon flesh.
      const d = mx_worley_noise_float(p) as unknown as Float;
      return float(0.6).sub(d) as unknown as Float;
    }
    case 'pores': {
      // Sponge and bread crumb: holes punched into a grainy surface.
      const n = mx_noise_float(p) as unknown as Float;
      const holes = smoothstep(float(0.15), float(0.55), n).mul(-1.4);
      const fine = mx_noise_float(p.mul(3.1)) as unknown as Float;
      return holes.add(fine.mul(0.25)) as unknown as Float;
    }
    case 'crust': {
      // Bread crust: blistered, uneven bake.
      const n = abs(mx_noise_float(p) as unknown as Float);
      return float(0.5).sub(n).mul(-1.2).add((mx_noise_float(p.mul(4)) as unknown as Float).mul(0.2)) as unknown as Float;
    }
    case 'swirl':
    default:
      return mx_noise_float(p) as unknown as Float;
  }
}

/** Combined height from up to two layers, weighted per vertex by surf.z / surf.w. */
export function surfaceHeight(layers: BumpLayer[] | undefined, rest: Vec3, surf: ReturnType<typeof attribute<'vec4'>>) {
  let h = float(0) as unknown as Float;
  layers?.slice(0, 2).forEach((l, i) => {
    const w = i === 0 ? surf.z : surf.w;
    h = h.add(pattern(l.pattern, rest.mul(l.scale) as unknown as Vec3).mul(l.depth).mul(w)) as unknown as Float;
  });
  return h;
}

/** View-space normal perturbed by a height field (units: world). */
export function bumpedNormal(h: Float) {
  const dpdx = positionView.dFdx();
  const dpdy = positionView.dFdy();
  const N = normalView;
  const r1 = dpdy.cross(N);
  const r2 = N.cross(dpdx);
  const det = dpdx.dot(r1).mul(faceDirection);
  const grad = det.sign().mul(h.dFdx().mul(r1).add(h.dFdy().mul(r2)));
  return det.abs().mul(N).sub(grad).normalize();
}
