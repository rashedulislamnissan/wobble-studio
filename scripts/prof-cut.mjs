import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://localhost:5173/?object=${process.argv[2] ?? 'cake'}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const r = await page.evaluate(() => {
  globalThis.__t = [];
  window.__wobble.rt.pointer.context.cut((x) => x - 0.05, { normal: [1, 0, 0] });
  const t = globalThis.__t;
  return t.map(([l, v], i) => `${l} ${i ? (v - t[i - 1][1]).toFixed(1) : 0}`).join(' | ');
});
console.log(r);
await browser.close();
