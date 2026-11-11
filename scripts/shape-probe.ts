/** Headless settle probe for a registry shape: npx tsx scripts/shape-probe.ts <objectId> */
import { OBJECTS } from '../src/objects/registry';
import { getMaterial } from '../src/materials';
import { rangeValue } from '../src/materials/types';
import { buildLatticeTetMesh } from '../src/sim/lattice';
import { SoftBody } from '../src/sim/softbody';

const id = process.argv[2] ?? 'apple';
const def = OBJECTS.find((o) => o.id === id)!;
const shape = (await def.load())();
const m = getMaterial(def.material);
const mesh = buildLatticeTetMesh(shape.sdf, shape.bounds.min, shape.bounds.max, shape.size / 11, { inflate: shape.inflate });
const body = new SoftBody(mesh, {
  stiffness: Number(process.env.STIFF ?? rangeValue(m.stiffness, m.stiffness.default)),
  damping: Number(process.env.DAMP ?? rangeValue(m.damping, m.damping.default)),
  bulk: m.bulk,
  density: m.density,
});
let minY = Infinity;
for (let i = 1; i < body.rest.length; i += 3) minY = Math.min(minY, body.rest[i]);
body.floorY = minY;
body.translate(0, 0.5, 0);
const com = new Float32Array(3);
console.log(`${id}: particles ${body.count}, stiffness ${body.params.stiffness.toFixed(0)}, damping ${body.params.damping.toFixed(1)}`);
for (let f = 0; f < 360; f++) {
  body.step(1 / 60);
  if (f % 30 === 29) {
    body.centerOfMass(com);
    console.log(`t=${((f + 1) / 60).toFixed(1)} KE=${body.kineticEnergy().toExponential(2)} com=(${[...com].map((v) => v.toFixed(3)).join(',')}) vol=${(body.currentVolume() / body.totalRestVolume).toFixed(3)}`);
  }
}
