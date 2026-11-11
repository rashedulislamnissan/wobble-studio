# Wobble Studio

*Soft things, made playable.* A 3D website of jelly, fruit and food you can drag, poke, squish
and cut — each with its own feel, look and sound.

Built with Vite, TypeScript, Three.js (WebGPU with WebGL2 fallback) and a custom XPBD soft-body
solver. No backend, no paid services.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
```

Useful URLs while developing:

| URL | What |
|---|---|
| `/` | The studio |
| `/?dev=blob` | Physics spike: plain jelly blob for tuning feel |
| `/?dev=tints` | Every object × variant on its computed background tint |
| `/?renderer=webgl` | Force the WebGL2 fallback |
| `/?object=<id>` | Open a specific object |

## Check

```bash
npm run test         # unit tests (tint maths, solver stability, material table)
npm run lint
npm run build        # type-check + production build into dist/
npm run check        # all three
```

Browser checks (uses your local Chrome via playwright-core; no browser download):

```bash
node scripts/shoot.mjs "http://localhost:5173/?dev=blob" screenshots/blob --drag
node scripts/shoot.mjs "http://localhost:5173/" screenshots/phone --phone
```

Other dev tools (dev server running):

```bash
node scripts/contact-sheet.mjs screenshots/sheet.png   # every object in one image
node scripts/thumbs.mjs                                  # re-render selector thumbnails
node scripts/bench-cut.mjs cake                          # time cuts in the live page
node scripts/cpu-profile-cut.mjs cake                    # CPU profile of a cut
```

Solver probe (headless settle + cost):

```bash
npx tsx scripts/sim-probe.ts 10 14   # lattice resolution, substeps
```

## Deploy (free)

**GitHub Pages** — push to `main` on GitHub. The workflow in `.github/workflows/deploy.yml`
builds and publishes automatically. One-time setup: repository *Settings → Pages → Source:
GitHub Actions*.

**Cloudflare Pages** (alternative, also free) — connect the repository, build command
`npm run build`, output directory `dist`, environment variable
`VITE_SITE_URL=https://<your-site>/` (used for social-card links).

## What is in it

- 20 objects in four families (Jelly, Fruit, Soft, Firm), all generated in code from signed
  distance functions: no downloaded models, nothing to license.
- Nine tools: Hand, Poke, Press, Knife, Wavy knife, Cutter (star, heart, flower, round),
  Fork, Spoon, Hammer. Cuts are real: pieces get exact cut faces with interior colours.
- Synthesised sound per material (Web Audio, no samples). Starts silent until you interact.
- Auto-quality: render scale, solver substeps, shadows and particles step down if the frame
  rate stays low.
- Save image: captures the stage with a caption (shares on phones, downloads on desktop).

## Project layout

See `CLAUDE.md` §12. Decisions and their reasoning live in `docs/decisions.md`; asset licences
in `CREDITS.md`.
