/** Grab near the top and yank hard: node scripts/yank.mjs <id> <out.png> */
import { chromium } from 'playwright-core';
const [id = 'cake', out = 'screenshots/yank.png'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://localhost:5173/?object=${id}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2800);
const p = await page.evaluate(() => {
  const s = window.__wobble.rt.specimen, cam = window.__wobble.rt.stage.camera;
  const c = s.body.centerOfMass();
  const v = cam.position.clone().set(c[0] + 0.15, c[1] + s.height * 0.35, c[2]).project(cam);
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
});
await page.mouse.move(p.x, p.y);
await page.mouse.down();
for (let i = 1; i <= 4; i++) { await page.mouse.move(p.x + i * 70, p.y - i * 60); await page.waitForTimeout(16); }
await page.waitForTimeout(400);
await page.screenshot({ path: out });
await page.mouse.up();
await page.waitForTimeout(1500);
const pieces = await page.evaluate(() => window.__wobble.rt.specimen.pieceCount);
console.log(id, 'pieces after yank:', pieces);
await browser.close();
