/**
 * Glossy jelly. A flat studio backdrop gives physical transmission nothing to refract,
 * so translucency is art-directed instead: a saturated body, a deeper core, light
 * "glowing through" thin edges, a wet clearcoat and crisp environment highlights.
 * Identical on the WebGPU and WebGL backends, and cheaper than a transmission pass.
 */
import { Color, MeshPhysicalNodeMaterial } from 'three/webgpu';
import { float, mix, normalView, positionViewDirection, smoothstep, uniform } from 'three/tsl';

export interface JellyLook {
  color: string;
  /** 0 = dense gummy, 1 = very clear jelly (stronger edge glow). */
  clarity?: number;
}

export function createJellyMaterial({ color, clarity = 0.75 }: JellyLook) {
  const uBody = uniform(new Color());
  const uCore = uniform(new Color());
  const uEdge = uniform(new Color());
  const uClarity = uniform(clarity);

  const mat = new MeshPhysicalNodeMaterial({
    roughness: 0.18,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.035,
    specularIntensity: 0.9,
    sheen: 0.35,
    sheenRoughness: 0.4,
  });

  const facing = normalView.dot(positionViewDirection).abs();
  const edge = smoothstep(float(0.85), float(0.05), facing); // 0 centre → 1 silhouette
  // Diffuse: deeper core, lighter body toward the rim.
  mat.colorNode = mix(uCore, uBody, edge.pow(0.7));
  // Light scattering out through thin edges, plus a faint inner glow everywhere.
  mat.emissiveNode = mix(uBody.mul(0.12), uEdge.mul(0.55), edge.pow(1.6).mul(uClarity));

  const setColor = (hex: string) => {
    const c = new Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    uBody.value.copy(c);
    uCore.value.setHSL(hsl.h, Math.min(1, hsl.s * 1.08), hsl.l * 0.72);
    uEdge.value.copy(c).lerp(new Color('#ffffff'), 0.45);
    mat.sheenColor = new Color().copy(c).lerp(new Color('#ffffff'), 0.6);
  };
  setColor(color);

  return {
    material: mat,
    setColor,
    setClarity(v: number) {
      uClarity.value = v;
    },
  };
}
