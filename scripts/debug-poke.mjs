import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5173/?object=dolphin', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.getByRole('radio', { name: 'Poke', exact: true }).click();
await page.mouse.move(720, 450);
await page.mouse.down();
for (const t of [50, 300, 600]) {
  await page.waitForTimeout(t === 50 ? 50 : 250);
  console.log(t, JSON.stringify(await page.evaluate(() => {
    const w = window.__wobble; const b = w.rt.specimen.body;
    const c = b.colliders[0];
    const px = b.proxyTet.length; let minD = 9; for (let p = 0; p < px; p++) { const t = b.proxyTet[p]*4; let x=0,y=0,z=0; for (let k=0;k<4;k++){const n=b.tets[t+k]*3, w=b.proxyBary[p*4+k]; x+=b.pos[n]*w; y+=b.pos[n+1]*w; z+=b.pos[n+2]*w;} if (c) minD = Math.min(minD, Math.hypot(x-c.x,y-c.y,z-c.z)); }
    return c ? { px, minD: minD.toFixed(3), x: c.x.toFixed(3), y: c.y.toFixed(3), z: c.z.toFixed(3), r: c.r.toFixed(3), depth: c.depth.toFixed(4), contacts: c.contacts, h: w.rt.specimen.height.toFixed(3) } : 'no collider';
  })));
}
await page.mouse.up();
await browser.close();
