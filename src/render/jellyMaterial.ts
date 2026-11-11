/**
 * Glossy jelly. A flat studio backdrop gives physical transmission nothing to refract,
 * so translucency is art-directed instead (see docs/decisions.md D3): a saturated body,
 * a deeper core, light "glowing through" thin edges, a wet clearcoat and crisp highlights.
 * Body colour comes from vertex colours, so eyes and bellies work per object.
 */
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { attribute, float, mix, normalView, positionViewDirection, smoothstep, uniform, vec3 } from 'three/tsl';

export function createJellyMaterial(clarity = 0.75) {
  const uClarity = uniform(clarity);
  const mat = new MeshPhysicalNodeMaterial({
    roughness: 0.18,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.035,
    specularIntensity: 0.9,
    sheen: 0.3,
    sheenColor: 0xffffff,
    sheenRoughness: 0.4,
  });

  const body = attribute('color', 'vec3');
  const core = body.pow(vec3(1.25)).mul(0.78);
  const edgeLight = mix(body, vec3(1), 0.45);
  const facing = normalView.dot(positionViewDirection).abs();
  const edge = smoothstep(float(0.85), float(0.05), facing); // 0 centre → 1 silhouette
  mat.colorNode = mix(core, body, edge.pow(0.7));
  mat.emissiveNode = mix(body.mul(0.12), edgeLight.mul(0.55), edge.pow(1.6).mul(uClarity));

  return {
    material: mat,
    setClarity(v: number) {
      uClarity.value = v;
    },
  };
}
