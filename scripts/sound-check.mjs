/**
 * Objective "is it gentle?" check for every synthesis recipe: renders each offline at full
 * intensity through the same master chain as the app, then reports peak level, share of
 * energy above 3 kHz (harshness), and the largest sample jump in the first 10 ms (clicks).
 *   node scripts/sound-check.mjs   (dev server running on :5173)
 */
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto('http://localhost:5173/?object=dolphin', { waitUntil: 'networkidle' });
const rows = await page.evaluate(async () => {
  const R = await import('/src/audio/recipes.ts');
  const out = [];
  for (const [name, fn] of Object.entries(R)) {
    if (typeof fn !== 'function') continue;
    const rate = 44100;
    const ctx = new OfflineAudioContext(1, rate * 1.2, rate);
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 3800;
    soften.Q.value = 0.5;
    const master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(soften).connect(ctx.destination);
    fn(ctx, master, 0.01, 1, 1);
    const buf = await ctx.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0, total = 0, high = 0, jump = 0, prevHp = 0, prev = 0;
    // One-pole high-pass at ~3 kHz to estimate bright energy.
    const a = Math.exp((-2 * Math.PI * 3000) / rate);
    for (let n = 0; n < d.length; n++) {
      const x = d[n];
      peak = Math.max(peak, Math.abs(x));
      total += x * x;
      const hp = a * (prevHp + x - prev);
      high += hp * hp;
      prevHp = hp;
      if (n < rate * 0.02 && n > 0) jump = Math.max(jump, Math.abs(x - prev));
      prev = x;
    }
    out.push({ name, peakDb: 20 * Math.log10(peak + 1e-9), bright: total > 0 ? high / total : 0, jump });
  }
  return out;
});
console.log('recipe        peak dBFS   >3kHz energy   onset jump');
for (const r of rows) {
  const flag = r.peakDb > -9 || r.bright > 0.08 || r.jump > 0.02 ? '  <- check' : '';
  console.log(`${r.name.padEnd(13)} ${r.peakDb.toFixed(1).padStart(8)}   ${(r.bright * 100).toFixed(1).padStart(10)}%   ${r.jump.toFixed(4).padStart(9)}${flag}`);
}
await browser.close();
