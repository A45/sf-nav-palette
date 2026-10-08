/**
 * Generate the extension icons.
 *
 * Chrome Web Store requires a 128x128 PNG inside the package, and Chrome wants
 * 16/32/48 for the toolbar and management pages. Rather than commit binaries
 * nobody can edit, they are drawn here from geometry — no dependencies, no
 * image editor, and the design lives in readable code.
 *
 *   node scripts/make-icons.mjs
 *
 * The mark is a terminal prompt — a chevron and a cursor bar — because that is
 * what the tool is: type a name, go there.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

/** Sizes Chrome asks for. 128 is the one the Web Store hard-requires. */
const SIZES = [16, 32, 48, 128];

const BG = [11, 92, 171]; // #0B5CAB — same blue as the org's Lightning app
const FG = [255, 255, 255];

/** Samples per axis. Small icons live or die on smooth edges. */
const SUPERSAMPLE = 4;

// ─── Geometry, in 0..1 coordinates so one design covers every size ───────────

const CORNER_RADIUS = 0.22;
const STROKE = 0.075;

const CHEVRON = [
  [0.3, 0.3, 0.48, 0.5],
  [0.48, 0.5, 0.3, 0.7]
];
const CURSOR = { x0: 0.55, y0: 0.62, x1: 0.74, y1: 0.7 };

function insideRoundedSquare(x, y) {
  const r = CORNER_RADIUS;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function distanceToSegment(px, py, [x0, y0, x1, y1]) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((px - x0) * dx + (py - y0) * dy) / lengthSq));
  const nx = x0 + t * dx;
  const ny = y0 + t * dy;
  return Math.hypot(px - nx, py - ny);
}

function insideGlyph(x, y) {
  const half = STROKE / 2;
  if (CHEVRON.some((segment) => distanceToSegment(x, y, segment) <= half)) return true;
  return x >= CURSOR.x0 && x <= CURSOR.x1 && y >= CURSOR.y0 && y <= CURSOR.y1;
}

// ─── Rasterise ───────────────────────────────────────────────────────────────

function renderRgba(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SUPERSAMPLE);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px * SUPERSAMPLE + sx + 0.5) * step;
          const y = (py * SUPERSAMPLE + sy + 0.5) * step;

          if (!insideRoundedSquare(x, y)) continue;
          bg += 1;
          if (insideGlyph(x, y)) fg += 1;
        }
      }

      const total = SUPERSAMPLE * SUPERSAMPLE;
      const alpha = bg / total;
      const glyph = bg === 0 ? 0 : fg / bg;

      const offset = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) {
        pixels[offset + c] = Math.round(BG[c] * (1 - glyph) + FG[c] * glyph);
      }
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }

  return pixels;
}

// ─── Minimal PNG encoder ─────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  // Each scanline is prefixed with its filter type; 0 means "none".
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ─── Run ─────────────────────────────────────────────────────────────────────

mkdirSync(OUT_DIR, { recursive: true });

for (const size of SIZES) {
  const file = join(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, encodePng(size, renderRgba(size)));
  console.log(`wrote icons/icon${size}.png`);
}
