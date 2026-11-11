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

Solver probe (headless settle + cost):

```bash
npx tsx scripts/sim-probe.ts 10 14   # lattice resolution, substeps
```

## Deploy (free)

**GitHub Pages** — push to `main` on GitHub. The workflow in `.github/workflows/deploy.yml`
builds and publishes automatically. One-time setup: repository *Settings → Pages → Source:
GitHub Actions*.

**Cloudflare Pages** (alternative, also free) — connect the repository, build command
`npm run build`, output directory `dist`.

## Project layout

See `CLAUDE.md` §12. Decisions and their reasoning live in `docs/decisions.md`; asset licences
in `CREDITS.md`.
