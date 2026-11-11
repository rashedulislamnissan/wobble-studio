/**
 * The studio: top selector, title block, specimen panel, live readout and the stage.
 * Owns app state (object, variant, tool, sliders) and translates it into runtime calls.
 */
import type { Material } from 'three/webgpu';
import { audio } from '../audio/engine';
import * as R from '../audio/recipes';
import { getMaterial } from '../materials';
import { rangeValue, type MaterialDef } from '../materials/types';
import { buildRenderGeometry, type RenderBuild } from '../objects/build';
import { DEV_BLOB, OBJECTS, findObject } from '../objects/registry';
import type { ObjectDef, Shape, ToolId, Variant } from '../objects/types';
import { createJellyMaterial } from '../render/jellyMaterial';
import { createSurfaceMaterial } from '../render/surfaceMaterial';
import { computeTint } from '../tint/tint';
import { HandTool } from '../tools/hand';
import { PokeTool } from '../tools/poke';
import { PressTool } from '../tools/press';
import type { Tool } from '../tools/tool';
import { h } from '../ui/dom';
import { SpecimenPanel } from '../ui/panel';
import { Badge, Readout, TitleBlock } from '../ui/readout';
import { applyTintVars } from '../ui/tintVars';
import { TopBar } from '../ui/topBar';
import { ACTIONS, isActionAvailable, type ActionContext } from './actions';
import type { AppParams } from './params';
import { Runtime } from './runtime';

const TOOL_INFO: Record<ToolId, { label: string; hint: string }> = {
  hand: { label: 'Hand', hint: 'Grab and drag. Let go to watch it wobble; flick to toss it.' },
  poke: { label: 'Poke', hint: 'Press a fingertip in. Hold to push deeper, drag to slide the dent.' },
  press: { label: 'Press', hint: 'Drag down anywhere to lower the plate. Let go to lift it.' },
  knife: { label: 'Knife', hint: 'Draw a line across it to cut.' },
  wavy: { label: 'Wavy', hint: 'Draw a line to cut a rippled edge.' },
  cutter: { label: 'Cutter', hint: 'Tap to stamp out a shape.' },
  fork: { label: 'Fork', hint: 'Tap to pierce, then drag to lift a piece.' },
  spoon: { label: 'Spoon', hint: 'Drag across the top to scoop.' },
  hammer: { label: 'Hammer', hint: 'Tap to strike.' },
};

/** Tools whose mechanics exist so far; the rest stay hidden (§14). */
const IMPLEMENTED: ToolId[] = ['hand', 'poke', 'press'];

const POKE_OVERRIDES: Record<string, R.Recipe> = { puffy: R.puu, duck: R.squeak };

interface State {
  def: ObjectDef;
  variant: Variant;
  tool: ToolId;
  firm: number;
  damp: number;
  quarter: boolean;
  showMesh: boolean;
  paused: boolean;
}

