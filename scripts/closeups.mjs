/**
 * High-DPI close-ups of objects (optionally after a knife cut) composed into one sheet.
 *   node scripts/closeups.mjs out.png [--cut] id ...
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const out = args.shift();
const cut = args.includes('--cut');
const ids = args.filter((a) => !a.startsWith('--'));
const toUrl = (p) => 'file:///' + p.split(path.sep).join('/');

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:5173/?object=${ids[0]}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.addStyleTag({ content: '#ui, .stage-overlay { display: none !important; }' });
const files = [];
for (const id of ids) {
  await page.evaluate((i) => window.__wobble.selectObject(i), id);
  await page.waitForTimeout(2600);
  if (cut) {
    await page.evaluate(() => {
      const ctx = window.__wobble.rt.pointer.context;
      const c = window.__wobble.rt.specimen.body.centerOfMass();
      // A cut facing the camera so the inside is on show.
      ctx.cut((x, _y, z) => 0.8 * (x - c[0]) + 0.6 * (z - c[2]), { normal: [0.8, 0, 0.6], separation: 0.5 });
    });
    await page.waitForTimeout(1800);
  }
  const file = path.resolve(`screenshots/cu-${id}${cut ? '-cut' : ''}.png`);
  await page.screenshot({ path: file, clip: { x: 480, y: 280, width: 480, height: 340 } });
  files.push(file);
}
const html = `<html><body style="margin:0;display:grid;grid-template-columns:repeat(2,480px);gap:2px;background:#222">${files
  .map((f) => `<img src="${toUrl(f)}" width="480" height="340">`)
  .join('')}</body></html>`;
const htmlPath = path.resolve('screenshots/closeups.html');
fs.writeFileSync(htmlPath, html);
const sheet = await browser.newPage({ viewport: { width: 962, height: Math.ceil(files.length / 2) * 342 }, deviceScaleFactor: 1 });
await sheet.goto(toUrl(htmlPath));
await sheet.waitForTimeout(300);
await sheet.screenshot({ path: out });
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
