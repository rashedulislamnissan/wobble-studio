/**
 * Browser check: open a page in local Chrome (GPU on), capture console output, take
 * screenshots, optionally drag the specimen. Used for the §14 manual checklist.
 *
 *   node scripts/shoot.mjs <url> <outPrefix> [--phone] [--drag] [--wait=ms] [--headed]
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const [url, outPrefix = 'screenshots/shot', ...flags] = process.argv.slice(2);
const has = (f) => flags.includes(f);
const opt = (name, def) => {
  const f = flags.find((x) => x.startsWith(`--${name}=`));
  return f ? f.split('=')[1] : def;
};
fs.mkdirSync(path.dirname(outPrefix), { recursive: true });

const phone = has('--phone');
const browser = await chromium.launch({
  channel: 'chrome',
  headless: !has('--headed'),
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'],
});
const context = await browser.newContext({
  viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  deviceScaleFactor: phone ? 3 : 1,
  isMobile: phone,
  hasTouch: phone,
});
const page = await context.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(opt('wait', 2500)));
await page.screenshot({ path: `${outPrefix}-1.png` });

const tool = opt('tool', null);
if (tool) {
  await page.getByRole('radio', { name: tool, exact: true }).first().click();
  await page.waitForTimeout(200);
  const box = await page.locator('#stage').boundingBox();
  const cx = box.x + box.width * Number(opt('cx', 0.5));
  const cy = box.y + box.height * Number(opt('cy', 0.55));
  const line = opt('line', null);
  if (has('--tap')) {
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(Number(opt('after', 700)));
    await page.screenshot({ path: `${outPrefix}-3-tap.png` });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${outPrefix}-4-settled.png` });
  } else if (!line) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
  }
  if (line) {
    const [x0, y0, x1, y1] = line.split(',').map(Number);
    await page.mouse.move(box.x + box.width * x0, box.y + box.height * y0);
    await page.mouse.down();
    for (let i = 1; i <= 16; i++) {
      await page.mouse.move(box.x + box.width * (x0 + ((x1 - x0) * i) / 16), box.y + box.height * (y0 + ((y1 - y0) * i) / 16));
      await page.waitForTimeout(16);
    }
    await page.screenshot({ path: `${outPrefix}-2-line.png` });
    await page.mouse.up();
    await page.waitForTimeout(Number(opt('after', 900)));
    await page.screenshot({ path: `${outPrefix}-3-cut.png` });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${outPrefix}-4-settled.png` });
  } else if (tool === 'Press') {
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(cx, cy + i * 12);
      await page.waitForTimeout(16);
    }
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outPrefix}-2-${tool.toLowerCase()}.png` });
  await page.mouse.up();
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${outPrefix}-3-after.png` });
}

const action = opt('action', null);
if (action) {
  await page.getByRole('button', { name: action, exact: true }).click();
  await page.waitForTimeout(Number(opt('after', 700)));
  await page.screenshot({ path: `${outPrefix}-3-action.png` });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outPrefix}-4-settled.png` });
}

if (has('--drag')) {
  const box = await page.locator('#stage').boundingBox();
  // Stage centre is roughly where the specimen sits.
  const cx = box.x + box.width * Number(opt('cx', 0.5));
  const cy = box.y + box.height * Number(opt('cy', 0.6));
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(cx + i * 9, cy - i * 9);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outPrefix}-2-held.png` });
  await page.mouse.up();
  await page.waitForTimeout(140);
  await page.screenshot({ path: `${outPrefix}-3-released.png` });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${outPrefix}-4-settled.png` });
}

const info = await page.evaluate(() => ({
  badge: document.querySelector('.badge')?.textContent ?? null,
  stats: Array.from(document.querySelectorAll('.stat__value')).map((e) => e.textContent),
  state: document.getElementById('app')?.dataset.state,
  gpu: 'gpu' in navigator,
}));
console.log(JSON.stringify(info));
console.log(logs.filter((l) => !l.includes('[vite]')).slice(0, 30).join('\n'));
await browser.close();
