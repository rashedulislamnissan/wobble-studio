import { describe, expect, it } from 'vitest';
import { buildLatticeTetMesh, tetVolume } from '../src/sim/lattice';
import { SoftBody } from '../src/sim/softbody';
import { embedPoints, skinPoints } from '../src/sim/embed';

const R = 0.5;
// A slightly flattened blob, like the dev object: sits still instead of rolling like a ball.
const sphere = (x: number, y: number, z: number) => Math.hypot(x, y * 1.15, z) - R;

function makeBody(stiffness = 40) {
  const mesh = buildLatticeTetMesh(sphere, [-R, -R, -R], [R, R, R], (2 * R) / 10);
  const body = new SoftBody(mesh, { stiffness, bulk: Infinity, damping: 10, density: 1 });
  return { mesh, body };
}

describe('lattice tet mesh', () => {
  it('produces positively oriented tets whose volume approximates the shape', () => {
    const { mesh } = makeBody();
    let total = 0;
    for (let t = 0; t < mesh.tets.length; t += 4) {
      const v = tetVolume(mesh.positions, mesh.tets[t], mesh.tets[t + 1], mesh.tets[t + 2], mesh.tets[t + 3]);
      expect(v).toBeGreaterThan(0);
      total += v;
    }
    const sphereVol = (4 / 3) * Math.PI * R ** 3;
    expect(total / sphereVol).toBeGreaterThan(0.8);
    expect(total / sphereVol).toBeLessThan(1.5);
  });

  it('embeds surface points with near-exact rest reconstruction', () => {
    const { mesh } = makeBody();
    const pts = new Float32Array([R, 0, 0, 0, R, 0, 0, 0, -R, 0.3, 0.3, 0.3]);
    const emb = embedPoints(pts, mesh);
    const out = new Float32Array(pts.length);
    skinPoints(emb, mesh.tets, mesh.positions, out);
    for (let i = 0; i < pts.length; i++) expect(out[i]).toBeCloseTo(pts[i], 4);
  });
});

describe('XPBD soft body', () => {
  it('falls, lands on the floor, settles, and preserves volume', () => {
    const { body } = makeBody();
    body.translate(0, 1.5, 0);
    const dt = 1 / 60;
    for (let f = 0; f < 60 * 6; f++) body.step(dt);
    let minY = Infinity;
    for (let i = 0; i < body.count; i++) minY = Math.min(minY, body.pos[i * 3 + 1]);
    expect(minY).toBeGreaterThanOrEqual(-1e-4);
    expect(body.kineticEnergy()).toBeLessThan(1e-3);
    const ratio = body.currentVolume() / body.totalRestVolume;
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
    for (const v of body.pos) expect(Number.isFinite(v)).toBe(true);
  });

  it('stays stable under a violent grab-and-fling', () => {
    const { body } = makeBody(20);
    body.translate(0, 0.5, 0);
    const dt = 1 / 60;
    body.beginGrab([0, 1.0, 0], 0.3, 2e-5);
    for (let f = 0; f < 30; f++) {
      body.moveGrab([Math.sin(f) * 2, 1.5 + Math.cos(f * 1.7), 0]);
      body.step(dt);
    }
    body.endGrab();
    for (let f = 0; f < 60 * 8; f++) body.step(dt);
    for (const v of body.pos) expect(Number.isFinite(v)).toBe(true);
    const ratio = body.currentVolume() / body.totalRestVolume;
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
  });

  it('keeps tossed momentum through internal damping', () => {
    const { body } = makeBody();
    body.translate(0, 1.2, 0);
    for (let i = 0; i < body.count; i++) body.vel[i * 3] = 2;
    body.step(1 / 60);
    let vx = 0;
    let m = 0;
    for (let i = 0; i < body.count; i++) {
      vx += body.vel[i * 3] * body.mass[i];
      m += body.mass[i];
    }
    expect(vx / m).toBeGreaterThan(1.9);
  });
});
