/**
 * "The Specimen" panel (§7): tools, variety, firmness, internal damping, actions,
 * toggles and pause. Content is rebuilt per object/material; it never owns state that
 * the app does not also know about.
 */
import { clear, h, nextId } from './dom';

export interface ToolOption {
  id: string;
  label: string;
  hint: string;
}

export interface VariantOption {
  id: string;
  label: string;
  color: string;
}

export interface SliderSpec {
  label: string;
  value: number; // 0..1
  ends: [string, string];
  format: (t: number) => string;
  onInput: (t: number) => void;
}

export interface PanelSpec {
  fig: string;
  tools: ToolOption[];
  activeTool: string;
  onTool: (id: string) => void;
  /** Extra choices for the active tool (cutter shapes). */
  toolOptions?: { label: string; options: { id: string; label: string }[]; active: string; onChange: (id: string) => void } | null;
  variants: VariantOption[];
  activeVariant: string;
  onVariant: (id: string) => void;
  firmness: SliderSpec;
  damping: SliderSpec | null;
  actions: { id: string; label: string; onClick: () => void }[];
  onNudge: () => void;
  onReset: () => void;
  quarterSpeed: boolean;
  onQuarterSpeed: (on: boolean) => void;
  showMesh: boolean;
  onShowMesh: (on: boolean) => void;
  paused: boolean;
  onPause: (paused: boolean) => void;
}

export class SpecimenPanel {
  readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly fig: HTMLElement;
  private readonly handleTool: HTMLElement;
  private pauseBtn: HTMLButtonElement | null = null;
  private toolButtons = new Map<string, HTMLButtonElement>();

  constructor() {
    this.fig = h('span.panel__fig');
    this.handleTool = h('span.panel__handle-tool');
    const handle = h(
      'button.panel__handle',
      {
        type: 'button',
        'aria-expanded': 'false',
        'aria-controls': 'specimen-panel-body',
        onclick: () => this.toggleSheet(),
      },
      h('span.panel__grip', { 'aria-hidden': 'true' }),
      h('span.panel__handle-label', {}, 'Tool'),
      this.handleTool,
    );
    this.body = h('div.panel__body#specimen-panel-body');
    this.root = h(
      'aside.panel',
      { 'aria-label': 'The specimen: tools and controls', 'data-sheet': 'collapsed' },
      handle,
      h('header.panel__head', {}, h('h2.label', {}, 'The specimen'), this.fig),
      this.body,
    );
  }

  private toggleSheet(force?: boolean) {
    const open = force ?? this.root.dataset.sheet !== 'open';
    this.root.dataset.sheet = open ? 'open' : 'collapsed';
    this.root.querySelector('.panel__handle')?.setAttribute('aria-expanded', String(open));
  }

  render(spec: PanelSpec) {
    this.fig.textContent = `fig. ${spec.fig}`;
    clear(this.body);
    this.toolButtons.clear();

    // Tool
    const toolGroup = h('div.segmented', { role: 'radiogroup', 'aria-label': 'Tool' });
    for (const t of spec.tools) {
      const btn = h(
        'button.segmented__item',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(t.id === spec.activeTool),
          'data-tool': t.id,
          onclick: () => {
            this.setActiveTool(t.id, t.label);
            spec.onTool(t.id);
          },
        },
        t.label,
      );
      this.toolButtons.set(t.id, btn);
      toolGroup.append(btn);
    }
    radioKeys(toolGroup);
    const toolSection = section('Tool', toolGroup);
    this.optionsSlot = h('div.tool-options');
    toolSection.append(this.optionsSlot);
    this.body.append(toolSection);
    this.renderToolOptions(spec.toolOptions ?? null);
    const active = spec.tools.find((t) => t.id === spec.activeTool);
    this.handleTool.textContent = active?.label ?? '';

    // Variety
    if (spec.variants.length > 1) {
      const sw = h('div.swatches', { role: 'radiogroup', 'aria-label': 'Variety' });
      const name = h('span.swatches__name', { 'aria-hidden': 'true' });
      for (const v of spec.variants) {
        const b = h('button.swatch', {
          type: 'button',
          role: 'radio',
          'aria-checked': String(v.id === spec.activeVariant),
          'aria-label': v.label,
          title: v.label,
          style: `--swatch:${v.color}`,
          onclick: () => {
            sw.querySelectorAll('.swatch').forEach((el) => el.setAttribute('aria-checked', 'false'));
            b.setAttribute('aria-checked', 'true');
            name.textContent = v.label;
            spec.onVariant(v.id);
          },
        });
        sw.append(b);
      }
      radioKeys(sw);
      name.textContent = spec.variants.find((v) => v.id === spec.activeVariant)?.label ?? '';
      this.body.append(section('Variety', h('div.swatches-row', {}, sw, name)));
    }

