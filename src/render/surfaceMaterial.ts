/**
 * Food surfaces: vertex-coloured physical material with per-point finish (roughness,
 * clearcoat, relief) from the `surf` attribute, procedural relief sampled in rest space,
 * fake subsurface glow for juicy and creamy materials, and optional per-pixel colour.
 *
 * Coats: on wet things (juicy flesh, custard, syrup) the clearcoat follows the relief, so
 * every vesicle catches light; on waxy or tempered things (apple skin, chocolate) the coat
 * stays smooth over a textured base, which is what reads as wax.
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
import { bumpedNormal, surfaceHeight } from './surface';

export function createSurfaceMaterial(def: MaterialDef, look: Shape['look'] = {}) {
  const mat = new MeshPhysicalNodeMaterial({
    metalness: 0,
    clearcoatRoughness: 0.07,
    sheen: look.sheen ?? 0,
    sheenRoughness: 0.55,
    specularIntensity: 1,
    ior: 1.45,
  });

  const rest = attribute('rest', 'vec3');
  const surf = attribute('surf', 'vec4');
  const base = attribute('color', 'vec3');
  let color = base.mul(1);
  let roughness = surf.x.mul(1);
  const detail = look.detail ?? 'none';
  if (detail === 'crumb' || detail === 'pores') {
    // Small dark pores and a fine grain: reads as sponge at any zoom.
    const pores = smoothstep(float(0.28), float(0.62), mx_noise_float(rest.mul(48)));
    const grain = mx_noise_float(rest.mul(140)).mul(0.08);
    color = color.mul(float(1).sub(pores.mul(0.3)).add(grain));
    roughness = roughness.add(pores.mul(0.08));
  } else if (detail === 'speckle') {
    color = color.mul(float(1).add(mx_noise_float(rest.mul(36)).mul(0.06)));
  }
  // Subtle low-frequency tone variation everywhere: nothing real is a flat colour.
  color = color.mul(float(1).add(mx_noise_float(rest.mul(5.5)).mul(0.035)));
  if (look.shade) color = look.shade(color, rest) as typeof color;
  mat.colorNode = color;
  mat.roughnessNode = roughness.clamp(0.03, 1);
  mat.clearcoatNode = surf.y;

  if (look.bumps?.length) {
    const n = bumpedNormal(surfaceHeight(look.bumps, rest, surf));
    mat.normalNode = n;
    if (!look.smoothCoat) mat.clearcoatNormalNode = n;
  }

  if (def.look.kind === 'subsurface') {
    // Light scattering out through thin edges and a faint inner glow.
    const facing = normalView.dot(positionViewDirection).abs();
    const edge = smoothstep(float(0.8), float(0.1), facing);
    mat.emissiveNode = mix(color.mul(0.04), mix(color, vec3(1), 0.3).mul(0.28), edge.pow(1.5));
  }
  return mat;
}