export async function startStudio(params: AppParams) {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;
  const app = document.getElementById('app')!;
  const rt = await Runtime.create(canvas, params.forceWebGL);

  const tools: Partial<Record<ToolId, Tool>> = { hand: new HandTool(), poke: new PokeTool(), press: new PressTool() };
  const shapes = new Map<string, Shape>();
  let build: RenderBuild | null = null;
  let loadToken = 0;

  // ---------------------------------------------------------------- scheduled actions
  let simTime = 0;
  let queue: { at: number; fn: () => void }[] = [];
  rt.onStep = (dt) => {
    simTime += dt;
    if (!queue.length) return;
    const due = queue.filter((q) => q.at <= simTime);
    queue = queue.filter((q) => q.at > simTime);
    due.forEach((q) => q.fn());
  };
  const actionCtx = (): ActionContext => ({
    specimen: rt.specimen!,
    schedule: (delay, fn) => queue.push({ at: simTime + delay, fn }),
    sound: (e, i, recipe) => audio.play(e, i, recipe),
  });

  // ---------------------------------------------------------------- UI
  const topBar = new TopBar(() => null);
  const title = new TitleBlock();
  const readout = new Readout();
  const badge = new Badge();
  const panel = new SpecimenPanel();
  const live = h('p.visually-hidden', { 'aria-live': 'polite' });
  const shell = h('div.shell', {}, topBar.root, title.root, panel.root, readout.root);
  ui.append(shell, badge.root, live);

  topBar.setSound(audio.isEnabled);
  topBar.onSound = (on) => {
    audio.unlock();
    audio.setEnabled(on);
  };
  topBar.onSelect = (id) => {
    const def = findObject(id);
    if (def && def.id !== state.def.id) void selectObject(def);
  };
  rt.onFrame = (s) => {
    readout.update(s);
    badge.update(s);
  };

  const initial = params.dev === 'blob' ? DEV_BLOB : (findObject(params.object) ?? OBJECTS[0]);
  const state: State = {
    def: initial,
    variant: initial.variants[0],
    tool: 'hand',
    firm: getMaterial(initial.material).stiffness.default,
    damp: getMaterial(initial.material).damping.default,
    quarter: false,
    showMesh: false,
    paused: false,
  };

  const material = () => getMaterial(state.def.material);
  const bodyParams = (m: MaterialDef) => ({
    stiffness: rangeValue(m.stiffness, state.firm),
    damping: rangeValue(m.damping, state.damp),
    bulk: m.bulk,
    density: m.density,
  });

  function applyTint(instant: boolean) {
    const v = state.variant;
    const tint = computeTint(
      { base: v.color, darkest: v.darkest, lightest: v.lightest, neutralHue: state.def.neutralHue },
      v.tintOverride,
    );
    rt.setTint(tint, instant);
    applyTintVars(tint);
  }

  function setTool(id: ToolId) {
    state.tool = id;
    rt.setTool(tools[id]!);
    readout.setHint(TOOL_INFO[id].hint);
  }

  function renderPanel() {
    const m = material();
    const available = state.def.tools.filter((t) => IMPLEMENTED.includes(t));
    if (!available.includes(state.tool)) setTool('hand');
    panel.render({
      fig: String(state.def.no).padStart(2, '0'),
      tools: available.map((id) => ({ id, ...TOOL_INFO[id] })),
      activeTool: state.tool,
      onTool: (id) => setTool(id as ToolId),
      variants: state.def.variants.map((v) => ({ id: v.id, label: v.label, color: v.color })),
      activeVariant: state.variant.id,
      onVariant: (id) => {
        state.variant = state.def.variants.find((v) => v.id === id)!;
        build?.recolor(state.variant);
        applyTint(false);
        live.textContent = `${state.variant.label}.`;
      },
      firmness: {
        label: 'Firmness',
        value: state.firm,
        ends: m.firmnessLabels,
        format: (t) => String(Math.round(t * 100)).padStart(2, '0'),
        onInput: (t) => {
          state.firm = t;
          rt.setParams({ stiffness: rangeValue(m.stiffness, t) });
        },
      },
      damping: m.dampingAdjustable
        ? {
            label: 'Internal damping',
            value: state.damp,
            ends: m.dampingLabels,
            format: (t) => String(Math.round(t * 100)).padStart(2, '0'),
            onInput: (t) => {
              state.damp = t;
              rt.setParams({ damping: rangeValue(m.damping, t) });
            },
          }
        : null,
      actions: state.def.actions
        .filter((a) => isActionAvailable(a.id))
        .map((a) => ({ id: a.id, label: a.label, onClick: () => rt.specimen && ACTIONS[a.id](actionCtx()) })),
      onNudge: () => {
        rt.specimen?.nudge();
      },
      onReset: () => {
        rt.specimen?.reset();
        queue = [];
      },
      quarterSpeed: state.quarter,
      onQuarterSpeed: (on) => {
        state.quarter = on;
        rt.loop.timeScale = on ? 0.25 : 1;
      },
      showMesh: state.showMesh,
      onShowMesh: (on) => {
        state.showMesh = on;
        rt.specimen?.setShowMesh(on);
      },
      paused: state.paused,
      onPause: (p) => {
        state.paused = p;
        rt.loop.paused = p;
      },
    });
  }

  async function selectObject(def: ObjectDef, first = false) {
    const token = ++loadToken;
    const variant = def.variants[0];
    // Tint and title move immediately; geometry follows when ready.
    state.def = def;
    state.variant = variant;
    const m = material();
    state.firm = m.stiffness.default;
    state.damp = m.damping.default;
    applyTint(first);
    title.set(def.no, def.title[0], def.title[1], def.description);
    topBar.setSelected(def.id);
    app.dataset.state = 'loading';

    let shape = shapes.get(def.id);
    if (!shape) {
      shape = (await def.load())();
      shapes.set(def.id, shape);
    }
    if (token !== loadToken) return; // a newer selection won

    build = buildRenderGeometry(shape, variant, rt.quality.meshResolution);
    const mat: Material =
      m.look.kind === 'jelly' ? createJellyMaterial(m.look.clarity).material : createSurfaceMaterial(m, shape.look);
    queue = [];
    rt.displayDensity = m.displayDensity;
    rt.setSpecimen(shape, build.geometry, bodyParams(m), mat, first ? 0.9 : 0.55);
    rt.specimen!.setShowMesh(state.showMesh);
    audio.material = def.material;
    audio.overrides = POKE_OVERRIDES[def.id] ? { poke: [POKE_OVERRIDES[def.id]] } : {};
    renderPanel();
    setTool(state.tool);
    app.dataset.state = 'ready';
    live.textContent = `${def.title.join(' ').trim()} ${def.description}`;
    if (!first && def !== DEV_BLOB) {
      const url = new URL(location.href);
      url.searchParams.set('object', def.id);
      url.searchParams.delete('dev');
      history.replaceState(null, '', url);
    }
  }

  await selectObject(state.def, true);
  if (state.def === DEV_BLOB) topBar.setSelected('');

  // Keyboard shortcuts for the stage (not while typing in a control).
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'n' || e.key === 'N') rt.specimen?.nudge();
    if (e.key === 'r' || e.key === 'R') rt.specimen?.reset();
  });

  (window as unknown as { __wobble: unknown }).__wobble = { rt, state, selectObject: (id: string) => selectObject(findObject(id)!) };
}
