/**
 * Food surfaces: vertex-coloured physical material with per-material gloss, optional
 * fake subsurface glow (juicy fruit, custard, mochi) and procedural surface detail that
 * is sampled in *rest* space, so crumb and speckles move with the deformation instead of
 * swimming across it.
 */
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import {
  attribute,
  float,
  mix,
  mx_noise_float,
  normalView,
  positionViewDirection,
  smoothstep,
  vec3,
} from 'three/tsl';
import type { MaterialDef } from '../materials/types';
import type { Shape } from '../objects/types';

export function createSurfaceMaterial(def: MaterialDef, look: Shape['look'] = {}) {
  const roughness = look.roughness ?? def.look.roughness;
  const mat = new MeshPhysicalNodeMaterial({
    roughness,
    metalness: 0,
    clearcoat: look.clearcoat ?? def.look.clearcoat ?? 0,
    clearcoatRoughness: 0.12,
    sheen: look.sheen ?? 0,
    sheenRoughness: 0.6,
  });

  const rest = attribute('rest', 'vec3');
  const base = attribute('color', 'vec3');
  let color = base.mul(1);
  const detail = look.detail ?? 'none';
  if (detail === 'crumb' || detail === 'pores') {
    // Small dark pores and a fine grain: reads as sponge at any zoom.
    const pores = smoothstep(float(0.28), float(0.62), mx_noise_float(rest.mul(48)));
    const grain = mx_noise_float(rest.mul(140)).mul(0.08);
    color = color.mul(float(1).sub(pores.mul(0.28)).add(grain));
    mat.roughnessNode = float(roughness).add(pores.mul(0.1));
  } else if (detail === 'speckle') {
    const speck = mx_noise_float(rest.mul(36)).mul(0.06);
    color = color.mul(float(1).add(speck));
  }
  if (look.shade) color = look.shade(color, rest) as typeof color;
  mat.colorNode = color;

  if (def.look.kind === 'subsurface') {
    // Light scattering out through thin edges and a faint inner glow.
    const facing = normalView.dot(positionViewDirection).abs();
    const edge = smoothstep(float(0.8), float(0.1), facing);
    mat.emissiveNode = mix(color.mul(0.05), mix(color, vec3(1), 0.3).mul(0.32), edge.pow(1.5));
  }
  return mat;
}
