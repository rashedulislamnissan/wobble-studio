# CLAUDE.md — Wobble Studio

> Read this file fully before writing any code. Re-read the relevant section before starting each phase.
> A companion file, `Wobble-Studio-Blueprint.pdf`, holds the visual layout and the full object/tool tables.

---

## 1. What we are building

**Wobble Studio** is a playable 3D website: soft objects (jelly animals, fruit, cakes, cheese, chocolate…) that you can drag, poke, squish, toss, and **cut with tools**. Each object belongs to a **material** that decides how it feels, looks, sounds, and breaks. A cake crumbles and thuds. An apple is crisp and crunches. Jelly wobbles and squelches. A mochi stretches.

- **20 objects**, one on stage at a time, chosen from a selector bar along the **top** of the page.
- **Tools and controls** live in a floating panel on the **right**.
- The **background tint changes with every object** so the object and its shadow always stand out.
- Tone: calm, tactile, editorial, quietly delightful. Not a game UI. Not a toy-store UI.

Design inspiration: two reference videos (a jelly dolphin and a cuttable citrus slice) with a quiet studio background, an italic serif title, a small floating "specimen" panel, a live stats row, and a "WebGPU · LIVE" badge. Use them as **inspiration for feel and structure only**. Write our own copy, names, and visuals. Do not copy their wording or branding.

**Owner:** Rashedul Islam Nissan. Hosting budget is **$0** (static hosting only, no backend, no paid services).

---

## 2. Tech stack (decided — do not change without asking)

| Area | Choice |
|---|---|
| Build | Vite + TypeScript (strict mode) |
| 3D | Three.js. Use `WebGPURenderer` when available, automatic **WebGL2 fallback** (many phones lack WebGPU) |
| Physics | **Our own soft-body solver** (XPBD). GPU compute via WebGPU/TSL where available; **CPU fallback** at reduced resolution |
| UI | Plain TypeScript + DOM + CSS (custom properties). No React, no UI framework |
| Audio | Web Audio API: synthesis first, small CC0 samples second |
| Fonts | Self-hosted via `@fontsource/*` packages (no Google Fonts CDN) |
| Hosting | Static build → Cloudflare Pages or GitHub Pages |
| Tests | Vitest for pure logic (tint maths, cutting topology, material tables). Browser checks are manual per the checklist in §14 |

**Dependencies:** keep them minimal. Ask the owner before adding anything heavy (physics engines, UI kits, big libraries). Three.js, Vite, TypeScript, Vitest, fontsource, and a mesh-decimation tool for the asset script are pre-approved.

### Fonts
- Titles and captions: an elegant **italic serif** (suggested: `Cormorant Garamond` or `EB Garamond`, italic).
- Labels: small, **tracked, uppercase** sans (suggested: `Inter` or `IBM Plex Sans`).
- Numbers/stats: **monospace** (suggested: `IBM Plex Mono` or `JetBrains Mono`).

---

## 3. How to work (rules for Claude Code)

1. **Work in phases** (§4). Before each phase write a 5–10 line plan. After it, run the build and the checklist in §14, then commit.
2. **Do not start the next phase until the current phase's acceptance criteria pass.**
3. **Make the feel right first.** A single blob that feels great beats 20 objects that feel dead. Spend real effort on damping, stiffness, drag response, and sound.
4. **Test in a real browser** (Playwright or the dev server plus screenshots). Check desktop **and** a phone-size viewport. Do not claim something works because it compiles.
5. **Licensing is a hard rule.** Never use an asset without checking its license. Log every external asset in `CREDITS.md` (name, author, source URL, license). Allowed: **CC0**, or licenses explicitly permitting free commercial use with a credit we then add. **Not allowed:** non-commercial, unclear, or fan-made models of copyrighted characters.
6. **No copyrighted characters.** The "Puff" is an **original** character (see §6). Do not create or import Pokémon, Disney, Nintendo, or any other franchise characters.
7. **Ask before** adding paid services, accounts, analytics, or heavy dependencies.
8. **Small commits**, clear messages. Keep `README.md` updated with how to run, build, and deploy.
9. If an approach is not working after two serious attempts, stop and explain the problem and options to the owner instead of piling on hacks.

---

## 4. Build phases and acceptance criteria

