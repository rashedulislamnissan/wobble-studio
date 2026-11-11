/**
 * Render every object (or the given ids) and compose a contact sheet image.
 *   node scripts/contact-sheet.mjs screenshots/sheet.png [id ...]
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const [out = 'screenshots/sheet.png', ...ids] = process.argv.slice(2);
const toUrl = (p) => 'file:///' + p.split(path.sep).join('/');

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/?object=dolphin', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const all = ids.length
  ? ids
  : await page.evaluate(() => Array.from(document.querySelectorAll('.picker__item')).map((b) => b.dataset.id));

const shots = [];
for (const id of all) {
  await page.evaluate((i) => window.__wobble.selectObject(i), id);
  await page.waitForTimeout(2600);
  const file = path.resolve(`screenshots/cs-${id}.png`);
  await page.screenshot({ path: file, clip: { x: 420, y: 230, width: 600, height: 420 } });
  const stats = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.stat__value'))
      .map((e) => e.textContent)
      .join(' / '),
  );
  shots.push({ id, file, stats });
}

const cols = 4;
const cells = shots
  .map(
    (s) =>
      `<figure style="margin:0;position:relative"><img src="${toUrl(s.file)}" width="300" height="210">` +
      `<figcaption style="position:absolute;left:4px;top:2px;font:11px monospace;background:#fff9;padding:1px 3px">${s.id} · ${s.stats}</figcaption></figure>`,
  )
  .join('');
const html = `<html><body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},300px);gap:2px">${cells}</body></html>`;
const htmlPath = path.resolve('screenshots/sheet.html');
fs.writeFileSync(htmlPath, html);
const sheet = await browser.newPage({ viewport: { width: cols * 302, height: Math.ceil(shots.length / cols) * 212 } });
await sheet.goto(toUrl(htmlPath));
await sheet.waitForTimeout(400);
await sheet.screenshot({ path: out, fullPage: true });
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
