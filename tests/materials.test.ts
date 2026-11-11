import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/materials';
import { rangePosition, rangeValue } from '../src/materials/types';

describe('material table', () => {
  it('has all eight materials with sane ranges', () => {
    expect(Object.keys(MATERIALS)).toHaveLength(8);
    for (const m of Object.values(MATERIALS)) {
      expect(m.stiffness.min).toBeGreaterThan(0);
      expect(m.stiffness.max).toBeGreaterThanOrEqual(m.stiffness.min);
      expect(m.damping.min).toBeGreaterThan(0);
      expect(m.displayDensity).toBeGreaterThan(0);
    }
  });

  it('orders materials by firmness as the spec describes', () => {
    const mid = (id: keyof typeof MATERIALS) => rangeValue(MATERIALS[id].stiffness, MATERIALS[id].stiffness.default);
    expect(mid('mochi')).toBeLessThan(mid('jelly'));
    expect(mid('jelly')).toBeLessThan(mid('fruit-juicy'));
    expect(mid('fruit-juicy')).toBeLessThan(mid('fruit-crisp'));
    expect(mid('fruit-crisp')).toBeLessThan(mid('brittle'));
  });

  it('only brittle disables the damping slider', () => {
    const fixed = Object.values(MATERIALS).filter((m) => !m.dampingAdjustable).map((m) => m.id);
    expect(fixed).toEqual(['brittle']);
  });

  it('round-trips log slider mapping', () => {
    const r = { min: 5, max: 500, default: 0.5 };
    for (const t of [0, 0.25, 0.5, 1]) expect(rangePosition(r, rangeValue(r, t))).toBeCloseTo(t, 9);
  });
});