### Phase 0 — Setup
Vite + TS repo, folder structure (§12), fonts, lint/format, `CREDITS.md`, `README.md`, CI or a deploy script.
**Done when:** `npm run dev` shows an empty styled stage; `npm run build` passes.

### Phase 1 — Physics spike (hidden dev object)
Build a plain **jelly sphere/blob** reachable only at `?dev=blob` (not in the selector). Implement the XPBD soft-body solver, pointer drag, release-and-wobble, tossing against a floor, and the CPU + GPU paths.
**Done when:** drag/release feels like real jelly (visible secondary wobble that settles), stable (no explosions or jitter), **60 fps desktop**, **≥30 fps on a mid-range phone**.
> Spike decision: pick the soft-body representation (tetrahedral mesh vs. interior lattice with a skinned render mesh). Write the choice and the reasoning in `docs/decisions.md`. Prefer whichever makes **cutting** (Phase 4) easiest.

### Phase 2 — Stage, jelly look, and UI shell
Stage lighting, soft floor glow, tinted contact shadow, the **jelly material** (`MeshPhysicalMaterial` with transmission/thickness/roughness or the node-material equivalent), the **tint system** (§8), and the full UI shell: top selector bar, title block, right panel, bottom-left stats, status badge.
**Done when:** the dev blob sits on a tinted stage with a clear shadow; the UI matches §7 on desktop and phone; light/dark of the page is not required (single light theme).

### Phase 3 — Materials, audio, basic tools, first 5 objects
Material system (§5), audio engine (§9), tools **Hand**, **Poke**, **Press**, **Nudge** (§6). Objects: **Dolphin, Orange slice, Apple, Cake, Pudding**.
**Done when:** each of the five is instantly distinguishable by feel **and** sound with eyes closed; the panel adapts per material.

### Phase 4 — Cutting
Implement cutting (§10): **Knife**, **Wavy knife**, **Cutter** (star/heart/flower/round stamps), **Fork**, **Spoon**, **Hammer**. Pieces separate and keep wobbling; the **Pieces** counter updates; particles (crumbs, juice) spawn.
**Done when:** the orange slice, apple, cake, pudding, and dolphin can be cut cleanly without physics blowing up, and pieces can be dragged around.

### Phase 5 — Remaining objects (to 20)
Add the other 15 objects via the object registry (§6). Each new object should be mostly **data** (mesh + material id + tint + variants), not new engine code.
**Done when:** all 20 load, play, and match their material rules.

### Phase 6 — Polish and launch
Loading states, mobile bottom-sheet panel, keyboard and screen-reader support, reduced-motion mode, performance auto-quality, screenshot/share button, meta tags and social card, favicon, error and no-WebGL fallback page, final licensing audit, deploy.
**Done when:** every item in §14 passes.

---

## 5. Material system

Every object references a **material id**. Materials are data (`src/materials/*.ts`), not scattered `if` statements.

| Material | Feel | Stiffness | Damping | Cut behaviour | Break/particles | Sound set |
|---|---|---|---|---|---|---|
| `jelly` | Very wobbly, translucent, glossy | low | low–mid (lively) | Clean, soft, rippled faces possible | tiny shimmer | squish, boing, wet slice |
| `fruit-crisp` (apple) | Firm, slight give, snappy | high | mid | Clean slice, crisp resistance | juice mist, small chips | crunch, snap, wet slice |
| `fruit-juicy` (orange, watermelon, tomato) | Plump, taut skin, juicy | mid | mid | Clean slice; tomato bursts | juice droplets, pulp | squelch, juicy slice, splat |
| `sponge` (cake, bread, cupcake-style) | Soft, springy, crumbly | low–mid | high | Crumbles at edges | crumbs | soft thud, crumble, crumb patter |
| `cream` (pudding) | Jiggly, smooth, creamy | low | low–mid | Smooth, closes slowly | smear | wobble-pluck, spoon scoop |
| `mochi` | Stretchy, sticky, squashy | low | high | Stretches before it parts | powder puff | soft squeak, stretch creak, plop |
| `firm-dairy` (cheese) | Firm, smooth, slight spring | high | mid–high | Very clean slice | tiny shavings | dull thunk, smooth slice |
| `brittle` (chocolate) | Hard, almost no wobble | very high | high | **Snaps** along segment lines | shards, dust | sharp snap, crack |

