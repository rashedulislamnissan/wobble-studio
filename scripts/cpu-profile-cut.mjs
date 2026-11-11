/** CPU-profile one cut via CDP and print the hottest functions by self time. */
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://localhost:5173/?object=${process.argv[2] ?? 'cake'}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
await cdp.send('Profiler.start');
await page.evaluate(() => {
  const ctx = window.__wobble.rt.pointer.context;
  ctx.cut((x) => x - 0.05, { normal: [1, 0, 0] });
  ctx.cut((_x, _y, z) => z - 0.02, { normal: [0, 0, 1] });
});
const { profile } = await cdp.send('Profiler.stop');
const self = new Map();
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const dt = profile.timeDeltas;
profile.samples.forEach((id, i) => {
  const n = byId.get(id);
  const key = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
  self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
});
[...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).forEach(([k, v]) => console.log(v.toFixed(1).padStart(7), 'ms', k));
await browser.close();
