import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/materials';
import { OBJECTS } from '../src/objects/registry';
import { computeTint, TINT } from '../src/tint/tint';
import { contrastRatio, hexToOklch, oklchToHex } from '../src/tint/oklch';

describe('object registry', () => {
  it('has the 20 objects in order with the spec’s groups', () => {
    expect(OBJECTS).toHaveLength(20);
    OBJECTS.forEach((o, i) => expect(o.no).toBe(i + 1));
    const groups = OBJECTS.map((o) => o.group);
    expect(groups.slice(0, 9).every((g) => g === 'jelly')).toBe(true);
    expect(groups.slice(9, 13).every((g) => g === 'fruit')).toBe(true);
    expect(groups.slice(13, 18).every((g) => g === 'soft')).toBe(true);
    expect(groups.slice(18).every((g) => g === 'firm')).toBe(true);
    expect(new Set(OBJECTS.map((o) => o.id)).size).toBe(20);
  });

  it('references real materials and ends titles with a full stop', () => {
    for (const o of OBJECTS) {
      expect(MATERIALS[o.material]).toBeDefined();
      expect(o.title.join(' ').trim().endsWith('.')).toBe(true);
      expect(o.variants.length).toBeGreaterThan(0);
    }
  });

  it('follows the §10 tool table', () => {
    const t = (id: string) => OBJECTS.find((o) => o.id === id)!.tools;
    for (const o of OBJECTS) expect(o.tools).toEqual(expect.arrayContaining(['hand', 'poke', 'press', 'knife']));
    expect(t('dolphin')).not.toContain('fork');
    expect(t('dolphin')).not.toContain('hammer');
    expect(t('orange-slice')).toContain('cutter');
    expect(t('apple')).toContain('hammer');
    expect(t('apple')).not.toContain('cutter');
    expect(t('watermelon')).toEqual(expect.arrayContaining(['cutter', 'spoon', 'hammer']));
    expect(t('pudding')).toContain('spoon');
    expect(t('donut')).not.toContain('spoon');
    expect(t('cheese')).toContain('fork');
    expect(t('cheese')).not.toContain('wavy');
    expect(t('chocolate')).toContain('hammer');
    expect(t('chocolate')).not.toContain('fork');
  });

  it('gives every variant a readable stage', () => {
    for (const o of OBJECTS) {
      for (const v of o.variants) {
        const tint = computeTint(
          { base: v.color, darkest: v.darkest, lightest: v.lightest, neutralHue: o.neutralHue },
          v.tintOverride,
        );
        if (tint.contrast < TINT.minObjectContrast) {
          // Not reachable: the guard must have picked the best lightness on offer.
          const bg = hexToOklch(tint.background);
          const samples = [v.color, v.darkest, v.lightest].filter((s): s is string => !!s);
          let best = 0;
          for (let l = TINT.minBgL; l <= TINT.maxBgL; l += 0.005) {
            const hex = oklchToHex({ ...bg, l });
            best = Math.max(best, Math.min(...samples.map((s) => contrastRatio(s, hex))));
          }
          expect(tint.contrast, `${o.id}/${v.id}`).toBeGreaterThanOrEqual(best - 0.02);
        }
        expect(contrastRatio('#1F1B18', tint.background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
