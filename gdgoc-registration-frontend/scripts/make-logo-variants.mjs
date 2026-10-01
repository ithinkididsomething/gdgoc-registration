/**
 * Generates the two shipped logo variants from the untouched original.
 *
 * WHY TWO VARIANTS
 * ----------------
 * The supplied PNG is a *white* logo on transparency: 51% of its visible
 * pixels are near-white, only 7.8% are dark. It is artwork meant to sit on a
 * DARK background. Dropped onto our light neumorphic surface (#eef2f7) the
 * wordmark is effectively invisible.
 *
 * So we need one logo per theme:
 *   dark  -> the original, unchanged (white artwork reads perfectly on #232c3b)
 *   light -> a recolour where the light artwork becomes the brand navy
 *
 * Both variants are cropped to the same content bounding box. The original
 * canvas is 1109x225 (4.93:1) but the artwork only occupies 968x107 (9.05:1),
 * with 55-74px of transparent padding on all sides. Left uncropped, the two
 * variants would have different aspect ratios and the header logo would visibly
 * resize when the theme is toggled. Cropping to identical boxes prevents that.
 *
 * Transparent padding is trimmed rather than the artwork, so no visible part of
 * the design is altered.
 *
 * Pure Node: zlib for inflate/deflate, plus a hand-rolled CRC32 and PNG writer.
 *
 * Run: node scripts/make-logo-variants.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE = path.join(ROOT, 'assets-src', 'gdgoc-ietdavv-logo.png');
const OUT_DARK = path.join(ROOT, 'src', 'assets', 'gdgoc-ietdavv-logo-dark.png');
const OUT_LIGHT = path.join(ROOT, 'src', 'assets', 'gdgoc-ietdavv-logo-light.png');

// Brand navy, matches --color-navy in light mode.
const NAVY = { r: 27, g: 42, b: 74 };

// ---------------------------------------------------------------- decode ---
function decodePng(buf) {
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

  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`unsupported PNG (depth ${bitDepth}, type ${colorType}, interlace ${interlace})`);
  }

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
      const up = prior ? prior[x] : 0;
      const ul = prior && x >= bpp ? prior[x - bpp] : 0;
      let v;
      if (filter === 0) v = b;
      else if (filter === 1) v = b + a;
      else if (filter === 2) v = b + up;
      else if (filter === 3) v = b + ((a + up) >> 1);
      else if (filter === 4) {
        const p = a + up - ul;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - ul);
        v = b + (pa <= pb && pa <= pc ? a : pb <= pc ? up : ul);
      } else throw new Error(`bad filter ${filter}`);
      out[x] = v & 0xff;
    }
  }

  return { width, height, pixels, bpp };
}

// ----------------------------------------------------------------- encode ---
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Writes 8-bit RGBA, filter type 0 on every scanline. */
function encodePng({ width, height, pixels, bpp }) {
  const stride = width * bpp;
  const rawScanlines = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const dst = y * (stride + 1);
    rawScanlines[dst] = 0; // filter: None
    pixels.copy(rawScanlines, dst + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rawScanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------ colour math ---
function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h, s, l };
}

