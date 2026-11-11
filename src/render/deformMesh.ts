/**
 * A render mesh that follows the soft body through a tet embedding.
 * Positions and normals are rewritten each frame. When the body is cut, untouched pieces
 * keep their mesh and just remap tet indices (remapTets); split pieces get new meshes.
 */
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, type Material } from 'three/webgpu';
import { skinPoints, type Embedding } from '../sim/embed';

export class DeformableMesh {
  readonly mesh: Mesh;
  readonly geometry: BufferGeometry;
  readonly embedding: Embedding;
  private readonly position: BufferAttribute;
  private readonly normal: BufferAttribute;
  private readonly index: ArrayLike<number>;
  private tets: Uint32Array;
  /** Lowest rest-space y of the render surface (for floor offset). */
  readonly restMinY: number;

  constructor(source: BufferGeometry, embedding: Embedding, tets: Uint32Array, material: Material) {
    if (!source.index) throw new Error('DeformableMesh needs an indexed geometry');
    const restPositions = source.getAttribute('position').array as Float32Array;
    this.embedding = embedding;
    this.tets = tets;
    this.source = source;

    this.geometry = new BufferGeometry();
    this.position = new BufferAttribute(new Float32Array(restPositions), 3);
    this.position.setUsage(DynamicDrawUsage);
    this.normal = new BufferAttribute(new Float32Array(restPositions.length), 3);
    this.normal.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', this.position);
    this.geometry.setAttribute('normal', this.normal);
    for (const name of Object.keys(source.attributes)) {
      if (name !== 'position' && name !== 'normal') this.geometry.setAttribute(name, source.getAttribute(name));
    }
    this.geometry.setIndex(source.index);
    this.index = source.index.array;
    // Rest-space positions for procedural surface detail that sticks to the material.
    this.geometry.setAttribute('rest', new BufferAttribute(new Float32Array(restPositions), 3));

    let minY = Infinity;
    for (let i = 1; i < restPositions.length; i += 3) minY = Math.min(minY, restPositions[i]);
    this.restMinY = minY;

    this.rest = new Float32Array(restPositions);
    this.disp = new Float32Array(restPositions.length);
    this.dispTmp = new Float32Array(restPositions.length);
    // Vertex adjacency in CSR form from triangle edges. Interior edges appear twice (once
    // per adjacent triangle), which weights every neighbour equally: fine for smoothing.
    const n = restPositions.length / 3;
    const idx = source.index.array;
    this.adjStart = new Uint32Array(n + 1);
    for (let f = 0; f < idx.length; f++) this.adjStart[idx[f] + 1] += 2;
    for (let v = 0; v < n; v++) this.adjStart[v + 1] += this.adjStart[v];
    this.adj = new Uint32Array(this.adjStart[n]);
    const fill = this.adjStart.slice(0, n);
    for (let f = 0; f < idx.length; f += 3) {
      const a = idx[f], b = idx[f + 1], c = idx[f + 2];
      this.adj[fill[a]++] = b; this.adj[fill[a]++] = c;
      this.adj[fill[b]++] = a; this.adj[fill[b]++] = c;
      this.adj[fill[c]++] = a; this.adj[fill[c]++] = b;
    }

    this.mesh = new Mesh(this.geometry, material);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.computeNormals();
  }

  /** Source geometry (rest positions, colours) — used for recolouring. */
  readonly source: BufferGeometry;

  /** After a topology rebuild: point embedded tets at their new indices. */
  remapTets(tetMap: Int32Array, tets: Uint32Array) {
    const t = this.embedding.tet;
    for (let i = 0; i < t.length; i++) t[i] = Math.max(0, tetMap[t[i]]);
    this.tets = tets;
  }

  update(particles: ArrayLike<number>) {
    const p = this.position.array as Float32Array;
    skinPoints(this.embedding, this.tets, particles, p);
    if (this.smoothIterations > 0) this.smoothDisplacement(p);
    this.position.needsUpdate = true;
    this.computeNormals();
  }

  /** Laplacian passes over the displacement field (0 = off). */
  smoothIterations = 3;
  private readonly rest: Float32Array;
  private readonly adjStart: Uint32Array;
  private readonly adj: Uint32Array;
  private readonly disp: Float32Array;
  private readonly dispTmp: Float32Array;

  /**
   * Linear tets crease under large deformation. Smoothing the *displacement* (not the
   * position) removes the creases while leaving the rest shape untouched; rigid motion
   * changes by only ~h²·curvature.
   */
  private smoothDisplacement(p: Float32Array) {
    const { rest, adjStart, adj } = this;
    let d = this.disp;
    let t = this.dispTmp;
    for (let i = 0; i < p.length; i++) d[i] = p[i] - rest[i];
    const n = p.length / 3;
    for (let it = 0; it < this.smoothIterations; it++) {
      for (let v = 0; v < n; v++) {
        const s = adjStart[v];
        const e = adjStart[v + 1];
        let ax = 0, ay = 0, az = 0;
        for (let k = s; k < e; k++) {
          const j = adj[k] * 3;
          ax += d[j]; ay += d[j + 1]; az += d[j + 2];
        }
        const inv = e > s ? 1 / (e - s) : 0;
        const o = v * 3;
        t[o] = d[o] * 0.5 + ax * inv * 0.5;
        t[o + 1] = d[o + 1] * 0.5 + ay * inv * 0.5;
        t[o + 2] = d[o + 2] * 0.5 + az * inv * 0.5;
      }
      const swap = d;
      d = t;
      t = swap;
    }
    for (let i = 0; i < p.length; i++) p[i] = rest[i] + d[i];
  }

  /** Area-weighted vertex normals, written in place (no allocation). */
  private computeNormals() {
    const p = this.position.array as Float32Array;
    const n = this.normal.array as Float32Array;
    const idx = this.index;
    n.fill(0);
    for (let f = 0; f < idx.length; f += 3) {
      const a = idx[f] * 3, b = idx[f + 1] * 3, c = idx[f + 2] * 3;
      const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
      const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
      n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
      n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
      n[i] /= l;
      n[i + 1] /= l;
      n[i + 2] /= l;
    }
    this.normal.needsUpdate = true;
  }

  /** Lowest current y and horizontal centre/extent, for the contact shadow. */
  footprint(out: { x: number; z: number; radius: number; minY: number }) {
    const p = this.position.array as Float32Array;
    let minY = Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      if (y < minY) minY = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    out.x = (minX + maxX) / 2;
    out.z = (minZ + maxZ) / 2;
    out.radius = Math.max(maxX - minX, maxZ - minZ) / 2;
    out.minY = minY;
    return out;
  }

  dispose() {
    this.geometry.dispose();
  }
}
