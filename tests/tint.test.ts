import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  hexToOklch,
  oklchToHex,
  mixOklch,
} from '../src/tint/oklch';
import { backgroundHue, computeTint, TINT } from '../src/tint/tint';

const INK = '#1F1B18';

describe('oklch conversions', () => {
  it('round-trips sRGB hex through OKLCH', () => {
    for (const hex of ['#FF0000', '#00FF00', '#0000FF', '#F28A1E', '#2B3A67', '#FFFFFF', '#000000']) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    }
  });

  it('gives white L≈1 and black L≈0', () => {
    expect(hexToOklch('#FFFFFF').l).toBeCloseTo(1, 3);
    expect(hexToOklch('#000000').l).toBeCloseTo(0, 3);
  });

  it('maps out-of-gamut colours into gamut instead of clipping hue', () => {
    const hex = oklchToHex({ l: 0.7, c: 0.4, h: 150 });
    expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    const back = hexToOklch(hex);
    expect(Math.abs(back.h - 150)).toBeLessThan(4);
  });

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('mixes hue along the short arc', () => {
    const m = mixOklch({ l: 0.5, c: 0.1, h: 350 }, { l: 0.5, c: 0.1, h: 10 }, 0.5);
    expect(m.h === 0 || m.h === 360 || Math.abs(m.h) < 1e-9).toBe(true);
  });
});

describe('background tint', () => {
  it('uses the complementary hue', () => {
    const orange = hexToOklch('#F28A1E');
    const h = backgroundHue(orange);
    const diff = Math.abs(((h - orange.h + 540) % 360) - 180);
    // Either complementary or nudged out of the muddy band.
    expect(diff < 1 || (h >= TINT.muddy.escapeHigh || h <= TINT.muddy.escapeLow)).toBe(true);
  });

  it('falls back to a neutral hue for grey or white objects', () => {
    expect(backgroundHue(hexToOklch('#F7F4EE'))).toBe(TINT.defaultNeutralHue);
    expect(backgroundHue(hexToOklch('#F7F4EE'), 160)).toBe(160);
  });

  it('gives mid/dark objects a very light, low-chroma stage', () => {
    const t = computeTint({ base: '#C8312E' });
    const bg = hexToOklch(t.background);
    expect(bg.l).toBeGreaterThan(0.88);
    expect(bg.c).toBeLessThan(0.045);
  });

  it('gives pale objects a deeper, more saturated stage', () => {
    const t = computeTint({ base: '#F6F1E7' }); // mochi white
    const bg = hexToOklch(t.background);
    expect(bg.l).toBeLessThan(0.86);
    expect(bg.c).toBeGreaterThan(0.035);
  });

  it('keeps the shadow same-hue, darker and richer than the background', () => {
    const t = computeTint({ base: '#3FB4A4' });
    const bg = hexToOklch(t.background);
    const sh = hexToOklch(t.shadow);
    expect(sh.l).toBeLessThan(bg.l - 0.2);
    expect(sh.c).toBeGreaterThan(bg.c);
    expect(Math.abs(sh.h - bg.h)).toBeLessThan(3);
  });

  const samples = [
    '#2FB5A3', '#D63A3A', '#8E4C94', '#F2D24B', '#F2B33A', '#E85C78', '#F2A1BC',
    '#2B3A67', '#F6B3CE', '#F28A1E', '#C62E2E', '#E94E5E', '#DD3B2A', '#F3DFB5',
    '#D79A55', '#F0A6C2', '#C8873A', '#F7F3EC', '#F2D14C', '#5A3322', '#FFFFFF',
  ];

  it.each(samples)('passes the contrast guard and keeps text AA for %s', (base) => {
    const t = computeTint({ base });
    const bgL = hexToOklch(t.background).l;
    // Either it passes, or the stage sits at an edge of the allowed range (best achievable).
    const atEdge = bgL <= TINT.minBgL + 0.01 || bgL >= TINT.maxBgL - 0.01;
    expect(t.contrast >= TINT.minObjectContrast - 1e-6 || atEdge).toBe(true);
    expect(bgL).toBeGreaterThanOrEqual(TINT.minBgL - 0.01);
    expect(contrastRatio(INK, t.background)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(t.label, t.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.accent, t.background)).toBeGreaterThanOrEqual(3);
  });

  it('checks translucent jelly against its darkest and lightest parts', () => {
    const input = { base: '#F2A1BC', darkest: '#B4456C', lightest: '#FCE4EC' };
    const t = computeTint(input);
    const unguarded = computeTint({ base: input.base });
    const worst = (bg: string) =>
      Math.min(...[input.base, input.darkest, input.lightest].map((c) => contrastRatio(c, bg)));
    expect(t.contrast).toBeCloseTo(worst(t.background), 6);
    expect(worst(t.background)).toBeGreaterThanOrEqual(worst(unguarded.background) - 1e-6);
  });

  it('honours hand-tuned overrides', () => {
    const t = computeTint({ base: '#F28A1E' }, { background: '#D9E4F1', shadow: '#4A70A8' });
    expect(t.background).toBe('#D9E4F1');
    expect(t.shadow).toBe('#4A70A8');
  });
});
