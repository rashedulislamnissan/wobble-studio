/**
 * Citrus slice: a thick half-wheel standing on its cut edge, turned three-quarters to
 * show the segments. Rind and juice vesicles are vertex-coloured; membranes, pith ring
 * and core are shaded per pixel (shadeCitrus) so they stay crisp.
 */
import { lin, mix, noise3, smoothstep, type RGB } from '../color';
import { Color } from 'three/webgpu';
import { atan, float, fract, length, max, min, mix as tmix, smoothstep as ss, uniform, vec2, type attribute } from 'three/tsl';
import type { Sdf } from '../sdf';
import type { ShapeBuilder, Variant } from '../types';
import { len2 } from '../sdf';

const R = 0.62;
const HALF_T = 0.15;
const ROUND = 0.045;
const SEGMENTS_HALF = 5;
const TURN = -0.5;
const cos = Math.cos(TURN);
const sin = Math.sin(TURN);
const toLocal = (x: number, z: number): [number, number] => [cos * x - sin * z, sin * x + cos * z];

const local: Sdf = (x, y, z) => {
  // Rounded disc in the XY plane, cut in half at y = 0 (also rounded).
  const dr = len2(x, y) - R + ROUND;
  const dz = Math.abs(z) - HALF_T + ROUND;
  const disc = Math.min(Math.max(dr, dz), 0) + len2(Math.max(dr, 0), Math.max(dz, 0)) - ROUND;
  const cut = -y - 0.0;
  const k = 0.035;
  const h = Math.max(k - Math.abs(-disc - cut), 0) / k;
  return -(Math.min(-disc, -cut) - (h * h * k) / 4);
};

const sdf: Sdf = (x, y, z) => {
  const [lx, lz] = toLocal(x, z);
  return local(lx, y - 0.0, lz);
};

const PALETTES: Record<string, { rind: string; rindDeep: string; pith: string; flesh: string; fleshAlt: string }> = {
  orange: { rind: '#F08A1A', rindDeep: '#D86A0E', pith: '#FFF0D2', flesh: '#F99A24', fleshAlt: '#FFB646' },
  blood: { rind: '#E0702A', rindDeep: '#B9481C', pith: '#FCE6CF', flesh: '#B8232E', fleshAlt: '#E0533A' },
  lemon: { rind: '#EFD22C', rindDeep: '#D9B514', pith: '#FFF7DA', flesh: '#F4E06A', fleshAlt: '#FBEE9C' },
};

function palette(v: Variant) {
  const p = PALETTES[v.id] ?? PALETTES.orange;
  return {
    rind: lin(p.rind),
    rindDeep: lin(p.rindDeep),
    pith: lin(p.pith),
    flesh: lin(p.flesh),
    fleshAlt: lin(p.fleshAlt),
  };
}

export const orangeSlice: ShapeBuilder = () => ({
  sdf,
  bounds: { min: [-0.7, 0, -0.5], max: [0.7, 0.64, 0.5] },
  size: 1.3,
  inflate: 0.35,
  look: { roughness: 0.28, clearcoat: 0.9, detail: 'none', shade: shadeCitrus },
  color: (v) => {
    const p = palette(v);
    return (x, y, z): RGB => {
      const [lx, lz] = toLocal(x, z);
      const r = len2(lx, y);
      const onFace = Math.abs(lz) > HALF_T - ROUND * 0.6;
      // Peel: the outer ring, and anywhere off the flat faces.
      // Rind/flesh switch sits under the per-pixel pith ring, which hides its stair-steps.
      if (r > R - 0.072 || (!onFace && r > R - 0.12)) {
        const pores = noise3(lx * 60, y * 60, lz * 60);
        return mix(p.rind, p.rindDeep, 0.25 + pores * 0.35);
      }
      const ang = Math.atan2(y, lx);
      // Juice vesicles: elongated radial teardrops, lighter at their tips.
      const radial = noise3(ang * 26, r * 18, lz * 4);
      const sparkle = smoothstep(0.55, 0.9, noise3(lx * 38, y * 38, lz * 38));
      return mix(mix(p.flesh, p.fleshAlt, radial * 0.6), p.pith, sparkle * 0.18);
    };
  },
  regions: {
    rind: (x, y, z) => {
      const [lx] = toLocal(x, z);
      return smoothstep(R - 0.15, R - 0.02, len2(lx, y));
    },
  },
});

type Vec3Node = ReturnType<typeof attribute<'vec3'>>;
const PITH = uniform(new Color('#FFF0D4'));

/**
 * Per-pixel membranes, pith ring and core: crisp at any zoom, where vertex colours would
 * stair-step. Computed in rest space so the pattern deforms with the fruit.
 */
function shadeCitrus(baseIn: unknown, restIn: unknown): unknown {
  const base = baseIn as Vec3Node;
  const rest = restIn as Vec3Node;
  const lx = rest.x.mul(cos).sub(rest.z.mul(sin));
  const ly = rest.y;
  const r = length(vec2(lx, ly));
  const step = Math.PI / SEGMENTS_HALF;
  const f = fract(atan(ly, lx).div(step));
  const d = min(f, float(1).sub(f)).mul(step).mul(r);
  const inFlesh = float(1).sub(ss(R - 0.1, R - 0.088, r));
  const membrane = float(1).sub(ss(0.0035, 0.0105, d)).mul(inFlesh);
  const ring = ss(R - 0.096, R - 0.088, r).mul(float(1).sub(ss(R - 0.056, R - 0.048, r)));
  const core = float(1).sub(ss(0.03, 0.056, r));
  return tmix(base, PITH, max(max(membrane.mul(0.92), ring), core.mul(0.85)));
}
