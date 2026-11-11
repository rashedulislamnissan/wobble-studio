/**
 * Quantify "rubberiness" in the live app.
 *  hold: grab, lift quickly, stop; sample centre-of-mass height → overshoot and bobbing.
 *  drop: drop from a height; count bounces and measure peak rebound.
 *   node scripts/feel-test.mjs apple cake dolphin
 */
import { chromium } from 'playwright-core';

const ids = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://localhost:5173/?object=${ids[0]}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const com = () => page.evaluate(() => window.__wobble.rt.specimen.body.centerOfMass()[1]);
for (const id of ids) {
  await page.evaluate((i) => window.__wobble.selectObject(i), id);
  await page.waitForTimeout(2800);
  // Find the object on screen and grab it near its top-centre.
  const p = await page.evaluate(() => {
    const s = window.__wobble.rt.specimen, cam = window.__wobble.rt.stage.camera;
    const c = s.body.centerOfMass();
    const v = cam.position.clone().set(c[0], c[1] + s.height * 0.25, c[2]).project(cam);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  });
  const rest = await com();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(p.x, p.y - i * 22);
    await page.waitForTimeout(16);
  }
  const samples = [];
  for (let k = 0; k < 30; k++) {
    samples.push(await com());
    await page.waitForTimeout(33);
  }
  await page.mouse.up();
  const settled = samples[samples.length - 1];
  const peak = Math.max(...samples);
  // Count direction changes after the peak (bobbing).
  let flips = 0;
  for (let k = 2; k < samples.length; k++) {
    const a = samples[k - 1] - samples[k - 2], b = samples[k] - samples[k - 1];
    if (Math.abs(b) > 0.003 && Math.sign(a) !== Math.sign(b)) flips++;
  }
  // Drop test: wait for it to land, then track rebounds.
  const heights = [];
  for (let k = 0; k < 60; k++) {
    heights.push(await com());
    await page.waitForTimeout(25);
  }
  let bounces = 0, rebound = 0, low = Infinity, rising = false;
  for (let k = 1; k < heights.length; k++) {
    low = Math.min(low, heights[k]);
    const up = heights[k] - heights[k - 1] > 0.004;
    if (up && !rising) {
      bounces++;
      rising = true;
    } else if (!up && heights[k] - heights[k - 1] < -0.004) rising = false;
    if (bounces) rebound = Math.max(rebound, heights[k] - low);
  }
  console.log(
    `${id.padEnd(13)} hold: lift ${(settled - rest).toFixed(2)} overshoot ${(peak - settled).toFixed(3)} bobs ${flips} | drop: bounces ${bounces} rebound ${rebound.toFixed(3)}`,
  );
}
await browser.close();
