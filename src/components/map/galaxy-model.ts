// The Milky Way and the Magellanic Clouds as drawn on the galaxy level: a schematic model at true scale, in the
// galactic frame (parsecs from Sol; x towards the galactic centre, y towards l = 90°, z towards the north galactic
// pole). Real astronomy only, the same at every reading position, so it can never hint at a place still to come.
//
// Three parts, drawn together by draw.ts:
//   - the face-on disc (arms, dust lanes, star-forming knots, bar): a greyscale texture made from discDensity() by
//     scripts/gen-galaxy.mjs, laid on the galactic plane;
//   - glows (BLOBS): 3D Gaussians for the bulge, the bar, the disc's thickness and the Magellanic Clouds, which
//     project exactly to 2D Gaussians at every angle;
//   - stars (makeStars()): a seeded cloud of points sampled from the same model, which gives the disc and the bulge
//     their depth when the view is tilted towards edge-on.
// No imports, so the Node script can load this file as it is.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Galactic centre (Sagittarius A*), parsecs from Sol along +x. */
export const GALACTIC_CENTRE: Vec3 = { x: 8178, y: 0, z: 0 };
/** Radius of the Milky Way's disc, parsecs (about 15 kpc). */
export const DISC_RADIUS_PC = 15000;
/** The disc texture covers the galactic centre ± this many parsecs. */
export const TEX_HALF_PC = 16000;

/** Spiral arms: logarithmic, 12 degree pitch, from 3 kpc out to the disc's edge; four arms, phased so the Sun lies
 * between two of them, as it does in the Orion Spur. Arms 0 and 2 are the major arms. */
export const ARM_B = Math.tan((12 * Math.PI) / 180);
export const ARM_R0 = 3000;
export const ARM_PHASE = Math.PI * 1.25 - Math.log(GALACTIC_CENTRE.x / ARM_R0) / ARM_B;
const ARM_STRENGTH = [1, 0.55, 1, 0.55];
/** The bar: its near end points towards positive longitudes, about 27° from the Sun–centre line. */
const BAR_ANGLE = Math.PI - (27 * Math.PI) / 180;

// ---------------------------------------------------------------------------------------------------------------
// Noise (deterministic value noise), for clumpy arms.

function hash2(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j);
  const b = hash2(i + 1, j);
  const c = hash2(i, j + 1);
  const d = hash2(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal noise, 0–1, with features about `cell` parsecs across and finer. */
function fbm(x: number, y: number, cell: number): number {
  let s = 0;
  let amp = 0.5;
  let f = 1 / cell;
  for (let o = 0; o < 4; o++) {
    s += amp * valueNoise(x * f + o * 17.3, y * f - o * 9.1);
    f *= 2.1;
    amp *= 0.5;
  }
  return s / 0.9375;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The face-on disc.

/** Angular offset of (r, th) from an arm, wrapped to ±π; positive on the arm's inner (concave) side. */
function armOffset(r: number, th: number, phase: number): number {
  const d = th - (phase + Math.log(r / ARM_R0) / ARM_B);
  return d - 2 * Math.PI * Math.round(d / (2 * Math.PI));
}

/** How strongly (r, th) lies on a spiral arm (0–1), and how much dust lies there (0–1). r in parsecs from the
 * centre. */
export function armAt(r: number, th: number): { arm: number; dust: number } {
  if (r < ARM_R0 * 0.8) return { arm: 0, dust: 0 };
  const start = Math.min(1, (r - ARM_R0 * 0.8) / (ARM_R0 * 0.6));
  const sinP = Math.sin(Math.atan(ARM_B));
  const w = 320 + 0.035 * r;
  let arm = 0;
  let dust = 0;
  for (let i = 0; i < 4; i++) {
    const across = r * armOffset(r, th, ARM_PHASE + (i * Math.PI) / 2) * sinP;
    const k = ARM_STRENGTH[i] * start;
    arm = Math.max(arm, k * Math.exp(-(across * across) / (2 * w * w)));
    // The dust lane runs along the inner edge.
    const dl = across - 0.9 * w;
    dust = Math.max(dust, k * Math.exp(-(dl * dl) / (2 * (0.28 * w) ** 2)));
  }
  // The Orion Spur, the short arm the Sun is in: a fainter segment just outside the Sun's radius.
  if (r > 6500 && r < 10500) {
    const d = th - (Math.PI + Math.log(r / 8350) / ARM_B);
    const across = r * (d - 2 * Math.PI * Math.round(d / (2 * Math.PI))) * sinP;
    const fade = Math.sin(((r - 6500) / 4000) * Math.PI);
    arm = Math.max(arm, 0.32 * fade * Math.exp(-(across * across) / (2 * 260 * 260)));
  }
  return { arm, dust };
}

/** Star-forming knots along the arms (seeded), binned by kilometre-parsec cell for discDensity(). */
const KNOT_CELL = 1000;
const KNOTS: Map<string, number[]> = (() => {
  const rnd = mulberry32(7);
  const bins = new Map<string, number[]>();
  const sinP = Math.sin(Math.atan(ARM_B));
  for (let n = 0; n < 900; n++) {
    const i = Math.floor(rnd() * 4);
    if (rnd() > ARM_STRENGTH[i]) continue;
    const r = ARM_R0 * 1.1 + (DISC_RADIUS_PC - ARM_R0 * 1.1) * Math.pow(rnd(), 1.3);
    const w = 320 + 0.035 * r;
    const across = (rnd() + rnd() + rnd() - 1.5) * w * 0.9;
    const th = ARM_PHASE + (i * Math.PI) / 2 + Math.log(r / ARM_R0) / ARM_B + across / (r * sinP);
    const x = r * Math.cos(th);
    const y = r * Math.sin(th);
    const size = 50 + 110 * rnd() * rnd();
    const k = (0.4 + 0.9 * rnd()) * Math.exp(-r / 9000);
    const key = `${Math.floor(x / KNOT_CELL)},${Math.floor(y / KNOT_CELL)}`;
    const list = bins.get(key) ?? [];
    list.push(x, y, size, k);
    bins.set(key, list);
  }
  return bins;
})();

function knotsAt(x: number, y: number): number {
  const ci = Math.floor(x / KNOT_CELL);
  const cj = Math.floor(y / KNOT_CELL);
  let v = 0;
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      const list = KNOTS.get(`${ci + a},${cj + b}`);
      if (!list) continue;
      for (let k = 0; k < list.length; k += 4) {
        const dx = x - list[k];
        const dy = y - list[k + 1];
        const s = list[k + 2];
        const d2 = (dx * dx + dy * dy) / (2 * s * s);
        if (d2 < 9) v += list[k + 3] * Math.exp(-d2);
      }
    }
  }
  return v;
}

