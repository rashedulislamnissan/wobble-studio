/**
 * Headless probe for solver tuning: prints settle behaviour and per-frame cost.
 * Run: npx vite-node scripts/sim-probe.ts  (or via vitest's runner: npx tsx)
 */
import { buildLatticeTetMesh } from '../src/sim/lattice';
import { SoftBody } from '../src/sim/softbody';

const R = 0.5;
const sphere = (x: number, y: number, z: number) => Math.hypot(x, y * Number(process.env.FLAT ?? 1.15), z) - R;
const res = Number(process.argv[2] ?? 10);
const substeps = Number(process.argv[3] ?? 14);
const mesh = buildLatticeTetMesh(sphere, [-R, -R, -R], [R, R, R], (2 * R) / res);
const body = new SoftBody(mesh, { stiffness: Number(process.env.STIFF ?? 40), bulk: Infinity, damping: Number(process.env.DAMP ?? 2), density: 1 });
body.substeps = substeps;
body.translate(0, 1.2, 0);
console.log(`res ${res}: particles ${body.count}, tets ${mesh.tets.length / 4}, edges ${mesh.edges.length / 2}`);
const t0 = performance.now();
const com = new Float32Array(3);
for (let f = 0; f < 600; f++) {
  body.step(1 / 60);
  if (f % 60 === 59) {
    body.centerOfMass(com);
    console.log(
      `t=${((f + 1) / 60).toFixed(0)}s KE=${body.kineticEnergy().toExponential(2)} com=(${[...com].map((v) => v.toFixed(3)).join(',')}) vol=${(body.currentVolume() / body.totalRestVolume).toFixed(4)}`,
    );
  }
}
console.log(`ms/frame: ${((performance.now() - t0) / 600).toFixed(2)}`);
