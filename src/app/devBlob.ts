/**
 * ?dev=blob — the Phase 1 physics spike: a plain jelly drop with the full panel so the
 * feel (stiffness, damping, drag response) can be tuned in isolation.
 */
import { MATERIALS } from '../materials';
import { rangeValue } from '../materials/types';
import { createJellyMaterial } from '../render/jellyMaterial';
import { blob } from '../objects/shapes/blob';
import { computeTint } from '../tint/tint';
import { h } from '../ui/dom';
import { SpecimenPanel } from '../ui/panel';
import { Badge, Readout, TitleBlock } from '../ui/readout';
import { applyTintVars } from '../ui/tintVars';
import type { AppParams } from './params';
import { Runtime } from './runtime';

const VARIANTS = [
  { id: 'mint', label: 'Mint', color: '#3FB8A2' },
  { id: 'rose', label: 'Rose', color: '#E8708F' },
  { id: 'amber', label: 'Amber', color: '#F0A93B' },
];

export async function startDevBlob(params: AppParams) {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;
  const rt = await Runtime.create(canvas, params.forceWebGL);
  const mat = MATERIALS.jelly;
  let firm = mat.stiffness.default;
  let damp = mat.damping.default;
  let variant = VARIANTS[0];

  const jelly = createJellyMaterial({ color: variant.color, clarity: mat.look.clarity });
  rt.displayDensity = mat.displayDensity;
  const params0 = () => ({
    stiffness: rangeValue(mat.stiffness, firm),
    damping: rangeValue(mat.damping, damp),
    bulk: mat.bulk,
    density: mat.density,
  });
  rt.setSpecimen(blob, params0(), jelly.material, 0.9);

  const applyVariant = (instant: boolean) => {
    const tint = computeTint({ base: variant.color });
    rt.setTint(tint, instant);
    applyTintVars(tint);
    jelly.setColor(variant.color);
  };
  applyVariant(true);

  const title = new TitleBlock();
  title.set(0, 'Dev', 'Blob.', 'A plain jelly drop for tuning the soft-body solver. Not in the selector.');
  const readout = new Readout();
  readout.setHint('Grab the blob and drag. Let go to watch it wobble; flick to toss it.');
  const badge = new Badge();
  const panel = new SpecimenPanel();
  let quarter = false;
  let showMesh = false;
  panel.render({
    fig: '00',
    tools: [{ id: 'hand', label: 'Hand', hint: '' }],
    activeTool: 'hand',
    onTool: () => {},
    variants: VARIANTS,
    activeVariant: variant.id,
    onVariant: (id) => {
      variant = VARIANTS.find((v) => v.id === id)!;
      applyVariant(false);
    },
    firmness: {
      label: 'Firmness',
      value: firm,
      ends: mat.firmnessLabels,
      format: (t) => rangeValue(mat.stiffness, t).toFixed(0).padStart(3, '0'),
      onInput: (t) => {
        firm = t;
        rt.setParams({ stiffness: rangeValue(mat.stiffness, t) });
      },
    },
    damping: {
      label: 'Internal damping',
      value: damp,
      ends: mat.dampingLabels,
      format: (t) => rangeValue(mat.damping, t).toFixed(1),
      onInput: (t) => {
        damp = t;
        rt.setParams({ damping: rangeValue(mat.damping, t) });
      },
    },
    actions: [],
    onNudge: () => rt.specimen?.nudge(),
    onReset: () => rt.specimen?.reset(),
    quarterSpeed: quarter,
    onQuarterSpeed: (on) => {
      quarter = on;
      rt.loop.timeScale = on ? 0.25 : 1;
    },
    showMesh,
    onShowMesh: (on) => {
      showMesh = on;
      rt.specimen?.setShowMesh(on);
    },
    paused: false,
    onPause: (p) => {
      rt.loop.paused = p;
    },
  });

  const top = h(
    'div.topbar',
    {},
    h('p.wordmark', {}, 'Wobble Studio.'),
    h('span.label', {}, 'Physics spike · dev'),
  );
  const shell = h('div.shell', {}, top, title.root, panel.root, readout.root);
  ui.append(shell, badge.root);

  rt.onFrame = (s) => {
    readout.update(s);
    badge.update(s);
  };

  // Test hooks for automated checks (harmless in production).
  (window as unknown as { __wobble: unknown }).__wobble = { rt };
}
