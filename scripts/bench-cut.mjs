/** Times cuts in the live page: node scripts/bench-cut.mjs <objectId> */
import { chromium } from 'playwright-core';
const id = process.argv[2] ?? 'orange-slice';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://localhost:5173/?object=${id}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const out = await page.evaluate(() => {
  const ctx = window.__wobble.rt.pointer.context;
  const times = [];
  const planes = [[1, 0, 0, 0.05], [0, 0, 1, 0.02], [0.7, 0, 0.7, -0.1], [0, 1, 0, 0.3]];
  for (const [nx, ny, nz, d] of planes) {
    const t0 = performance.now();
    const ok = ctx.cut((x, y, z) => nx * x + ny * y + nz * z - d, { normal: [nx, ny, nz], separation: 0.2 });
    times.push(`${ok ? 'cut' : 'miss'} ${(performance.now() - t0).toFixed(0)}ms`);
  }
  return { times, pieces: window.__wobble.rt.specimen.pieceCount, nodes: window.__wobble.rt.specimen.body.count };
});
console.log(id, JSON.stringify(out));
await page.waitForTimeout(1500);
const fps = await page.evaluate(() => document.querySelector('.badge')?.textContent);
console.log('after cuts:', fps);
await browser.close();