Each material exposes the **panel controls** that make sense for it. All share **Firmness** and **Internal damping** sliders (with value readouts in monospace and soft end labels, e.g. "trembling ↔ set" and "lively ↔ syrupy"). Brittle disables damping.

Sound pitch/volume vary with **impact force**; never play the identical sample twice in a row (randomise pitch ±8%, pick from variants).

---

## 6. Objects (the 20) and how to get them

Each object is an entry in `src/objects/registry.ts`: `id`, display title, one-line description, material id, mesh source, variants (names + colours), default tint hue, special action(s), allowed tools.

**Display titles use the editorial pattern** (italic serif, trailing full stop): e.g. "Dolphin Jelly.", "Citrus.", "Puffy.".

| # | Object | Group | Material | Mesh source | Variants | Special action |
|---|---|---|---|---|---|---|
| 1 | Dolphin | Jelly | jelly | Import low-poly GLB (Quaternius or similar, CC0); else generate | Atlantic, Lagoon, Rose | Kick flukes, Blow |
| 2 | Gummy bear | Jelly | jelly | Generate (union of rounded shapes → smooth mesh) | Red, Green, Orange, Yellow | Bounce |
| 3 | Octopus | Jelly | jelly | Import GLB (CC0) or generate | Plum, Coral, Mint | Wiggle arms |
| 4 | Duck | Jelly | jelly | Import GLB (CC0) or generate | Lemon, Peach | Squeak |
| 5 | Star | Jelly | jelly | Generate (extruded, beveled) | Gold, Sky, Berry | Spin |
| 6 | Heart | Jelly | jelly | Generate (extruded, beveled) | Rose, Ruby, Blush | Heartbeat pulse |
| 7 | Axolotl | Jelly | jelly | Generate (body + tail + 6 gill fronds, each wobbly) | Pink, Mint, Gold | Wiggle gills |
| 8 | Penguin | Jelly | jelly | Import GLB (CC0) or generate chubby version | Classic, Ice, Sunset | Waddle |
| 9 | **Puffy** (original) | Jelly | jelly | Generate | Cotton pink, Lavender, Peach | Puff up (inflate) |
| 10 | Orange slice | Fruit | fruit-juicy | Generate (half-disc, segment wedges, rind) | Orange, Blood orange, Lemon | Cutter stamps |
| 11 | Apple | Fruit | fruit-crisp | Import (Kenney Food Kit) or generate (lathe + stem) | Red, Green, Gold | Bite crunch |
| 12 | Watermelon | Fruit | fruit-juicy | Generate (half or wedge with rind, flesh, seeds) | Classic, Yellow | Seed pop |
| 13 | Tomato | Fruit | fruit-juicy | Import or generate | Red, Yellow | Burst on hard press |
| 14 | Cake | Soft | sponge | Import slice (Kenney Food Kit) or generate layered slice | Vanilla, Chocolate, Strawberry | Crumble |
| 15 | Bread | Soft | sponge | Import (Kenney Food Kit) or generate | White, Wheat | Squish and spring back |
| 16 | Donut | Soft | sponge | Generate (torus + glaze + sprinkles) | Pink, Chocolate, Vanilla | Sprinkle burst |
| 17 | Pudding | Soft | cream | Generate (lathe) with caramel top | Caramel, Chocolate, Matcha | Jiggle |
| 18 | Mochi | Soft | mochi | Generate (rounded blob with tiny face) | White, Pink, Green | Stretch |
| 19 | Cheese block | Firm | firm-dairy | Import or generate (wedge with holes) | Swiss, Cheddar | Slice |
| 20 | Chocolate bar | Firm | brittle | Generate (segmented squares) | Milk, Dark, Ruby | Snap |

> Groups map to the selector's top-bar labels: **Jelly (1–9), Fruit (10–13), Soft (14–18), Firm (19–20)**.

### Puffy — design brief (make it SUPER cute)
An **original** round pink puffball. Big soft sphere body, a small curly tuft on top, **huge sparkly glossy eyes** (large highlight dots), tiny pink **blush cheeks**, a very small smile, two tiny stubby feet. Texture: soft marshmallow-jelly, slightly translucent at the edges. Behaviour: puffs up when you press "Puff up" and slowly deflates; poking makes a tiny squeaky "puu". Must read as a distinct, original character with **no resemblance to any existing franchise mascot**.

