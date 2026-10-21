#!/usr/bin/env node
// Generates src/components/map/galaxy-disc.jpg, the face-on Milky Way drawn on the galaxy level: a greyscale map of
// discDensity() from src/components/map/galaxy-model.ts, covering the galactic centre ± TEX_HALF_PC. Column i runs
// along galactic +x, row j along galactic -y (north up when the image is laid on the plane).
//
// Usage: node scripts/gen-galaxy.mjs [size]    (default 1024; needs Node 24 for the .ts import, and macOS sips for
// the JPEG step). Deterministic: the noise is seeded.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import { discDensity, TEX_HALF_PC } from '../src/components/map/galaxy-model.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src/components/map/galaxy-disc.jpg');
const N = Number(process.argv[2] ?? 1024);

// Supersampled 2 × 2 per pixel, then tone-mapped so the arms read against the faint disc between them.
const pix = Buffer.alloc(N * N);
const step = (2 * TEX_HALF_PC) / N;
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    let v = 0;
    for (let s = 0; s < 4; s++) {
      const x = -TEX_HALF_PC + (i + 0.25 + 0.5 * (s & 1)) * step;
      const y = TEX_HALF_PC - (j + 0.25 + 0.5 * (s >> 1)) * step;
      v += discDensity(x, y);
    }
    v /= 4;
    const t = Math.pow(1 - Math.exp(-v * 1.6), 0.85);
    pix[j * N + i] = Math.max(0, Math.min(255, Math.round(t * 255)));
  }
}

// A minimal greyscale PNG.
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc = (buf) => {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0);
ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8;
ihdr[9] = 0;
const raw = Buffer.alloc(N * (N + 1));
for (let j = 0; j < N; j++) pix.copy(raw, j * (N + 1) + 1, j * N, (j + 1) * N);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'galaxy-')), 'galaxy-disc.png');
fs.writeFileSync(tmp, png);
const r = spawnSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', tmp, '--out', out], { stdio: 'inherit' });
if (r.status !== 0) {
  fs.copyFileSync(tmp, out.replace(/\.jpg$/, '.png'));
  console.error('sips failed; wrote the PNG next to the target instead');
  process.exit(1);
}
console.log(`wrote ${path.relative(root, out)} (${N} × ${N}, ${fs.statSync(out).size} bytes)`);
