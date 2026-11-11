import { describe, expect, it } from 'vitest';
import { meshSdf } from '../src/objects/mesher';
import { roundBox, smoothUnion, sphere, torus } from '../src/objects/sdf';

function analyse(sdf: Parameters<typeof meshSdf>[0], min: [number, number, number], max: [number, number, number]) {
  const g = meshSdf(sdf, min, max, { resolution: 24 });
  const pos = g.getAttribute('position').array as Float32Array;
  const nrm = g.getAttribute('normal').array as Float32Array;
  const idx = g.index!.array;
  const edgeCount = new Map<string, number>();
  let outward = 0;
  let maxErr = 0;
  for (let f = 0; f < idx.length; f += 3) {
    const [a, b, c] = [idx[f], idx[f + 1], idx[f + 2]];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = u < v ? `${u}_${v}` : `${v}_${u}`;
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
    const e1 = [pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]];
    const e2 = [pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * nrm[a * 3] + n[1] * nrm[a * 3 + 1] + n[2] * nrm[a * 3 + 2] > 0) outward++;
  }
  for (let v = 0; v < pos.length; v += 3) maxErr = Math.max(maxErr, Math.abs(sdf(pos[v], pos[v + 1], pos[v + 2])));
  const open = [...edgeCount.values()].filter((n) => n !== 2).length;
  return { tris: idx.length / 3, outwardFrac: outward / (idx.length / 3), open, maxErr };
}

describe('surface nets mesher', () => {
  it('meshes a sphere closed, outward-facing and on the surface', () => {
    const r = analyse(sphere(0, 0, 0, 0.5), [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]);
    expect(r.tris).toBeGreaterThan(500);
    expect(r.open).toBe(0);
    expect(r.outwardFrac).toBeGreaterThan(0.99);
    expect(r.maxErr).toBeLessThan(0.005);
  });

  it('handles a torus (genus 1) and a blended compound shape', () => {
    const t = analyse(torus(0, 0, 0, 0.35, 0.15), [-0.5, -0.15, -0.5], [0.5, 0.15, 0.5]);
    expect(t.open).toBe(0);
    expect(t.outwardFrac).toBeGreaterThan(0.99);
    const c = analyse(
      smoothUnion(0.1, roundBox(0, 0, 0, 0.4, 0.2, 0.2, 0.05), sphere(0.3, 0.2, 0, 0.2)),
      [-0.4, -0.2, -0.2],
      [0.5, 0.4, 0.2],
    );
    expect(c.open).toBe(0);
    expect(c.outwardFrac).toBeGreaterThan(0.98);
  });
});
