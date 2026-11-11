# Decisions

A running log of technical decisions and the reasoning behind them. Newest last.

---

## D1 — Soft-body representation: voxel lattice → tetrahedra, with an embedded render mesh

**Date:** 2026-11-11 · **Phase:** 1 (spike)

**Choice.** Each object is voxelised from a signed distance function (SDF) into a regular cubic
lattice. Every occupied cube is split into **5 tetrahedra with alternating parity** (conforming
across neighbours). Particles live on lattice nodes. XPBD solves **edge** constraints
(stretch/shear) and **tet volume** constraints. A separate, smooth **render mesh** is embedded in
the tets with barycentric coordinates and follows the simulation exactly.

**Alternatives considered.**

| Option | Pros | Cons |
|---|---|---|
| Tet mesh from TetGen-style mesher on the render surface | Accurate boundary | Needs a heavy offline mesher; irregular elements; cutting must handle arbitrary tet topology |
| Interior lattice of springs + skinned mesh (no tets) | Very simple | No volume preservation without extra work; jelly "deflates" under squash |
| **Lattice → tets (chosen)** | One generator for every object (any SDF or voxelised mesh); uniform element quality = stable XPBD; volume constraints for free; **cells are natural cutting units** | Boundary is staircase inside the render mesh (hidden by the embedding) |

**Why it makes cutting (Phase 4) easiest.** Cells are a regular grid, so:

- **Level 1 (pre-segmented chunks):** assign each cell a chunk id (from the object's SDF regions
  or a Voronoi split). Links between chunks are just the lattice edges/tets that straddle a chunk
  boundary — break them and the pieces separate.
- **Level 2 (constraint cutting):** the knife's swept surface is tested against lattice edges;
  crossing cells are split by duplicating the shared nodes on each side. Because every cell has the
  same 5-tet pattern, re-indexing is table-driven, not a general remesh.
- Cut faces are capped by marching-cubes on each piece's occupancy (the lattice already *is* the
  voxel grid), coloured with the material's interior (orange flesh, cake sponge, cheese).

**Details worth knowing.**

- *Why 5-tet alternating instead of 6-tet Kuhn:* Kuhn gives every cell the same main diagonal, a
  global (1,1,1) anisotropy. In tests a symmetric drop drifted ~0.25 units sideways. The
  alternating 5-tet split removes it (drift < 0.005).
- *Constraint order is shuffled once* (seeded) to remove Gauss-Seidel sweep bias. Alternating the
  order each substep was tried and rejected: with one iteration per substep, residuals flip sign
  each substep and inject energy ("boiling").
- *Moduli, not raw compliance:* edge compliance = 1/(E·L), tet compliance = V₀/K. Feel stays the
  same when the auto-quality governor changes lattice resolution.
- *Damping:* along-edge relative velocity damping. Rigid translation/rotation have no along-edge
  component, so throws keep momentum, but squash against the floor (which a centre-of-mass
  rigid-motion damper cannot see) settles properly.
- *Render smoothing:* linear tets crease under large deformation, so the render mesh smooths its
  **displacement** field (3 Laplacian passes). The rest shape is untouched and rigid motion changes
  by ~h²·curvature (invisible).

---

## D2 — Solver runs on the CPU; GPU compute deferred

**Date:** 2026-11-11 · **Phase:** 1

The spec lists "GPU compute via WebGPU/TSL where available; CPU fallback". After the spike we run
the solver **on the CPU only** for now:

