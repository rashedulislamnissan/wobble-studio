/**
 * Render geometry for an object or for any piece of it after cutting: the piece's SDF
 * surface (vertex-coloured, with interior colours on cut faces) plus the thin details
 * (stems, eyes, berries) that belong to that piece. Recolouring for a new variant
 * rewrites only the colour attribute, so switching variety never resets the simulation.
 */
import { BufferAttribute, type BufferGeometry } from 'three/webgpu';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Sdf, Vec3Tuple } from '../sim/lattice';
import { meshSdf } from './mesher';
import type { Shape, Variant } from './types';

interface PieceMeta {
  bodyVerts: number;
  detailIds: number[];
}

/** Details (eyes, stems, berries, seeds) default to a smooth, glossy finish. */
const DETAIL_SURF: [number, number, number, number] = [0.22, 0.85, 0, 0];

function prepareDetail(g: BufferGeometry): BufferGeometry {
  let d = g;
  for (const name of Object.keys(d.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'color') d.deleteAttribute(name);
  }
  if (!d.index) d = mergeVertices(d, 1e-6);
  if (!d.getAttribute('normal')) d.computeVertexNormals();
  const n = d.getAttribute('position').count;
  const surf = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) surf.set(DETAIL_SURF, i * 4);
  d.setAttribute('surf', new BufferAttribute(surf, 4));
  return d;
}

export class ObjectMesher {
  /** Render cell size (world units). */
  readonly h: number;
  private readonly detailCache = new Map<string, BufferGeometry[]>();
  /** Rest-space centroid of each detail, to assign details to pieces after a cut. */
  readonly detailCentroids: Vec3Tuple[];

  constructor(
    readonly shape: Shape,
    resolution: number,
    initialVariant: Variant,
  ) {
    this.h = shape.size / resolution;
    this.detailCentroids = this.details(initialVariant).map((g) => {
      g.computeBoundingBox();
      const c = g.boundingBox!.getCenter(g.boundingBox!.min.clone());
      return [c.x, c.y, c.z];
    });
  }

  private details(v: Variant): BufferGeometry[] {
    let d = this.detailCache.get(v.id);
    if (!d) {
      d = (this.shape.details?.(v) ?? []).map(prepareDetail);
      this.detailCache.set(v.id, d);
    }
    return d;
  }

  /** Vertex colour with interior depth: 0 on the original skin, > 0 on cut faces. */
  private colorFn(v: Variant) {
    const fn = this.shape.color(v);
    const sdf = this.shape.sdf;
    return (x: number, y: number, z: number, nx: number, ny: number, nz: number) =>
      fn(x, y, z, nx, ny, nz, Math.max(0, -sdf(x, y, z)));
  }

  /** Mesh a piece: `sdf` is the piece's rest-space shape, bounds its rest extent. */
  build(sdf: Sdf, min: Vec3Tuple, max: Vec3Tuple, variant: Variant, detailIds: number[]): BufferGeometry {
    const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const resolution = Math.max(8, Math.ceil(extent / this.h));
    const body = meshSdf(sdf, min, max, { resolution, color: this.colorFn(variant) });
    this.addSurface(body);
    const all = this.details(variant);
    const parts = detailIds.map((i) => all[i]).filter(Boolean);
    const geometry = parts.length ? mergeGeometries([body, ...parts.map((p) => p.clone())], false)! : body;
    geometry.userData.piece = { bodyVerts: body.getAttribute('position').count, detailIds } satisfies PieceMeta;
    return geometry;
  }

  /** Initial, uncut object. */
  buildWhole(variant: Variant): BufferGeometry {
    const { min, max } = this.shape.bounds;
    return this.build(this.shape.sdf, min, max, variant, this.detailCentroids.map((_, i) => i));
  }

  /** Per-vertex finish (roughness, clearcoat, relief weights). */
  private addSurface(g: BufferGeometry) {
    const pos = g.getAttribute('position').array as Float32Array;
    const nrm = g.getAttribute('normal').array as Float32Array;
    const n = pos.length / 3;
    const surf = new Float32Array(n * 4);
    const fn = this.shape.surface;
    const sdf = this.shape.sdf;
    const r = this.defaults.roughness, c = this.defaults.clearcoat;
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const v = fn ? fn(x, y, z, nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2], Math.max(0, -sdf(x, y, z))) : [r, c, 1, 1];
      surf.set(v, i * 4);
    }
    g.setAttribute('surf', new BufferAttribute(surf, 4));
  }

  /** Fallback finish when a shape has no surface function. */
  defaults = { roughness: 0.4, clearcoat: 0.3 };

  recolor(geometry: BufferGeometry, v: Variant) {
    const meta = geometry.userData.piece as PieceMeta | undefined;
    if (!meta) return;
    const color = geometry.getAttribute('color') as BufferAttribute;
    const pos = geometry.getAttribute('position').array as Float32Array;
    const nrm = geometry.getAttribute('normal').array as Float32Array;
    const fn = this.colorFn(v);
    const arr = color.array as Float32Array;
    for (let i = 0; i < meta.bodyVerts; i++) {
      const c = fn(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
      arr[i * 3] = c[0];
      arr[i * 3 + 1] = c[1];
      arr[i * 3 + 2] = c[2];
    }
    let offset = meta.bodyVerts * 3;
    const all = this.details(v);
    for (const id of meta.detailIds) {
      const src = all[id]?.getAttribute('color')?.array as Float32Array | undefined;
      if (!src) continue;
      arr.set(src, offset);
      offset += src.length;
    }
    color.needsUpdate = true;
  }
}

/** Give a primitive detail geometry a flat colour attribute. */
export function paint(g: BufferGeometry, rgb: [number, number, number]): BufferGeometry {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(rgb, i * 3);
  g.setAttribute('color', new BufferAttribute(c, 3));
  return g;
}

/** Keep only triangles whose vertices all pass `keep` (drops another component's surface). */
export function filterTriangles(g: BufferGeometry, keep: (v: number) => boolean): BufferGeometry {
  const idx = g.index!.array;
  const out: number[] = [];
  for (let f = 0; f < idx.length; f += 3) {
    if (keep(idx[f]) && keep(idx[f + 1]) && keep(idx[f + 2])) out.push(idx[f], idx[f + 1], idx[f + 2]);
  }
  if (out.length !== idx.length) g.setIndex(out);
  return g;
}
