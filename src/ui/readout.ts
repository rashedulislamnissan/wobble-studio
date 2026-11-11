/** Title block, bottom-left hint + live stats, and the renderer badge (§7). */
import type { FrameStats } from '../app/runtime';
import { h } from './dom';

export class TitleBlock {
  readonly root: HTMLElement;
  private readonly kicker = h('p.label.title__kicker');
  private readonly line1 = h('span.title__line');
  private readonly line2 = h('span.title__line.title__line--indent');
  private readonly desc = h('p.title__desc');

  constructor() {
    this.root = h(
      'header.title',
      {},
      this.kicker,
      h('h1.title__name', {}, this.line1, this.line2),
      this.desc,
    );
  }

  set(number: number, line1: string, line2: string, description: string) {
    this.kicker.textContent = `Material studies / No. ${String(number).padStart(3, '0')}`;
    this.line1.textContent = line1;
    this.line2.textContent = line2;
    this.desc.textContent = description;
  }
}

export class Readout {
  readonly root: HTMLElement;
  private readonly hint = h('p.readout__hint', { 'aria-live': 'polite' });
  private readonly mass = h('span.stat__value');
  private readonly volume = h('span.stat__value');
  private readonly kinetic = h('span.stat__value');
  private readonly pieces = h('span.stat__value');
  private readonly foot = h('p.readout__foot');

  constructor() {
    const stat = (label: string, value: HTMLElement) =>
      h('div.stat', {}, h('dt.label', {}, label), h('dd', {}, value));
    this.root = h(
      'section.readout',
      { 'aria-label': 'Live measurements' },
      this.hint,
      h(
        'dl.stats',
        {},
        stat('Mass', this.mass),
        stat('Volume', this.volume),
        stat('Kinetic', this.kinetic),
        stat('Pieces', this.pieces),
      ),
      this.foot,
    );
    this.foot.textContent = 'Volume is measured against the shape at rest. Kinetic energy in millijoules, scaled.';
  }

  setHint(text: string) {
    this.hint.textContent = text;
  }

  update(s: FrameStats) {
    this.mass.textContent = `${Math.round(s.massG)} g`;
    this.volume.textContent = `${s.volumePct.toFixed(1)}%`;
    this.kinetic.textContent = (s.kinetic * 1000).toFixed(2);
    this.pieces.textContent = String(s.pieces);
  }
}

export class Badge {
  readonly root: HTMLElement;
  private readonly text = h('span');
  private readonly fps = h('span.badge__fps');

  constructor() {
    this.root = h(
      'div.badge',
      { role: 'status', 'aria-label': 'Renderer status' },
      h('span.badge__dot', { 'aria-hidden': 'true' }),
      this.text,
      this.fps,
    );
  }

  update(s: FrameStats) {
    this.text.textContent = `${s.renderer === 'webgpu' ? 'WebGPU' : 'WebGL'} · live`;
    this.fps.textContent = `${Math.round(s.fps)} fps`;
  }
}
