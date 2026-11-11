import type { Tint } from '../tint/tint';

/** Push a tint into CSS custom properties; CSS transitions handle the crossfade. */
export function applyTintVars(t: Tint, root: HTMLElement = document.documentElement) {
  root.style.setProperty('--tint-bg', t.background);
  root.style.setProperty('--tint-spot', t.spotlight);
  root.style.setProperty('--tint-shadow', t.shadow);
  root.style.setProperty('--tint-accent', t.accent);
  root.style.setProperty('--tint-hairline', t.hairline);
  root.style.setProperty('--tint-label', t.label);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.background);
}