    this.body.append(slider(spec.firmness));
    if (spec.damping) this.body.append(slider(spec.damping));

    // Actions
    const actions = h('div.actions');
    for (const a of spec.actions) {
      actions.append(h('button.btn', { type: 'button', onclick: a.onClick }, a.label));
    }
    actions.append(
      h('button.btn', { type: 'button', onclick: spec.onNudge }, 'Give it a nudge'),
      h('button.btn.btn--quiet', { type: 'button', onclick: spec.onReset }, 'Reset'),
    );
    this.body.append(h('div.panel__section', {}, actions));

    // Toggles
    const toggles = h(
      'div.toggles',
      {},
      checkbox('¼ speed', spec.quarterSpeed, spec.onQuarterSpeed),
      checkbox('Show mesh', spec.showMesh, spec.onShowMesh),
    );
    this.pauseBtn = h(
      'button.btn.btn--wide',
      {
        type: 'button',
        'aria-pressed': String(spec.paused),
        onclick: () => {
          const next = this.pauseBtn!.getAttribute('aria-pressed') !== 'true';
          this.setPaused(next);
          spec.onPause(next);
        },
      },
      spec.paused ? 'Resume' : 'Pause',
    );
    this.body.append(h('div.panel__section.panel__section--foot', {}, toggles, this.pauseBtn));
  }

  private optionsSlot: HTMLElement | null = null;

  renderToolOptions(opts: PanelSpec['toolOptions']) {
    const slot = this.optionsSlot;
    if (!slot) return;
    clear(slot);
    if (!opts) return;
    const group = h('div.chips', { role: 'radiogroup', 'aria-label': opts.label });
    for (const o of opts.options) {
      const chip = h(
        'button.chip',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(o.id === opts.active),
          onclick: () => {
            group.querySelectorAll('.chip').forEach((el) => el.setAttribute('aria-checked', 'false'));
            chip.setAttribute('aria-checked', 'true');
            opts.onChange(o.id);
          },
        },
        o.label,
      );
      group.append(chip);
    }
    radioKeys(group);
    slot.append(group);
  }

  setActiveTool(id: string, label?: string) {
    for (const [tid, btn] of this.toolButtons) btn.setAttribute('aria-checked', String(tid === id));
    if (label) this.handleTool.textContent = label;
  }

  setPaused(paused: boolean) {
    if (!this.pauseBtn) return;
    this.pauseBtn.setAttribute('aria-pressed', String(paused));
    this.pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  }
}

function section(title: string, content: HTMLElement) {
  const id = nextId('sec');
  return h(
    'div.panel__section',
    { role: 'group', 'aria-labelledby': id },
    h('h3.label', { id }, title),
    content,
  );
}

function slider(s: SliderSpec) {
  const id = nextId('slider');
  const out = h('output.slider__value', { for: id }, s.format(s.value));
  const input = h('input.slider__input', {
    id,
    type: 'range',
    min: '0',
    max: '1',
    step: '0.001',
    value: String(s.value),
    'aria-valuetext': s.format(s.value),
  });
  const sync = () => {
    const t = Number(input.value);
    out.textContent = s.format(t);
    input.setAttribute('aria-valuetext', s.format(t));
    input.style.setProperty('--fill', `${t * 100}%`);
    s.onInput(t);
  };
  input.style.setProperty('--fill', `${s.value * 100}%`);
  input.addEventListener('input', sync);
  return h(
    'div.panel__section.slider',
    {},
    h('div.slider__head', {}, h('label.label', { for: id }, s.label), out),
    input,
    h('div.slider__ends', { 'aria-hidden': 'true' }, h('span', {}, s.ends[0]), h('span', {}, s.ends[1])),
  );
}

function checkbox(label: string, checked: boolean, onChange: (on: boolean) => void) {
  const input = h('input.check__input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label.check', {}, input, h('span.check__box', { 'aria-hidden': 'true' }), h('span', {}, label));
}

/** Arrow-key navigation inside a role=radiogroup (roving focus). */
function radioKeys(group: HTMLElement) {
  const items = () => Array.from(group.querySelectorAll<HTMLElement>('[role=radio]'));
  const syncTabIndex = () => {
    const list = items();
    const checked = list.find((el) => el.getAttribute('aria-checked') === 'true') ?? list[0];
    list.forEach((el) => (el.tabIndex = el === checked ? 0 : -1));
  };
  syncTabIndex();
  group.addEventListener('click', syncTabIndex);
  group.addEventListener('keydown', (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % list.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + list.length) % list.length;
    if (next >= 0) {
      e.preventDefault();
      list[next].focus();
      list[next].click();
    }
  });
}