/** Surface brightness of the face-on disc at (x, y), parsecs from the galactic centre, in rough linear units. */
export function discDensity(x: number, y: number): number {
  const r = Math.hypot(x, y);
  if (r > TEX_HALF_PC) return 0;
  const th = Math.atan2(y, x);
  // Exponential disc (3 kpc scale length), hollowed inside the bar's reach, faded to nothing past 15 kpc.
  const edge = Math.max(0, Math.min(1, (TEX_HALF_PC - r) / (TEX_HALF_PC - DISC_RADIUS_PC + 2000)));
  const hole = 0.3 + 0.7 * Math.min(1, (r / 3500) ** 2);
  const disc = Math.exp(-r / 3600) * hole * edge * edge;
  const { arm, dust } = armAt(r, th);
  // Streaks along the arms: noise stretched along the spiral (log r runs along it) and fine across it.
  const along = Math.log(Math.max(r, 500)) * 14;
  const spin = th - Math.log(Math.max(r, 500) / ARM_R0) / ARM_B;
  const streak = fbm(along * 40, spin * 900, 90);
  const clump = fbm(x, y, 1400);
  let v = disc * (0.22 + 1.6 * arm * (0.35 + 0.75 * streak) * (0.6 + 0.6 * clump));
  v *= 1 - 0.7 * dust * (0.4 + 0.8 * streak);
  v += disc * 2.6 * knotsAt(x, y) * (0.3 + arm);
  // The bar and the bulge, seen face-on.
  const bc = Math.cos(BAR_ANGLE);
  const bs = Math.sin(BAR_ANGLE);
  const a = x * bc + y * bs;
  const sd = -x * bs + y * bc;
  v += 1.0 * Math.exp(-((a / 2600) ** 2 + (sd / 850) ** 2) / 2);
  v += 2.0 * Math.exp(-(r * r) / (2 * 650 * 650));
  return v;
}

// ---------------------------------------------------------------------------------------------------------------
// Glows: 3D Gaussians. cov is the covariance (pc²) as [xx, xy, xz, yy, yz, zz]; alpha is the strength at the centre.

export interface Blob {
  c: Vec3;
  cov: number[];
  alpha: number;
}

/** What the scene carries for the galaxy level. */
export interface GalaxyScene {
  /** Flat [x, y, z, brightness 0–1, …], galactic frame, parsecs. */
  stars: number[];
  blobs: Blob[];
}

