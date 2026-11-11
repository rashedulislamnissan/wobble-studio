# Credits

Every external asset used by Wobble Studio, with its licence. Assets generated in code (meshes,
synthesised sounds) are original and not listed.

## Code libraries

| Name | Author | Source | Licence |
|---|---|---|---|
| three.js | three.js authors | https://github.com/mrdoob/three.js | MIT |
| Vite | Evan You and contributors | https://github.com/vitejs/vite | MIT |

## Fonts (self-hosted via @fontsource)

| Name | Author | Source | Licence |
|---|---|---|---|
| Cormorant Garamond | Christian Thalmann (Catharsis Fonts) | https://github.com/CatharsisFonts/Cormorant | SIL Open Font License 1.1 |
| IBM Plex Sans | IBM | https://github.com/IBM/plex | SIL Open Font License 1.1 |
| IBM Plex Mono | IBM | https://github.com/IBM/plex | SIL Open Font License 1.1 |

## Models

None. All 20 objects are generated in code from signed distance functions (`src/objects/shapes`).
Puffy is an original character designed for this project.

## Textures

None. Surface colour and relief (peel dimples, crumb pores, juice cells, crust) are procedural.

## Lighting

| Name | Author | Source | Licence |
|---|---|---|---|
| Studio Small 09 (HDRI, downsampled to 512×256 by `scripts/prep-hdri.mjs`) | Sergej Majboroda | https://polyhaven.com/a/studio_small_09 | CC0 |

## Sounds

None. All sounds are synthesised at runtime with the Web Audio API (`src/audio/recipes.ts`).

## Images

`public/og.png`, `public/apple-touch-icon.png` and `public/thumbs/*` are renders of this
project, made with `scripts/thumbs.mjs` and the dev tools.

## Development tools (not shipped)

| Name | Author | Source | Licence |
|---|---|---|---|
| TypeScript | Microsoft | https://github.com/microsoft/TypeScript | Apache-2.0 |
| Vitest | Vitest contributors | https://github.com/vitest-dev/vitest | MIT |
| ESLint, typescript-eslint | OpenJS / contributors | https://github.com/eslint/eslint | MIT |
| Prettier | Prettier contributors | https://github.com/prettier/prettier | MIT |
| playwright-core | Microsoft | https://github.com/microsoft/playwright | Apache-2.0 |

Licence audit (2026-11-11): every shipped dependency is MIT (three.js) or SIL OFL 1.1
(fonts, self-hosted); the one image asset (the studio HDRI) is CC0. No third-party models,
textures or sounds are shipped.