function hueToRgb(p, q, t) {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = clamp255(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  // The three channels are the same ramp sampled a third of a turn apart.
  // Omitting the 1/3 offsets rotates the whole hue circle by 120 degrees.
  const t = h / 360;
  return {
    r: clamp255(hueToRgb(p, q, t + 1 / 3) * 255),
    g: clamp255(hueToRgb(p, q, t) * 255),
    b: clamp255(hueToRgb(p, q, t - 1 / 3) * 255),
  };
}

const relativeLuminance = (r, g, b) => {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const contrast = (a, b) => {
  const la = relativeLuminance(a.r, a.g, a.b);
  const lb = relativeLuminance(b.r, b.g, b.b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const LIGHT_SURFACE = { r: 0xee, g: 0xf2, b: 0xf7 };

/**
 * Per-hue lightness targets for the light-surface variant.
 *
 * Blue, red and green land fine with a mild darkening, but yellow at its
 * original lightness is ~1.4:1 on #eef2f7 and effectively disappears, so it
 * needs a much deeper target. The Google 4-colour mark is brand identity, so
 * hues are preserved and only lightness is remapped.
 */
function lightVariantPixel(r, g, b) {
  const { h, s, l } = rgbToHsl(r, g, b);

  // Neutral / white artwork (the wordmark) -> brand navy. Alpha carries the
  // antialiasing, so internal luminance variation does not need preserving.
  if (s < 0.16) {
    if (l < 0.12) return NAVY; // already-dark pixels: keep them navy too
    return NAVY;
  }

  let targetL;
  if (h >= 30 && h <= 65) targetL = 0.3; // yellow / amber - needs the most help
  else if (h >= 70 && h <= 170) targetL = 0.3; // green
  else if (h >= 170 && h <= 290) targetL = 0.4; // blue / indigo
  else targetL = 0.4; // red / magenta

  // Keep a little of the original lightness so shading is not flattened.
  const blended = targetL * (0.86 + 0.28 * Math.min(l / targetL, 1));
  return hslToRgb(h, Math.min(1, s * 1.15), Math.min(0.72, blended));
}

// ------------------------------------------------------------------- main ---
const original = decodePng(fs.readFileSync(SOURCE));
const { width, height, pixels, bpp } = original;
const stride = width * bpp;

// Content bounding box, using alpha >= 1 so no faint edge is ever clipped.
let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    if (pixels[y * stride + x * bpp + 3] === 0) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}

const PAD = 2; // 2px breathing room so cropping never touches a real edge
const cropX = Math.max(0, minX - PAD);
const cropY = Math.max(0, minY - PAD);
const cropW = Math.min(width - cropX, maxX - minX + 1 + PAD * 2);
const cropH = Math.min(height - cropY, maxY - minY + 1 + PAD * 2);

console.log(`source      : ${width} x ${height}`);
console.log(`content box : x ${minX}-${maxX}, y ${minY}-${maxY}  (${maxX - minX + 1} x ${maxY - minY + 1})`);
console.log(`cropped to  : ${cropW} x ${cropH}  (aspect ${(cropW / cropH).toFixed(2)}:1)`);

const darkOut = Buffer.alloc(cropW * cropH * bpp);
const lightOut = Buffer.alloc(cropW * cropH * bpp);

for (let y = 0; y < cropH; y += 1) {
  for (let x = 0; x < cropW; x += 1) {
    const src = (cropY + y) * stride + (cropX + x) * bpp;
    const dst = (y * cropW + x) * bpp;
    const a = pixels[src + 3];
    darkOut[dst] = pixels[src];
    darkOut[dst + 1] = pixels[src + 1];
    darkOut[dst + 2] = pixels[src + 2];
    darkOut[dst + 3] = a;

    const recoloured = lightVariantPixel(pixels[src], pixels[src + 1], pixels[src + 2]);
    lightOut[dst] = recoloured.r;
    lightOut[dst + 1] = recoloured.g;
    lightOut[dst + 2] = recoloured.b;
    lightOut[dst + 3] = a;
  }
}

const darkPng = encodePng({ width: cropW, height: cropH, pixels: darkOut, bpp });
const lightPng = encodePng({ width: cropW, height: cropH, pixels: lightOut, bpp });

fs.mkdirSync(path.dirname(OUT_DARK), { recursive: true });
fs.writeFileSync(OUT_DARK, darkPng);
fs.writeFileSync(OUT_LIGHT, lightPng);

console.log(`\nwrote ${path.relative(ROOT, OUT_DARK)}  ${(darkPng.length / 1024).toFixed(1)} KB`);
console.log(`wrote ${path.relative(ROOT, OUT_LIGHT)} ${(lightPng.length / 1024).toFixed(1)} KB`);

// Report the legibility of the wordmark on the light surface, so the recolour
// is verified by measurement rather than assumed.
const navyContrast = contrast(NAVY, LIGHT_SURFACE);
console.log(`\nlight-surface check (wordmark navy on #eef2f7): ${navyContrast.toFixed(2)}:1`);
for (const [name, h, l] of [
  ['blue  ', 217, 0.4],
  ['red   ', 4, 0.4],
  ['yellow', 45, 0.3],
  ['green ', 136, 0.3],
]) {
  const c = hslToRgb(h, 0.8, l);
  const r = contrast(c, LIGHT_SURFACE);
  console.log(
    `  ${name} -> rgb(${c.r},${c.g},${c.b})  ${r.toFixed(2)}:1  ${r >= 3 ? 'OK for a mark' : 'TOO FAINT'}`,
  );
}