- **The CPU path is mandatory anyway.** WebGL2 has no compute shaders, and many phones lack
  WebGPU (the spec's own reason for the fallback). Most phone users will run the CPU path, so it
  has to be good. It is.
- **It is fast enough.** ~820 particles / 2,700 tets / 4,000 edges at 14 substeps costs ~3 ms per
  frame in V8 on desktop; the phone preset (8 cells across, 10 substeps) is roughly a quarter of
  that. Rendering, not physics, dominates the frame.
- **GPU XPBD needs graph colouring or Jacobi iterations**, both of which converge more slowly per
  constraint and would need more substeps for the same feel, and **every interaction (grab
  picking, stats, cutting, sound triggers) needs results back on the CPU**: a readback each frame,
  which adds latency and stalls.
- One solver means one feel to tune. Two diverging implementations would double the tuning work.

**Revisit if** an object needs >3k particles, or phone profiling shows physics above ~6 ms per
frame. The solver's data layout (flat typed arrays, independent constraint lists) maps directly to
storage buffers, so moving it to TSL compute later is a contained change.

---

## D3 — Jelly look is art-directed, not physical transmission

**Date:** 2026-11-11 · **Phase:** 1

Physical transmission (`MeshPhysicalMaterial.transmission`) was tried first. Against a flat studio
backdrop there is nothing behind the object to refract, so transmission only reads as murky or
milky plastic, and it costs an extra scene pass. The jelly material instead uses a saturated
body, a deeper core, light "escaping" through thin edges (view-angle term), a wet clearcoat, sheen
and environment highlights. It looks the same on WebGPU and WebGL and is cheaper.

---

## D4 — Free hosting: GitHub Pages via GitHub Actions

**Date:** 2026-11-11 · **Phase:** 0

Static build, relative asset base (`base: './'`) so the same output works on GitHub Pages
(sub-path) and Cloudflare Pages (root). GitHub Pages is free for public repositories, needs no
card, and deploys on every push to `main` through `.github/workflows/deploy.yml`. Cloudflare Pages
remains a drop-in alternative (also free, no card): build command `npm run build`, output `dist`.

---

## D5 — Cutting: tet-labelled topology split + per-piece SDF remeshing

**Date:** 2026-11-11 · **Phase:** 4

The spec suggests building cutting in levels (pre-segmented chunks → constraint cutting →
true slicing). Because every object is an SDF on a tet lattice, we went straight to a robust
form of Level 2 with exact cut faces:

1. **Classify tets** by evaluating the cut field (plane, rippled plane, cutter prism, scoop
   sphere) at each tet's *current* centroid. Pieces whose tets fall on both sides split.
2. **Split topology** (`src/sim/topology.ts`): nodes shared by tets of different sides are
   duplicated; connected components become pieces (a cut through a ring leaves two arcs).
   Pure function, unit-tested; volume is conserved exactly.
3. **Exact faces:** each piece keeps a rest-space SDF = original shape ∩ every cut that made it.
   The world-space cut is mapped to rest space through the piece's best-fit rigid transform
   (shape matching, Müller 2016 rotation extraction). The piece is remeshed with surface nets,
   so the cap is perfectly flat (or rippled, or star-shaped). Cut faces get *interior* colour:
   colour functions receive `depth = -sdf(p)` and paint flesh, sponge layers or core there.
4. **Physics continues** on one solver: pieces collide through a spatial hash on nodes, with a
   capped push per substep so fresh seams ease apart instead of exploding.
5. **Housekeeping:** at most 24 pieces; slivers (< 10 tets a side) are not created; shards under
   1.2 % of the original volume fade out; scoops and bites fade upward. Mass and volume
   readouts track what is left.

**Cost.** A cut is a topology rebuild plus remeshing of the two new pieces: ~25–110 ms on a
desktop (embedding uses precomputed tet inverses and a capped neighbourhood search; the
mesher samples narrow-band). The knife's 0.26 s press animation masks most of it.
**Follow-up:** time-slice meshing across the press frames (generator-based mesher) so phones
never hitch.

---

## D6 — Solids and sponges: shape matching and plasticity; realism pass

**Date:** 2026-11-11 · **Owner feedback:** "fruit and cake shouldn't be like rubber".

- **Rigidity (shape matching, Müller 2005).** Each piece is pulled toward its best rigid fit
  every substep, with a per-frame strength per material (apple 0.85, cheese 0.85, chocolate
  0.96, juicy fruit 0.45, tomato 0.15, jelly 0). It runs after the grab, and solids get a
  wider, gentler grip, so they are carried whole and trail the hand slightly (weight) instead
  of stretching. Mean strain under a grab drops ~40x versus the pure soft body (tested).
- **Plasticity.** Strain beyond a yield fraction flows into the rest shape; a recovery rate
  creeps it back. Cake keeps a dent (recover 0.12/s), bread springs back (0.8/s), mochi holds a
  stretch for a while. Reset restores the original rest shape.
- **Realism.** A real photographed studio (CC0 HDRI, 512 KB, lazy-loaded) replaces the
  procedural room for reflections. A per-vertex `surf` attribute gives each part of an object
  its own roughness, clearcoat and relief (waxy apple skin vs granular flesh, satin frosting vs
  porous sponge). Relief is procedural in rest space (Worley/value noise: peel dimples, juice
  cells, pores, crust) and shades through a screen-space bump normal; on wet surfaces the
  clearcoat follows the relief, on waxy ones it stays smooth.
- **Procedural over photo textures:** SDF meshes have no UVs; triplanar photo textures would
  cost ~0.5 MB per object and still tile visibly. Procedural detail is resolution-free, moves
  with the deformation and costs nothing to download.

---

## D7 — Food that behaves like food (second pass)

**Date:** 2026-11-11 · **Owner feedback:** "fruit and cake are still rubber".

Measured with `scripts/feel-test.mjs` (hold overshoot and drop rebounds in the live app), which
showed two rubbery behaviours the first pass missed:

1. **Springy grip.** A deliberately soft grip on solids made them trail the hand like a rubber
   band. Solids now get a firm grip (with a wider hold) and rigidity of 0.97–0.998: they follow
   the hand exactly (overshoot 0.000).
2. **Superball landings.** In position-based dynamics a near-rigid body turns the floor's
   push-out into upward velocity, so the "rigid" apple bounced five times. Solids now have
   restitution: on touchdown the landing speed is recorded and, while touching the floor, the
   piece may not rise faster than restitution × that speed (apple 0.15, citrus 0.08, cheese
   0.05, tomato 0.02, cake 0). Upward speed present at the start of a frame (Nudge, actions,
   tosses) is respected. Result: apple hops ~3 cm, cake/bread/tomato thud (~2 cm), cheese 0.
3. **Cake and bread tear.** Sponge holds its shape when moved gently but a yank tears the held
   chunk off (with crumbs); landing hard sheds crumbs; dents stay. Mochi stretches far before it
   would tear. The Firmness slider sets how much give a solid has.