/** Covariance of a Gaussian with standard deviations s along the orthonormal axes u, v, w. */
function covOf(u: Vec3, v: Vec3, w: Vec3, s: [number, number, number]): number[] {
  const ax = [u, v, w];
  const out = [0, 0, 0, 0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const a = ax[k];
    const q = s[k] * s[k];
    out[0] += q * a.x * a.x;
    out[1] += q * a.x * a.y;
    out[2] += q * a.x * a.z;
    out[3] += q * a.y * a.y;
    out[4] += q * a.y * a.z;
    out[5] += q * a.z * a.z;
  }
  return out;
}

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
/** Point at galactic longitude and latitude (degrees) and distance (pc) from Sol. */
const lbd = (l: number, b: number, d: number): Vec3 => {
  const lr = (l * Math.PI) / 180;
  const br = (b * Math.PI) / 180;
  return { x: d * Math.cos(br) * Math.cos(lr), y: d * Math.cos(br) * Math.sin(lr), z: d * Math.sin(br) };
};

/** The Large and Small Magellanic Clouds (positions from SIMBAD; sizes and shapes rounded). */
export const LMC_CENTRE = lbd(280.47, -32.89, 49970);
export const SMC_CENTRE = lbd(302.8, -44.3, 62000);

/** The LMC's disc is seen about 35° from face-on; the SMC is drawn out along the line of sight. */
function magellanicAxes() {
  const losL = norm(LMC_CENTRE);
  const side = norm(cross(losL, { x: 0, y: 0, z: 1 }));
  const up = cross(side, losL);
  const inc = (35 * Math.PI) / 180;
  // The disc's normal, tipped 35° from the line of sight; its two in-plane axes.
  const n = norm({ x: losL.x * Math.cos(inc) + up.x * Math.sin(inc), y: losL.y * Math.cos(inc) + up.y * Math.sin(inc), z: losL.z * Math.cos(inc) + up.z * Math.sin(inc) });
  const a = norm(cross(n, side));
  const b = cross(n, a);
  const losS = norm(SMC_CENTRE);
  const sSide = norm(cross(losS, { x: 0, y: 0, z: 1 }));
  const sUp = cross(sSide, losS);
  return { lmc: { a, b, n, side }, smc: { los: losS, side: sSide, up: sUp } };
}
const MC = magellanicAxes();

const X: Vec3 = { x: 1, y: 0, z: 0 };
const Y: Vec3 = { x: 0, y: 1, z: 0 };
const Z: Vec3 = { x: 0, y: 0, z: 1 };
const BAR_U: Vec3 = { x: Math.cos(BAR_ANGLE), y: Math.sin(BAR_ANGLE), z: 0 };
const BAR_V: Vec3 = { x: -Math.sin(BAR_ANGLE), y: Math.cos(BAR_ANGLE), z: 0 };

export const BLOBS: Blob[] = [
  // The disc's thickness: a soft flattened glow, the band seen edge-on.
  { c: GALACTIC_CENTRE, cov: covOf(X, Y, Z, [5200, 5200, 300]), alpha: 0.22 },
  { c: GALACTIC_CENTRE, cov: covOf(X, Y, Z, [7000, 7000, 900]), alpha: 0.08 },
  // The bar, then the bulge round the centre.
  { c: GALACTIC_CENTRE, cov: covOf(BAR_U, BAR_V, Z, [2400, 850, 600]), alpha: 0.45 },
  { c: GALACTIC_CENTRE, cov: covOf(X, Y, Z, [900, 900, 700]), alpha: 0.7 },
  { c: GALACTIC_CENTRE, cov: covOf(X, Y, Z, [260, 260, 220]), alpha: 0.6 },
  // The LMC: its disc and its bar.
  { c: LMC_CENTRE, cov: covOf(MC.lmc.a, MC.lmc.b, MC.lmc.n, [1700, 1500, 350]), alpha: 0.3 },
  { c: LMC_CENTRE, cov: covOf(MC.lmc.a, MC.lmc.b, MC.lmc.n, [900, 280, 220]), alpha: 0.5 },
  { c: LMC_CENTRE, cov: covOf(MC.lmc.a, MC.lmc.b, MC.lmc.n, [500, 400, 200]), alpha: 0.35 },
  // The SMC.
  { c: SMC_CENTRE, cov: covOf(MC.smc.los, MC.smc.side, MC.smc.up, [2600, 700, 900]), alpha: 0.32 },
  { c: SMC_CENTRE, cov: covOf(MC.smc.los, MC.smc.side, MC.smc.up, [1000, 350, 450]), alpha: 0.3 },
];

// ---------------------------------------------------------------------------------------------------------------
// Stars: a seeded cloud of points, flat [x, y, z, brightness 0–1, …] in the galactic frame.

