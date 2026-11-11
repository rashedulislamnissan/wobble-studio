/** Friendly static page when the browser cannot render 3D, or startup fails (§11). */
const COPY = {
  'no-webgl': {
    title: 'This browser can’t draw the stage.',
    body: 'Wobble Studio needs WebGL 2 or WebGPU. Try a recent Chrome, Safari, Edge or Firefox, and check that hardware acceleration is turned on.',
  },
  error: {
    title: 'The stage didn’t start.',
    body: 'Something went wrong while setting up 3D. Reload the page to try again; if it keeps happening, try another browser.',
  },
} as const;

export function showFallback(root: HTMLElement, kind: keyof typeof COPY) {
  const c = COPY[kind];
  root.dataset.state = 'fallback';
  root.innerHTML = `
    <main class="fallback">
      <p class="fallback__mark">Wobble Studio.</p>
      <h1 class="fallback__title">${c.title}</h1>
      <p class="fallback__body">${c.body}</p>
      <button class="btn" type="button" onclick="location.reload()">Reload</button>
    </main>`;
}
