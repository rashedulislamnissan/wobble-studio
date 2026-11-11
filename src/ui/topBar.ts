/**
 * Top bar (§7): wordmark, a horizontally scrolling strip of the 20 objects grouped by
 * material family, and the sound toggle. The strip is a single listbox: arrow keys move,
 * Home/End jump, Enter/Space selects.
 */
import { GROUP_LABELS, OBJECTS } from '../objects/registry';
import type { Group, ObjectDef } from '../objects/types';
import { h } from './dom';

const SPEAKER_ON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" fill="none" stroke="currentColor" stroke-linejoin="round"/><path d="M10.4 5.6a3.4 3.4 0 0 1 0 4.8M12.2 3.8a6 6 0 0 1 0 8.4" fill="none" stroke="currentColor" stroke-linecap="round"/></svg>';
const SPEAKER_OFF =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" fill="none" stroke="currentColor" stroke-linejoin="round"/><path d="M10.5 6.2l3.4 3.6M13.9 6.2l-3.4 3.6" fill="none" stroke="currentColor" stroke-linecap="round"/></svg>';

const CAMERA =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5.5h2.2l1.1-1.6h4.4l1.1 1.6h2.2v7h-11z" fill="none" stroke="currentColor" stroke-linejoin="round"/><circle cx="8" cy="9" r="2.3" fill="none" stroke="currentColor"/></svg>';

export class TopBar {
  readonly root: HTMLElement;
  private readonly items = new Map<string, HTMLButtonElement>();
  private readonly soundBtn: HTMLButtonElement;
  onSelect: ((id: string) => void) | null = null;
  onSound: ((on: boolean) => void) | null = null;
  onCapture: (() => void) | null = null;

  constructor(thumb: (o: ObjectDef) => string | null) {
    const picker = h('div.picker', { role: 'listbox', 'aria-label': 'Objects', 'aria-orientation': 'horizontal' });
    const groups = new Map<Group, HTMLElement>();
    for (const o of OBJECTS) {
      let g = groups.get(o.group);
      if (!g) {
        g = h('div.picker__group', { role: 'group', 'aria-label': GROUP_LABELS[o.group] }, h('span.label.picker__group-label', { 'aria-hidden': 'true' }, GROUP_LABELS[o.group]));
        groups.set(o.group, g);
        picker.append(g);
      }
      const name = o.title.join(' ').replace(/\.$/, '').trim();
      const src = thumb(o);
      const visual = src
        ? h('img', { src, alt: '', width: 28, height: 28, loading: 'lazy', decoding: 'async' })
        : h('span.picker__chip', { style: `--chip:${o.variants[0].color}` });
      const btn = h(
        'button.picker__item',
        {
          type: 'button',
          role: 'option',
          'aria-selected': 'false',
          'aria-label': `${name}, No. ${o.no}`,
          title: name,
          tabindex: '-1',
          'data-id': o.id,
          onclick: () => this.onSelect?.(o.id),
        },
        visual,
      );
      this.items.set(o.id, btn);
      g.append(btn);
    }
    picker.addEventListener('keydown', (e) => this.onKey(e));

    this.soundBtn = h('button.icon-btn.sound', {
      type: 'button',
      'aria-pressed': 'true',
      onclick: () => {
        const on = this.soundBtn.getAttribute('aria-pressed') !== 'true';
        this.setSound(on);
        this.onSound?.(on);
      },
    });

    const capture = h('button.icon-btn.capture', {
      type: 'button',
      title: 'Save an image of the stage',
      'aria-label': 'Save image',
      onclick: () => this.onCapture?.(),
    });
    capture.innerHTML = `${CAMERA}<span class="capture__label">Save image</span>`;

    this.root = h('nav.topbar', { 'aria-label': 'Wobble Studio' }, h('p.wordmark', {}, 'Wobble Studio.'), picker, capture, this.soundBtn);
  }

  setSelected(id: string) {
    for (const [oid, btn] of this.items) {
      const on = oid === id;
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
      if (on) btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  setSound(on: boolean) {
    this.soundBtn.setAttribute('aria-pressed', String(on));
    this.soundBtn.innerHTML = `${on ? SPEAKER_ON : SPEAKER_OFF}<span class="sound__label">${on ? 'Sound on' : 'Sound off'}</span>`;
    this.soundBtn.setAttribute('aria-label', on ? 'Sound on. Turn sound off' : 'Sound off. Turn sound on');
  }

  private onKey(e: KeyboardEvent) {
    const list = [...this.items.values()];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(list.length - 1, i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      list[i].click();
      return;
    }
    if (next >= 0) {
      e.preventDefault();
      list.forEach((b, k) => (b.tabIndex = k === next ? 0 : -1));
      list[next].focus();
      list[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
}
