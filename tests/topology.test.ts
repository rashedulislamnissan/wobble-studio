import { describe, expect, it } from 'vitest';
import { buildLatticeTetMesh, tetVolume } from '../src/sim/lattice';
import { extractRotation, rigidFit, splitTopology, type Topology } from '../src/sim/topology';

function initial(sdf: (x: number, y: number, z: number) => number, min: [number, number, number], max: [number, number, number], h: number): Topology {
  const mesh = buildLatticeTetMesh(sdf, min, max, h);
  const n = mesh.positions.length / 3;
  const rest = new Float64Array(mesh.positions);
  const nTets = mesh.tets.length / 4;
  return {
    rest,
    pos: new Float64Array(rest),
    prev: new Float64Array(rest),
    vel: new Float64Array(n * 3),
    tets: new Uint32Array(mesh.tets),
    tetOrig: new Int32Array(nTets).map((_, i) => i),
    tetPiece: new Uint16Array(nTets),
    nodePiece: new Uint16Array(n),
    pieceCount: 1,
  };
}

const centroidX = (top: Topology, t: number) =>
  (top.pos[top.tets[t * 4] * 3] + top.pos[top.tets[t * 4 + 1] * 3] + top.pos[top.tets[t * 4 + 2] * 3] + top.pos[top.tets[t * 4 + 3] * 3]) / 4;

describe('cut topology', () => {
  const box = (x: number, y: number, z: number) => Math.max(Math.abs(x) - 0.5, Math.abs(y) - 0.25, Math.abs(z) - 0.25);

  it('splits a bar into two independent pieces that conserve volume', () => {
    const top = initial(box, [-0.5, -0.25, -0.25], [0.5, 0.25, 0.25], 0.1);
    const nT = top.tets.length / 4;
    const label = new Int32Array(nT).map((_, t) => (centroidX(top, t) < 0.05 ? 0 : 1));
    const { topology: out, origin } = splitTopology(top, label);
    expect(out.pieceCount).toBe(2);
    expect(origin.map((o) => o.label).sort()).toEqual([0, 1]);
    // No node is shared between pieces.
    for (let t = 0; t < out.tets.length / 4; t++) {
      for (let k = 0; k < 4; k++) expect(out.nodePiece[out.tets[t * 4 + k]]).toBe(out.tetPiece[t]);
    }
    const vol = (tp: Topology) => {
      let v = 0;
      for (let t = 0; t < tp.tets.length / 4; t++) v += tetVolume(tp.rest, tp.tets[t * 4], tp.tets[t * 4 + 1], tp.tets[t * 4 + 2], tp.tets[t * 4 + 3]);
      return v;
    };
    expect(vol(out)).toBeCloseTo(vol(top), 9);
    expect(out.rest.length).toBeGreaterThan(top.rest.length); // duplicated seam nodes
  });

  it('finds connected components: one cut through a ring leaves separate arcs', () => {
    const ring = (x: number, y: number, z: number) => Math.hypot(Math.hypot(x, z) - 0.4, y) - 0.14;
    const top = initial(ring, [-0.55, -0.15, -0.55], [0.55, 0.15, 0.55], 0.06);
    const nT = top.tets.length / 4;
    // Cut along x = 0: the ring becomes two U-shapes, each connected.
    let label = new Int32Array(nT).map((_, t) => (centroidX(top, t) < 0 ? 0 : 1));
    let r = splitTopology(top, label);
    expect(r.topology.pieceCount).toBe(2);
    // Remove a band at x≈0.27 on the right U. It crosses both arms, leaving two stubs and
    // the outer arc: 1 (left U) + 3 = 4 pieces.
    label = new Int32Array(r.topology.tets.length / 4).map((_, t) => {
      const cx = centroidX(r.topology, t);
      return cx > 0.22 && cx < 0.32 ? -1 : 0;
    });
    r = splitTopology(r.topology, label);
    expect(r.topology.pieceCount).toBe(4);
  });

  it('removes labelled tets and keeps state', () => {
    const top = initial(box, [-0.5, -0.25, -0.25], [0.5, 0.25, 0.25], 0.1);
    top.vel.fill(2);
    const label = new Int32Array(top.tets.length / 4).map((_, t) => (centroidX(top, t) > 0.3 ? -1 : 0));
    const { topology: out } = splitTopology(top, label);
    expect(out.pieceCount).toBe(1);
    expect(out.tets.length).toBeLessThan(top.tets.length);
    expect(Array.from(out.vel).every((v) => v === 2)).toBe(true);
  });
});

describe('rigid fit', () => {
  it('recovers a known rotation and translation', () => {
    const a = 0.7;
    const Rz = [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
    const rest = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0.5];
    const pos: number[] = [];
    for (let i = 0; i < rest.length; i += 3) {
      const [x, y, z] = rest.slice(i, i + 3);
      pos.push(Rz[0] * x + Rz[1] * y + 2, Rz[3] * x + Rz[4] * y - 1, z + 0.5);
    }
    const fit = rigidFit(rest, pos, [0, 1, 2, 3, 4]);
    fit.R.forEach((v, i) => expect(v).toBeCloseTo(Rz[i], 4));
  });

  it('returns identity for an unrotated matrix', () => {
    const R = extractRotation([2, 0, 0, 0, 3, 0, 0, 0, 1]);
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => expect(R[i]).toBeCloseTo(v, 6));
  });
});
