// Builds src/data/sky.json (directions to 3 decimals, about 0.06 degrees), the real background sky of the Systems map, from the HYG star catalogue (CC BY-SA 4.0,
// https://codeberg.org/astronexus/hyg). Usage: node scripts/gen-sky.mjs <hyg_v42.csv.gz> [faintest magnitude, default 7]
// Every star at least as bright as the limit, except the Sun and stars nearer than 50 ly (their direction changes
// across the map, and the near ones are drawn as places), as a unit direction from Sol in the galactic frame and its
// apparent magnitude: [[x, y, z, mag], ...], brightest first, so a renderer can draw the first N.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [file, limitArg] = process.argv.slice(2);
if (!file) throw new Error('usage: node scripts/gen-sky.mjs <hyg csv.gz> [mag limit]');
const limit = Number(limitArg ?? 7);
const MIN_PC = 50 / 3.26156;
// Equatorial J2000 to galactic (the same matrix as src/core/map.ts).
const M = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];
const lines = gunzipSync(readFileSync(file)).toString('utf8').split('\n');
const head = lines[0].split(',').map((h) => h.replace(/"/g, ''));
const col = (n) => head.indexOf(n);
const [iMag, iDist, iX, iY, iZ] = ['mag', 'dist', 'x', 'y', 'z'].map(col);
const out = [];
for (const line of lines.slice(1)) {
  if (!line) continue;
  const c = line.split(',');
  const mag = Number(c[iMag]);
  const dist = Number(c[iDist]);
  if (!(mag <= limit) || !(dist >= MIN_PC)) continue;
  const v = [Number(c[iX]), Number(c[iY]), Number(c[iZ])];
  const n = Math.hypot(...v);
  if (!(n > 0)) continue;
  const g = M.map((r) => (r[0] * v[0] + r[1] * v[1] + r[2] * v[2]) / n);
  out.push([...g.map((x) => Math.round(x * 1e3) / 1e3), Math.round(mag * 10) / 10]);
}
out.sort((a, b) => a[3] - b[3]);
writeFileSync('src/data/sky.json', JSON.stringify(out) + '\n');
console.log(`sky.json: ${out.length} stars brighter than magnitude ${limit}`);
