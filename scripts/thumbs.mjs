/**
 * Render a selector thumbnail for every object: the object on its own stage tint, framed
 * square, saved as WebP into public/thumbs/<id>.webp. Re-run after changing a shape.
 *   node scripts/thumbs.mjs   (dev server must be running on :5173)
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const SIZE = 112; // 2x the on-screen chip for crisp retina rendering
fs.mkdirSync('public/thumbs', { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
await page.goto('http://localhost:5173/?object=dolphin', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const ids = await page.evaluate(() => Array.from(document.querySelectorAll('.picker__item')).map((b) => b.dataset.id));
await page.addStyleTag({ content: '#ui, .stage-overlay { display: none !important; }' });

for (const id of ids) {
  await page.evaluate((i) => window.__wobble.selectObject(i), id);
  await page.waitForTimeout(2400);
  // Frame tightly on the object: project its bounds to the screen.
  const box = await page.evaluate(() => {
    const s = window.__wobble.rt.specimen;
    const cam = window.__wobble.rt.stage.camera;
    const p = s.body.pos;
    let minX = 1, maxX = -1, minY = 1, maxY = -1;
    const v = cam.position.clone();
    for (let i = 0; i < p.length; i += 9) {
      v.set(p[i], p[i + 1], p[i + 2]).project(cam);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const w = innerWidth, h = innerHeight;
    const cx = ((minX + maxX) / 2 + 1) * 0.5 * w;
    const cy = (1 - ((minY + maxY) / 2 + 1) * 0.5) * h;
    // NDC spans 2 units across the screen, so pixel extent = NDC extent * size / 2.
    const half = Math.max((maxX - minX) * w, (maxY - minY) * h) * 0.3 + 6;
    return { x: cx - half, y: cy - half, width: half * 2, height: half * 2 };
  });
  const png = await page.screenshot({ clip: box });
  // Downscale to WebP in the browser (no image libraries needed).
  const webp = await page.evaluate(async ({ b64, size }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, size, size);
    return c.toDataURL('image/webp', 0.86).split(',')[1];
  }, { b64: png.toString('base64'), size: SIZE });
  fs.writeFileSync(`public/thumbs/${id}.webp`, Buffer.from(webp, 'base64'));
  process.stdout.write(`${id} `);
}
console.log('\ndone');
await browser.close();