export function makeStars(count = 9000): number[] {
  const rnd = mulberry32(20261020);
  const gauss = () => {
    const u = Math.max(1e-9, rnd());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };
  // Vertical position with a sech² profile of scale height h.
  const sech2 = (h: number) => {
    const u = rnd() * 2 - 1;
    return h * Math.atanh(Math.max(-0.999, Math.min(0.999, u)));
  };
  const out: number[] = [];
  const push = (p: Vec3, b: number) => out.push(Math.round(p.x), Math.round(p.y), Math.round(p.z), Math.round(b * 100) / 100);
  const G = GALACTIC_CENTRE;

  // The disc: radii from the exponential profile, kept more often on the arms; young arm stars brighter and flatter.
  const discN = Math.round(count * 0.66);
  for (let n = 0, tries = 0; n < discN && tries < discN * 40; tries++) {
    const r = -3000 * Math.log(Math.max(1e-6, rnd())) + 600 * rnd();
    if (r > DISC_RADIUS_PC + 800) continue;
    const th = rnd() * 2 * Math.PI;
    const { arm, dust } = armAt(r, th);
    const keep = (0.16 + 0.84 * arm) * (1 - 0.5 * dust) * Math.min(1, (r / 2500) ** 2 + 0.25);
    if (rnd() > keep) continue;
    const young = arm > 0.5 && rnd() < 0.6;
    const z = young ? sech2(110) : rnd() < 0.85 ? sech2(300) : sech2(900);
    const b = young ? 0.45 + 0.55 * rnd() : 0.12 + 0.45 * rnd() * rnd();
    push({ x: G.x + r * Math.cos(th), y: G.y + r * Math.sin(th), z }, b);
    n++;
  }
  // The bar and the bulge.
  const bulgeN = Math.round(count * 0.18);
  for (let n = 0; n < bulgeN; n++) {
    const barred = rnd() < 0.55;
    const a = gauss() * (barred ? 2300 : 1000);
    const s = gauss() * (barred ? 800 : 1000);
    const z = gauss() * (barred ? 550 : 750);
    push({ x: G.x + a * BAR_U.x + s * BAR_V.x, y: G.y + a * BAR_U.y + s * BAR_V.y, z }, 0.2 + 0.6 * rnd() * rnd());
  }
  // The stellar halo: sparse and faint, out to about 30 kpc.
  const haloN = Math.round(count * 0.04);
  for (let n = 0; n < haloN; n++) {
    const r = 2000 + 26000 * rnd() ** 2.2;
    const ct = rnd() * 2 - 1;
    const ph = rnd() * 2 * Math.PI;
    const st = Math.sqrt(1 - ct * ct);
    push({ x: G.x + r * st * Math.cos(ph), y: G.y + r * st * Math.sin(ph), z: r * ct * 0.8 }, 0.1 + 0.3 * rnd());
  }
  // The Magellanic Clouds, and the bridge of gas and stars between them.
  const lmcN = Math.round(count * 0.05);
  for (let n = 0; n < lmcN; n++) {
    const barred = rnd() < 0.3;
    const u = gauss() * (barred ? 900 : 1600);
    const v = gauss() * (barred ? 300 : 1400);
    const w = gauss() * (barred ? 200 : 300);
    const { a, b, n: nn } = MC.lmc;
    const c = LMC_CENTRE;
    push({ x: c.x + u * a.x + v * b.x + w * nn.x, y: c.y + u * a.y + v * b.y + w * nn.y, z: c.z + u * a.z + v * b.z + w * nn.z }, 0.15 + 0.6 * rnd() * rnd());
  }
  const smcN = Math.round(count * 0.02);
  for (let n = 0; n < smcN; n++) {
    const u = gauss() * 2600;
    const v = gauss() * 700;
    const w = gauss() * 900;
    const { los, side, up } = MC.smc;
    const c = SMC_CENTRE;
    push({ x: c.x + u * los.x + v * side.x + w * up.x, y: c.y + u * los.y + v * side.y + w * up.y, z: c.z + u * los.z + v * side.z + w * up.z }, 0.15 + 0.5 * rnd() * rnd());
  }
  const bridgeN = Math.round(count * 0.01);
  for (let n = 0; n < bridgeN; n++) {
    const f = rnd();
    const L = LMC_CENTRE;
    const S = SMC_CENTRE;
    push({ x: L.x + (S.x - L.x) * f + gauss() * 900, y: L.y + (S.y - L.y) * f + gauss() * 900, z: L.z + (S.z - L.z) * f + gauss() * 900 }, 0.08 + 0.2 * rnd());
  }
  return out;
}
