/**
 * Throwaway diagnostic: does the logo PNG actually have a transparent
 * background, or is white baked into the pixels? The alpha CHANNEL being
 * present does not prove any pixel is transparent.
 *
 * Pure Node: parse chunks, inflate IDAT with zlib, unfilter scanlines.
 */

import fs from 'node:fs';
import zlib from 'node:zlib';

const FILE = process.argv[2];
const buf = fs.readFileSync(FILE);

// --- chunk walk ---------------------------------------------------------
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
const bitDepth = ihdr[8];
const colorType = ihdr[9];
const interlace = ihdr[12];

console.log(`file      : ${FILE.split(/[\\/]/).pop()}`);
console.log(`dimensions: ${width} x ${height}`);
console.log(`bitDepth  : ${bitDepth}   colorType: ${colorType}   interlace: ${interlace}`);

if (interlace !== 0) {
  console.log('interlaced - aborting, too complex for this quick check');
  process.exit(0);
}
if (bitDepth !== 8 || colorType !== 6) {
  console.log('expected 8-bit RGBA; aborting');
  process.exit(0);
}

// --- inflate + unfilter -------------------------------------------------
const raw = zlib.inflateSync(Buffer.concat(idat));
const CHANNELS = 4;
const bpp = CHANNELS; // 8-bit RGBA
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
    const rawByte = line[x];
    const a = x >= bpp ? out[x - bpp] : 0;
    const b = prior ? prior[x] : 0;
    const c = prior && x >= bpp ? prior[x - bpp] : 0;
    let value;
    switch (filter) {
      case 0: value = rawByte; break;
      case 1: value = rawByte + a; break;
      case 2: value = rawByte + b; break;
      case 3: value = rawByte + ((a + b) >> 1); break;
      case 4: {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        break;
      }
      default: throw new Error(`bad filter ${filter} on row ${y}`);
    }
    out[x] = value & 0xff;
  }
}

// --- analyse ------------------------------------------------------------
const alphaAt = (x, y) => pixels[y * stride + x * bpp + 3];
const rgbAt = (x, y) => [
  pixels[y * stride + x * bpp],
  pixels[y * stride + x * bpp + 1],
  pixels[y * stride + x * bpp + 2],
];

const corners = [
  ['top-left', 0, 0],
  ['top-right', width - 1, 0],
  ['bottom-left', 0, height - 1],
  ['bottom-right', width - 1, height - 1],
  ['centre', (width / 2) | 0, (height / 2) | 0],
];

console.log('\n--- sample points (a = alpha) ---');
for (const [name, x, y] of corners) {
  const [r, g, b] = rgbAt(x, y);
  const a = alphaAt(x, y);
  console.log(
    `  ${name.padEnd(13)} rgba(${String(r).padStart(3)},${String(g).padStart(3)},${String(b).padStart(3)},${String(a).padStart(3)})` +
      (a === 0 ? '   TRANSPARENT' : a === 255 ? '   OPAQUE' : `   semi (${((a / 255) * 100).toFixed(0)}%)`),
  );
}

let transparent = 0;
let opaqueWhite = 0;
let opaque = 0;
for (let i = 0; i < width * height; i += 1) {
  const a = pixels[i * bpp + 3];
  if (a === 0) transparent += 1;
  else if (a === 255) {
    opaque += 1;
    const r = pixels[i * bpp];
    const g = pixels[i * bpp + 1];
    const b = pixels[i * bpp + 2];
    if (r > 240 && g > 240 && b > 240) opaqueWhite += 1;
  }
}
const total = width * height;
console.log('\n--- pixel census ---');
console.log(`  fully transparent : ${((transparent / total) * 100).toFixed(1)}%  (${transparent})`);
console.log(`  fully opaque      : ${((opaque / total) * 100).toFixed(1)}%  (${opaque})`);
console.log(`  opaque AND white  : ${((opaqueWhite / total) * 100).toFixed(1)}%  (${opaqueWhite})`);

const verdict =
  opaqueWhite / total > 0.5
    ? 'VERDICT: the PNG has a BAKED-IN opaque white background.'
    : transparent / total > 0.2
      ? 'VERDICT: the PNG background IS genuinely transparent.'
      : 'VERDICT: inconclusive - mostly opaque artwork, little transparency.';
console.log(`\n  ${verdict}`);
