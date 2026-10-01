/**
 * Colour census for the logo: how many opaque pixels fall into each hue family.
 * Used to decide how a dark-mode variant should be recoloured.
 *
 * Shares the decode path with inspect-png.mjs.
 */

import fs from 'node:fs';
import zlib from 'node:zlib';

const buf = fs.readFileSync(process.argv[2]);

let offset = 8;
let ihdr = null;
const idat = [];
while (offset < buf.length) {
  const length = buf.readUInt32BE(offset);
  const type = buf.toString('ascii', offset + 4, offset + 8);
  const data = buf.subarray(offset + 8, offset + 8 + length);
  if (type === 'IHDR') ihdr = data;
  else if (type === 'IDAT') idat.push(data);
  else if (type === 'IEND') break;
  offset += 12 + length;
}

const width = ihdr.readUInt32BE(0);
const height = ihdr.readUInt32BE(4);
const raw = zlib.inflateSync(Buffer.concat(idat));
const bpp = 4;
const stride = width * bpp;
const pixels = Buffer.alloc(height * stride);
let pos = 0;

for (let y = 0; y < height; y += 1) {
  const filter = raw[pos];
  pos += 1;
  const line = raw.subarray(pos, pos + stride);
  pos += stride;
  const out = pixels.subarray(y * stride, (y + 1) * stride);
  const prior = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
  for (let x = 0; x < stride; x += 1) {
    const b = line[x];
    const a = x >= bpp ? out[x - bpp] : 0;
    const bb = prior ? prior[x] : 0;
    const c = prior && x >= bpp ? prior[x - bpp] : 0;
    let v;
    if (filter === 0) v = b;
    else if (filter === 1) v = b + a;
    else if (filter === 2) v = b + bb;
    else if (filter === 3) v = b + ((a + bb) >> 1);
    else {
      const p = a + bb - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - bb);
      const pc = Math.abs(p - c);
      v = b + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c);
    }
    out[x] = v & 0xff;
  }
}

const buckets = new Map();
let opaque = 0;
for (let i = 0; i < width * height; i += 1) {
  const a = pixels[i * bpp + 3];
  if (a < 128) continue;
  opaque += 1;
  const r = pixels[i * bpp];
  const g = pixels[i * bpp + 1];
  const b = pixels[i * bpp + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  let family;
  if (sat < 0.18) family = 'neutral/near-black';
  else if (r > 150 && g > 110 && b < 120) family = 'yellow/amber';
  else if (b > r + 25) family = 'blue';
  else if (g > r + 25) family = 'green';
  else family = 'red/other';
  buckets.set(family, (buckets.get(family) ?? 0) + 1);
}

console.log(`opaque pixels: ${opaque}\n`);
for (const [family, count] of [...buckets].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${family.padEnd(20)} ${String(count).padStart(6)}  ${((count / opaque) * 100).toFixed(1)}%`);
}

// Top exact colours, to spot the dominant brand tones.
const exact = new Map();
for (let i = 0; i < width * height; i += 1) {
  if (pixels[i * bpp + 3] < 200) continue;
  const key = [pixels[i * bpp], pixels[i * bpp + 1], pixels[i * bpp + 2]]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  exact.set(key, (exact.get(key) ?? 0) + 1);
}
console.log('\ntop 8 exact colours:');
for (const [hex, count] of [...exact].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  #${hex}  ${count}`);
}
