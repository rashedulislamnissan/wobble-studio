/**
 * ?dev=tints — every object × variant on its computed stage tint, side by side, with the
 * spotlight halo, tinted shadow, hex values and the contrast the guard settled on (§8).
 */
import { OBJECTS } from '../objects/registry';
import { computeTint } from '../tint/tint';
import { h } from './dom';

export function startTintBoard() {
  document.body.style.overflow = 'auto';
  document.documentElement.style.overflow = 'auto';
  const app = document.getElementById('app')!;
  app.style.position = 'static';
  app.dataset.state = 'ready';
  document.getElementById('stage')?.remove();

  const grid = h('div.tintboard__grid');
  for (const o of OBJECTS) {
    for (const v of o.variants) {
      const t = computeTint({ base: v.color, darkest: v.darkest, lightest: v.lightest, neutralHue: o.neutralHue }, v.tintOverride);
      grid.append(
        h(
          'figure.tintcard',
          { style: `--bg:${t.background};--spot:${t.spotlight};--shadow:${t.shadow};--obj:${v.color};--label:${t.label}` },
          h('figcaption.tintcard__name', {}, `${o.no}. ${o.title.join(' ').replace(/\.$/, '').trim()} — ${v.label}`),
          h('div.tintcard__stage', {}, h('span.tintcard__shadow'), h('span.tintcard__obj')),
          h('p.tintcard__meta', {}, `${t.background} / ${t.shadow} · ${t.contrast.toFixed(2)}:1`),
        ),
      );
    }
  }
  document.getElementById('ui')!.replaceWith(
    h(
      'main.tintboard',
      {},
      h('h1.tintboard__title', {}, 'Stage tints.'),
      h('p.tintboard__intro', {}, 'Every object and variety on its computed background. The ratio is the luminance contrast between the object and its stage.'),
      grid,
    ),
  );
}
