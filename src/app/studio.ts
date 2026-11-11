/** The main studio (Phase 2+). Phase 0: an empty styled stage. */
import { computeTint } from '../tint/tint';
import { h } from '../ui/dom';
import { applyTintVars } from '../ui/tintVars';
import type { AppParams } from './params';
import { Runtime } from './runtime';

export async function startStudio(params: AppParams) {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;
  const rt = await Runtime.create(canvas, params.forceWebGL);
  const tint = computeTint({ base: '#F28A1E' });
  rt.setTint(tint, true);
  applyTintVars(tint);
  ui.append(h('div.shell', {}, h('div.topbar', {}, h('p.wordmark', {}, 'Wobble Studio.'))));
}
