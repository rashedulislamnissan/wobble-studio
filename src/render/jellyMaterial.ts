/**
 * Glossy jelly. A flat studio backdrop gives physical transmission nothing to refract,
 * so translucency is art-directed (docs/decisions.md D3): a saturated body, a deeper core,
 * light glowing through thin edges, a wet clearcoat and a faintly uneven moulded surface
 * that makes reflections of the studio lights wobble like real gelatine.
 * Body colour and finish come from vertex attributes, so eyes and bellies work per object.
 */
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { attribute, float, mix, normalView, positionViewDirection, smoothstep, uniform, vec3 } from 'three/tsl';
import { bumpedNormal, surfaceHeight, type BumpLayer } from './surface';

/** Moulded jelly is never perfectly smooth: a soft, slow unevenness plus fine ripples. */
const JELLY_RELIEF: BumpLayer[] = [
  { pattern: 'swirl', scale: 4, depth: 0.0024 },
  { pattern: 'grain', scale: 38, depth: 0.0005 },
];

/** `shade` optionally recolours per pixel (crisp markings, e.g. the penguin face). */
export function createJellyMaterial(clarity = 0.75, shade?: (base: unknown, rest: unknown) => unknown) {
  const uClarity = uniform(clarity);
  const mat = new MeshPhysicalNodeMaterial({
    metalness: 0,
    clearcoatRoughness: 0.025,
    specularIntensity: 1,
    ior: 1.4,
    sheen: 0.25,
    sheenColor: 0xffffff,
    sheenRoughness: 0.35,
  });

  const surf = attribute('surf', 'vec4');
  const rest = attribute('rest', 'vec3');
  const vcol = attribute('color', 'vec3');
  // Markings apply to the body only; details (eyes) carry surf.z = 0 and keep their colour.
  const body = shade ? mix(vcol, shade(vcol, rest) as typeof vcol, surf.z.clamp(0, 1)) : vcol;
  const core = body.pow(vec3(1.25)).mul(0.76);
  const edgeLight = mix(body, vec3(1), 0.45);
  const facing = normalView.dot(positionViewDirection).abs();
  const edge = smoothstep(float(0.85), float(0.05), facing); // 0 centre → 1 silhouette
  mat.colorNode = mix(core, body, edge.pow(0.7));
  mat.emissiveNode = mix(body.mul(0.1), edgeLight.mul(0.55), edge.pow(1.6).mul(uClarity));
  mat.roughnessNode = surf.x;
  mat.clearcoatNode = surf.y;
  const n = bumpedNormal(surfaceHeight(JELLY_RELIEF, rest, surf));
  mat.normalNode = n;
  mat.clearcoatNormalNode = n;

  return {
    material: mat,
    setClarity(v: number) {
      uClarity.value = v;
    },
  };
}
