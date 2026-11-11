/**
 * Downsample a studio HDRI to 512x256 for reflections (glossy surfaces don't need more),
 * written as flat RGBE so three's HDRLoader reads it. Source: Poly Haven (CC0).
 *   node scripts/prep-hdri.mjs <in.hdr> public/env/studio.hdr
 */
import fs from 'node:fs';
import { FloatType } from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const [input, output, outW = '512'] = process.argv.slice(2);
const loader = new HDRLoader().setDataType(FloatType);
const buf = fs.readFileSync(input);
const tex = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const { width: W, height: H, data } = tex; // RGBA float
const w = Number(outW);
const h = w / 2;
const sx = W / w, sy = H / h;
const out = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = Math.floor(y * sy); yy < Math.floor((y + 1) * sy); yy++) {
      for (let xx = Math.floor(x * sx); xx < Math.floor((x + 1) * sx); xx++) {
        const i = (yy * W + xx) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
    }
    r /= n; g /= n; b /= n;
    // Float RGB → RGBE.
    const m = Math.max(r, g, b);
    const o = (y * w + x) * 4;
    if (m < 1e-32) continue;
    const e = Math.ceil(Math.log2(m) + 1e-9);
    const f = 256 / 2 ** e;
    out[o] = Math.min(255, Math.floor(r * f));
    out[o + 1] = Math.min(255, Math.floor(g * f));
    out[o + 2] = Math.min(255, Math.floor(b * f));
    out[o + 3] = e + 128;
  }
}
const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`;
fs.writeFileSync(output, Buffer.concat([Buffer.from(header, 'ascii'), out]));
console.log(`${W}x${H} → ${w}x${h}, ${(fs.statSync(output).size / 1024).toFixed(0)} KB`);
