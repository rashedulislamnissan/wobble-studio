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