### Getting assets
**Models**
1. Preferred sources: **Kenney** (Food Kit and others), **Quaternius**, **Poly Pizza** (check each model's license label), **Sketchfab** (downloadable + license check) as a last resort.
2. If no suitable CC0 model is found quickly, **generate the object in code** (lathe, extrude, SDF/metaball + marching cubes) instead of settling for a bad import.
3. Decimate any imported mesh over **~3,000 triangles**. Soft-body needs clean, closed, low-poly meshes.
4. Preprocess every model with a script in `/scripts` into the runtime format (render mesh + solver data). Cache the output in `/public/models`.

**Textures:** **ambientCG** and **Poly Haven** (CC0) for apple skin, bread crumb, sponge, cheese, chocolate. Jelly uses no texture, only the glossy translucent material. Compress textures (KTX2 or optimised WebP), keep each ≤ 1024px unless it clearly matters.

**Sounds:** synthesise squish, boing, squeak, and wobble with Web Audio. Use **Kenney audio packs** and the **Freesound CC0 filter** for crunch, thud, crumble, snap, splash. Pixabay sound effects are free for commercial use but are **not CC0**; log them and verify the license text before using.

Every asset → a line in `CREDITS.md`. Run a licensing audit in Phase 6.

---

## 7. UI specification

### Layout (desktop)
```
┌──────────────────────────────────────────────────────────────────┐
│ Wobble Studio.   [Jelly ▸ 🐬 🧸 🐙 🦆 ⭐ ❤ 🦎 🐧 ☁] [Fruit ▸ …] [Soft ▸ …] [Firm ▸ …]  ♪ │  ← TOP BAR (selector)
├──────────────────────────────────────────────────────────────────┤
│ MATERIAL STUDIES / NO. 010                      ┌──────────────┐ │
│ Citrus                                          │ THE SPECIMEN │ │
│    Jelly.                                       │ fig. 10      │ │
│ one-line description                            │ TOOL …       │ │
│                                                 │ VARIETY …    │ │
│              ( 3D STAGE )                       │ FIRMNESS ──o │ │
│                                                 │ DAMPING  ──o │ │
│                                                 │ [Nudge][Reset]│ │
│ TOOL HINT (italic)                              │ ☐ ¼ speed    │ │
│ MASS | VOLUME | KINETIC | PIECES                │ ☐ Show mesh  │ │
│ footnote                          status badge  │ [Pause]      │ │
└──────────────────────────────────────────────────────────────────┘
```
(Exact positions are flexible; the structure and the quiet editorial feel are not.)

- **Top bar:** brand wordmark at left, then a **horizontally scrollable strip of 20 thumbnails** grouped by label (Jelly, Fruit, Soft, Firm). Selected item is clearly marked. Arrow keys move between items; Enter/Space selects. A **sound toggle** sits at the far right.
- **Title block (top-left, under the bar):** small tracked label ("MATERIAL STUDIES / NO. xx"), huge italic serif title with the **second line indented**, then a one-line description.
- **Right panel "The Specimen":** hairline border, translucent off-white fill with subtle blur, a "fig. xx" tag. Sections: **Tool**, **Colour/Variety**, **Firmness**, **Internal damping**, action buttons (object-specific plus **Give it a nudge** and **Reset**), checkboxes (**¼ speed**, **Show mesh**), **Pause**.
- **Bottom-left:** italic tool hint ("how to use this tool"), then a monospace **stats row**: **Mass** (g), **Volume** (% of rest), **Kinetic** (energy), **Pieces**. Tiny footnote under it. Stats are computed **live** from the simulation.
- **Status badge** (small, monospace): shows the active renderer ("WEBGPU · LIVE" or "WEBGL · LIVE") and fps.

### Mobile (< 768px)
- Top bar stays; thumbnails scroll sideways with snap.
- The panel becomes a **slide-up bottom sheet** (collapsed handle shows the active tool). The stage keeps at least 55% of the screen height.
- Touch: one finger drags/pokes/cuts (depending on tool); two fingers orbit/zoom the camera. Prevent page scroll and pull-to-refresh while interacting with the stage.

### Style tokens
Define in CSS custom properties: spacing scale, hairline (`1px`) borders at low-opacity ink, radius `2–6px` (sharp and editorial, not bubbly), ink colour near-black warm, muted label grey. Panel and text colours may take a faint hue from the current tint, but contrast must stay AA.

---

## 8. Background tint system (important)

**Goal:** each object gets its own background tint that makes the **object, its shadow, and its edges easy to see**.

Implementation (`src/tint/`), pure functions, unit-tested:

1. Get the object's **dominant colour** (from the selected variant). Convert to **OKLCH**.
2. **Hue:** background hue = object hue + 180° (complementary), then nudge toward a pleasant range if the result is muddy.
3. **Lightness is chosen against the object's lightness** so pale objects never vanish on pale backgrounds:
   - If object lightness is **high** (cheese, mochi, bread, vanilla, white variants): use a **mid-light, more saturated** background (L ≈ 0.78–0.84, C ≈ 0.04–0.06).
   - If object lightness is **mid/low**: use a **very light, low-saturation** background (L ≈ 0.90–0.93, C ≈ 0.02–0.035).
4. **Shadow colour** = same hue as the background, **darker and richer** (L ≈ 0.50–0.60, C ≈ 0.07–0.10), applied with multiply. Never plain grey or black.
5. **Spotlight glow:** a soft radial lighter halo behind the object (L +0.04–0.06) to separate edges. Add a gentle **rim light** on the object.
6. **Contrast guard:** compute the luminance contrast between the object's average colour and the background; if it falls below the threshold (≥ ~1.6:1 for large shapes, tune by eye), shift background lightness until it passes. Translucent jelly needs extra care: check against the **darkest and lightest** parts of the object.
7. **Transition:** crossfade background, shadow, and panel accents over **~600 ms** when the object or its variant changes.
8. The tint also applies faintly to panel borders, labels, and the selected thumbnail ring, never to body text (keep text near-black for readability).

Provide a **hand-tuned override** per object in the registry (`tintOverride`) so the owner can fine-tune any that look off. Include a dev page `?dev=tints` showing all 20 objects × variants on their tints side by side.

---

## 9. Audio

- `src/audio/engine.ts`: one `AudioContext`, master gain, compressor, per-material sound banks.
- **Start muted** until the first user gesture (browser autoplay rules); show a clear sound toggle, remember the choice in `localStorage`.
- **Synthesis recipes** (starting points): squish = band-passed noise + falling sine; boing = decaying sine with slight FM and downward pitch bend; squeak = short rising/falling triangle with vibrato; wobble-pluck = damped resonant tone tied to current wobble energy.
- **Samples:** small `.ogg`/`.mp3` files, lazy-loaded per material, total initial audio **< 500 KB**.
- Sound parameters come from **impact speed, contact area, and material**. Rate-limit overlapping sounds so rapid poking never turns into noise.
- Respect `prefers-reduced-motion` (reduce screen shake/particles, not audio) and provide a separate mute.

---

## 10. Tools and cutting

### Tool availability

| Tool | Jelly | Fruit | Soft/Cream/Mochi | Firm |
|---|---|---|---|---|
| Hand (drag/toss) | ✓ | ✓ | ✓ | ✓ |
| Poke (finger) | ✓ | ✓ | ✓ | ✓ |
| Press (squish plate) | ✓ | ✓ | ✓ | ✓ |
| Knife | ✓ | ✓ | ✓ | ✓ |
| Wavy knife | ✓ | ✓ | ✓ | — |
| Cutter (star/heart/flower/round stamps) | ✓ | ✓ (orange, watermelon) | ✓ (cake, bread) | — |
| Fork (pierce) | — | ✓ | ✓ | ✓ (cheese) |
| Spoon (scoop) | — | ✓ (watermelon) | ✓ (pudding, cake, mochi) | — |
| Hammer | — | ✓ (apple, tomato, watermelon) | — | ✓ (chocolate) |

Each tool has: an on-stage **cursor/3D tool model**, a one-line **hint** in the bottom-left, and a sound mapping per material.

### Cutting approach (build in this order)
1. **Level 1 — pre-segmented chunks (ship first):** objects are built from pre-split internal regions held together by breakable links. When the knife's swept plane crosses links, they break and the pieces separate and keep wobbling. Looks convincing, runs fast, safe on phones.
2. **Level 2 — constraint cutting:** break solver constraints (springs/tetrahedra) crossing the tool's swept surface, then **re-skin or re-cap** the cut faces so surfaces look closed (inner flesh colour/texture on cut faces: orange flesh, cake sponge, cheese interior).
3. **Level 3 (optional, only if Level 2 is stable and fast):** true mesh slicing along arbitrary paths.

Rules:
- The knife **presses down** along the drawn line (like the reference), it is not a free-swinging blade.
- **Wavy knife** leaves rippled faces. **Cutter** stamps a shape (star/heart/flower/round) and releases that piece.
- **Pieces counter** and **mass/volume stats** must stay correct after cuts (volume = % of the original rest volume).
- Cap the number of pieces (e.g. 24) and merge or fade tiny shards to keep performance steady.
- Brittle (chocolate) never "cuts": it **snaps along its segment lines** (hammer or knife pressure), with shard particles.

---

## 11. Performance and compatibility

- Targets: **60 fps desktop**, **≥30 fps mid-range phone**. Add an **auto-quality governor** that lowers solver iterations, particle count, shadow resolution, and render scale when frame time stays high.
- Load **one object at a time**; lazy-load models, textures, and audio; dispose previous GPU resources on switch.
- Initial JS+CSS **< 400 KB gzipped** (excluding Three.js chunk), first interactive object in **< 3 s** on a decent connection. Show a calm loading state.
- Use `requestAnimationFrame` with a fixed physics timestep (sub-stepped) so behaviour is the same at any display refresh rate.
- No WebGL at all → show a friendly static fallback page with a message, not a blank screen.
- Test in: latest Chrome, Safari (iOS), Firefox, and a low-end Android phone if possible.

---

## 12. Project structure

```
wobble-studio/
├─ CLAUDE.md
├─ CREDITS.md
├─ README.md
├─ docs/decisions.md
├─ scripts/                 # asset preprocessing (decimate, cage/tet build, texture compress)
├─ public/
│  ├─ models/               # preprocessed runtime models
│  ├─ textures/
│  └─ audio/
├─ src/
│  ├─ main.ts
│  ├─ app/                  # app shell, state, routing of ?dev params
│  ├─ sim/                  # XPBD solver, cutting topology, collisions
│  ├─ render/               # renderer setup (WebGPU/WebGL), materials, stage, lights, shadow
│  ├─ materials/            # material definitions (data)
│  ├─ objects/              # registry + procedural generators
│  ├─ tools/                # tool classes + 3D tool models
│  ├─ tint/                 # OKLCH tint maths (unit-tested)
│  ├─ audio/                # engine + synth recipes + sample banks
│  ├─ ui/                   # top bar, title block, panel, stats, bottom sheet
│  └─ styles/               # tokens.css, layout.css, components.css
└─ tests/
```

Conventions: strict TypeScript, small modules, no giant files, no magic numbers (name them in config), comments only where the *why* isn't obvious.

---

## 13. Accessibility and quality

- Keyboard: selector (arrow keys/Enter), panel controls fully operable, visible focus rings.
- Screen reader: label every control; announce object changes (`aria-live="polite"`).
- `prefers-reduced-motion`: lower particle counts, disable idle auto-motion, keep core interaction.
- Text contrast AA on every tint. No information conveyed by colour alone.
- Never auto-play sound. Never flash rapidly.

---

## 14. Definition of done (checklist)

- [ ] All 20 objects load, play, and match their material rules
- [ ] Every tool works on the objects it is allowed on; disallowed tools are hidden, not broken
- [ ] Cutting is stable; pieces counter and stats stay correct
- [ ] Each object and variant has a tint where object, shadow, and edges are clearly visible (check `?dev=tints`)
- [ ] Sounds are distinct per material and never harsh or repetitive
- [ ] Top selector, right panel, bottom-left stats, and badge match §7 on desktop and phone
- [ ] 60 fps desktop, ≥30 fps mid-range phone, auto-quality works
- [ ] WebGPU path and WebGL fallback both work; no-WebGL page exists
- [ ] Keyboard and screen-reader pass; reduced-motion supported
- [ ] `CREDITS.md` complete; every asset license verified; no franchise characters
- [ ] `README.md` explains run, build, deploy
- [ ] Deployed on a free static host

---

## 15. Open questions to raise with the owner (do not guess)

1. Final site tagline and the exact description line per object.
2. Whether to add a screenshot/share button in Phase 6 or leave it for later.
3. Domain name, if any (free subdomain is fine to start).
4. Whether to add more objects after the first 20 (the registry is built to make this easy).
