/**
 * Build an object's render geometry: the SDF surface (vertex-coloured) plus any thin
 * details, merged into one indexed mesh. Recolouring for a new variant rewrites only the
 * colour attribute, so switching variety never resets the simulation.
 */
import { BufferAttribute, type BufferGeometry } from 'three/webgpu';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { meshSdf } from './mesher';
import type { Shape, Variant } from './types';

export interface RenderBuild {
  geometry: BufferGeometry;
  recolor(variant: Variant): void;
}

function prepareDetail(g: BufferGeometry): BufferGeometry {
  let d = g;
  for (const name of Object.keys(d.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'color') d.deleteAttribute(name);
  }
  if (!d.index) d = mergeVertices(d, 1e-6);
  if (!d.getAttribute('normal')) d.computeVertexNormals();
  return d;
}

export function buildRenderGeometry(shape: Shape, variant: Variant, resolution: number): RenderBuild {
  const { min, max } = shape.bounds;
  const body = meshSdf(shape.sdf, min, max, { resolution, color: shape.color(variant) });
  const details = (shape.details?.(variant) ?? []).map(prepareDetail);
  const geometry = details.length ? mergeGeometries([body, ...details], false)! : body;
  const bodyVerts = body.getAttribute('position').count;

  const recolor = (v: Variant) => {
    const color = geometry.getAttribute('color') as BufferAttribute;
    const pos = geometry.getAttribute('position').array as Float32Array;
    const nrm = geometry.getAttribute('normal').array as Float32Array;
    const fn = shape.color(v);
    const arr = color.array as Float32Array;
    for (let i = 0; i < bodyVerts; i++) {
      const c = fn(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
      arr[i * 3] = c[0];
      arr[i * 3 + 1] = c[1];
      arr[i * 3 + 2] = c[2];
    }
    // Details keep their topology across variants; copy their new colours in order.
    let offset = bodyVerts * 3;
    for (const d of shape.details?.(v) ?? []) {
      const src = prepareDetail(d).getAttribute('color').array as Float32Array;
      arr.set(src, offset);
      offset += src.length;
    }
    color.needsUpdate = true;
  };

  return { geometry, recolor };
}

/** Give a primitive detail geometry a flat colour attribute. */
export function paint(g: BufferGeometry, rgb: [number, number, number]): BufferGeometry {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(rgb, i * 3);
  g.setAttribute('color', new BufferAttribute(c, 3));
  return g;
}
