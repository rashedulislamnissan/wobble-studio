/**
 * Background tint system (CLAUDE.md §8).
 *
 * Given an object's dominant colour, derive a stage palette where the object, its shadow
 * and its edges stand out: complementary hue, lightness chosen *against* the object,
 * a richer same-hue shadow, a lighter spotlight halo, and a contrast guard.
 */
import {
  contrastRatio,
  hexToOklch,
  normalizeHue,
  oklchToHex,
  type Oklch,
} from './oklch';

export interface TintInput {
  /** Dominant colour of the selected variant. */
  base: string;
  /** Darkest and lightest visible parts (translucent jelly, two-tone objects). */
  darkest?: string;
  lightest?: string;
  /** Hue used when the object is (nearly) grey and has no meaningful complement. */
  neutralHue?: number;
}

export interface TintOverride {
  background?: string;
  shadow?: string;
  /** Hue override in degrees; lightness/chroma rules still apply. */
  hue?: number;
}

export interface Tint {
  background: string;
  spotlight: string;
  shadow: string;
  /** Non-text UI accents: selected ring, slider fill, focus ring. AA 3:1 against background. */
  accent: string;
  /** Hairline/border colour: background hue, low contrast. */
  hairline: string;
  /** Muted label colour, AA 4.5:1 against background. */
  label: string;
  /** Debug: the object/background contrast that the guard settled on. */
  contrast: number;
}

/** Tuned constants (see §8). */
export const TINT = {
  /** Object chroma below which we treat it as grey. */
  achromaticChroma: 0.035,
  defaultNeutralHue: 235,
  /** Object lightness band where we blend from "light bg" to "mid-light bg". */
  paleFrom: 0.78,
  paleTo: 0.88,
  lightBg: { l: 0.915, c: 0.03 },
  paleBg: { l: 0.815, c: 0.055 },
  shadow: { l: 0.56, c: 0.085 },
  spotlightLift: 0.05,
  spotlightChromaScale: 0.6,
  /** Muddy olive band: pleasant at very light L, muddy at mid-light. */
  muddy: { from: 82, to: 112, escapeLow: 70, escapeHigh: 128 },
  minObjectContrast: 1.6,
  guardStep: 0.005,
  maxBgL: 0.965,
  /** Deepest stage we allow; keeps body text comfortably above AA. */
  minBgL: 0.72,
  accentMinContrast: 3,
  labelMinContrast: 4.5,
} as const;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Complementary hue, with a nudge out of the muddy olive band. */
export function backgroundHue(object: Oklch, neutralHue: number = TINT.defaultNeutralHue): number {
  if (object.c < TINT.achromaticChroma) return neutralHue;
  const h = normalizeHue(object.h + 180);
  const { from, to, escapeLow, escapeHigh } = TINT.muddy;
  if (h > from && h < to) return h < (from + to) / 2 ? escapeLow : escapeHigh;
  return h;
}

/**
 * Contrast guard: search background lightness within [minBgL, maxBgL] for the value closest
 * to the ideal that passes. Mid-lightness objects (pastel pinks, yellows) cannot always reach
 * the luminance threshold inside a pleasant range; then the hue contrast carries the
 * separation and we take the most contrasting lightness available.
 */
function guardLightness(color: Oklch, score: (hex: string) => number): Oklch {
  if (score(oklchToHex(color)) >= TINT.minObjectContrast) return color;
  let best: Oklch | null = null;
  let bestDist = Infinity;
  let fallback = color;
  let fallbackScore = -Infinity;
  for (let l = TINT.minBgL; l <= TINT.maxBgL + 1e-9; l += TINT.guardStep) {
    const candidate = { ...color, l };
    const s = score(oklchToHex(candidate));
    const dist = Math.abs(l - color.l);
    if (s >= TINT.minObjectContrast && dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
    if (s > fallbackScore) {
      fallback = candidate;
      fallbackScore = s;
    }
  }
  return best ?? fallback;
}

/** Darken (or lighten) a same-hue colour until it reaches `min` contrast against `against`. */
function ensureContrast(color: Oklch, against: string, min: number): Oklch {
  let c = { ...color };
  const againstL = hexToOklch(against).l;
  const dir = c.l < againstL ? -1 : 1;
  for (let i = 0; i < 60 && contrastRatio(oklchToHex(c), against) < min; i++) {
    c = { ...c, l: Math.min(1, Math.max(0, c.l + dir * 0.01)) };
  }
  return c;
}

export function computeTint(input: TintInput, override?: TintOverride): Tint {
  const object = hexToOklch(input.base);
  const hue = override?.hue ?? backgroundHue(object, input.neutralHue);

  // Lightness against the object: pale objects get a deeper, richer stage.
  const pale = smoothstep(TINT.paleFrom, TINT.paleTo, object.l);
  let bg: Oklch = {
    l: TINT.lightBg.l + (TINT.paleBg.l - TINT.lightBg.l) * pale,
    c: TINT.lightBg.c + (TINT.paleBg.c - TINT.lightBg.c) * pale,
    h: hue,
  };

  // Contrast guard against every visible extreme of the object.
  const samples = [input.base, input.darkest, input.lightest].filter((s): s is string => !!s);
  const score = (bgHex: string) => Math.min(...samples.map((s) => contrastRatio(s, bgHex)));
  bg = guardLightness(bg, score);

  let background = oklchToHex(bg);
  if (override?.background) background = override.background;
  const bgOk = hexToOklch(background);

  const shadow =
    override?.shadow ?? oklchToHex({ l: TINT.shadow.l, c: TINT.shadow.c, h: bgOk.h || hue });
  const spotlight = oklchToHex({
    l: Math.min(0.985, bgOk.l + TINT.spotlightLift),
    c: bgOk.c * TINT.spotlightChromaScale,
    h: bgOk.h || hue,
  });
  const accent = oklchToHex(
    ensureContrast({ l: 0.5, c: 0.1, h: bgOk.h || hue }, background, TINT.accentMinContrast),
  );
  const label = oklchToHex(
    ensureContrast({ l: 0.46, c: 0.025, h: bgOk.h || hue }, background, TINT.labelMinContrast),
  );
  const hairline = oklchToHex({ l: Math.max(0, bgOk.l - 0.14), c: bgOk.c * 1.2, h: bgOk.h || hue });

  return {
    background,
    spotlight,
    shadow,
    accent,
    hairline,
    label,
    contrast: Math.min(...samples.map((s) => contrastRatio(s, background))),
  };
}
