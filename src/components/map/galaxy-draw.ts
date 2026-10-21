// Drawing the Milky Way and the Magellanic Clouds on the galaxy level (model in galaxy-model.ts). Worklets, called
// from drawScene with the live camera. Everything is ink: the brightness of the light becomes coverage of the ink
// colour, so the galaxy glows white on the dark map and reads as soft graphite on the light one.
import { BlendMode, FilterMode, MipmapMode, PointMode, Skia, StrokeCap, TileMode, VertexMode, type SkCanvas, type SkImage, type SkPaint } from '@shopify/react-native-skia';

import type { Camera } from '@/core';

import { DISC_RADIUS_PC, GALACTIC_CENTRE, TEX_HALF_PC, type Blob, type GalaxyScene } from './galaxy-model';

interface Theme {
  ink: string;
  dark: boolean;
}

/** Steps of a Gaussian from its centre to 3σ, for the radial gradient that draws one. */
const GAUSS_STOPS = [0, 0.4, 0.8, 1.2, 1.6, 2, 2.5, 3];

/** Same maths as proj() in draw.ts (kept here so the two modules do not import each other). */
function proj(x: number, y: number, z: number, cam: Camera): { x: number; y: number } {
  'worklet';
  const dx = x - cam.center.x;
  const dy = y - cam.center.y;
  const dz = z - cam.center.z;
  const c = Math.cos(cam.yaw);
  const s = Math.sin(cam.yaw);
  const ry = dx * s + dy * c;
  return { x: cam.cx + (dx * c - dy * s) * cam.scale, y: cam.cy - (ry * Math.cos(cam.tilt) + dz * Math.sin(cam.tilt)) * cam.scale };
}

/** The face-on disc texture laid on the galactic plane (z = 0), drawn as one textured quad: an orthographic view of
 * a plane is an affine map, so two triangles are exact at every angle. */
export function drawDiscTexture(canvas: SkCanvas, img: SkImage, cam: Camera, ink: string, alpha: number) {
  'worklet';
  const H = TEX_HALF_PC;
  const { x, y } = GALACTIC_CENTRE;
  const a = proj(x - H, y + H, 0, cam);
  const b = proj(x + H, y + H, 0, cam);
  const c = proj(x + H, y - H, 0, cam);
  const d = proj(x - H, y - H, 0, cam);
  const iw = img.width();
  const ih = img.height();
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setShader(img.makeShaderOptions(TileMode.Decal, TileMode.Decal, FilterMode.Linear, MipmapMode.Linear));
  p.setColorFilter(Skia.ColorFilter.MakeCompose(Skia.ColorFilter.MakeBlend(Skia.Color(ink), BlendMode.SrcIn), Skia.ColorFilter.MakeLumaColorFilter()));
  p.setAlphaf(alpha);
  const pos = [
    { x: a.x, y: a.y },
    { x: b.x, y: b.y },
    { x: c.x, y: c.y },
    { x: d.x, y: d.y },
  ];
  const tex = [
    { x: 0, y: 0 },
    { x: iw, y: 0 },
    { x: iw, y: ih },
    { x: 0, y: ih },
  ];
  canvas.drawVertices(Skia.MakeVertices(VertexMode.Triangles, pos, tex, undefined, [0, 1, 2, 0, 2, 3], true), BlendMode.SrcOver, p);
}

/** A 3D Gaussian glow, projected exactly: its screen covariance is P Σ Pᵀ, drawn as a radial gradient on the quad
 * spanned by the covariance's principal axes (± 3σ). Seen through more of it (a disc edge-on) it is brighter, as the
 * light along the line of sight adds up. */
export function drawBlob(canvas: SkCanvas, bl: Blob, cam: Camera, ink: string, k: number, w: number, h: number) {
  'worklet';
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const ct = Math.cos(cam.tilt);
  const st = Math.sin(cam.tilt);
  const s = cam.scale;
  // Rows of the projection (screen points per parsec).
  const px = [s * cy, -s * sy, 0];
  const py = [-s * sy * ct, -s * cy * ct, -s * st];
  const [xx, xy, xz, yy, yz, zz] = bl.cov;
  const S = [
    [xx, xy, xz],
    [xy, yy, yz],
    [xz, yz, zz],
  ];
  const quad = (u: number[], v: number[]) => {
    let r = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r += u[i] * S[i][j] * v[j];
    return r;
  };
  const A = quad(px, px);
  const B = quad(px, py);
  const D = quad(py, py);
  const mid = (A + D) / 2;
  const dif = Math.sqrt(((A - D) / 2) ** 2 + B * B);
  const l1 = Math.max(0.16, mid + dif);
  const l2 = Math.max(0.16, mid - dif);
  const phi = 0.5 * Math.atan2(2 * B, A - D);
  const c = proj(bl.c.x, bl.c.y, bl.c.z, cam);
  const r1 = 3 * Math.sqrt(l1);
  const r2 = 3 * Math.sqrt(l2);
  if (r1 < 0.6 || c.x + r1 < 0 || c.y + r1 < 0 || c.x - r1 > w || c.y - r1 > h) return;
  // Brightness against the face-on view: the projected area shrinks as the line of sight through it grows.
  const face = Math.sqrt(Math.max(1, xx * yy - xy * xy)) * s * s;
  const gain = Math.min(2.4, Math.max(0.6, face / Math.max(1e-6, Math.sqrt(l1 * l2))));
  const alpha = Math.min(0.92, bl.alpha * k * gain);
  if (alpha < 0.004) return;
  const e1x = Math.cos(phi) * r1;
  const e1y = Math.sin(phi) * r1;
  const e2x = -Math.sin(phi) * r2;
  const e2y = Math.cos(phi) * r2;
  const pos = [
    { x: c.x - e1x - e2x, y: c.y - e1y - e2y },
    { x: c.x + e1x - e2x, y: c.y + e1y - e2y },
    { x: c.x + e1x + e2x, y: c.y + e1y + e2y },
    { x: c.x - e1x + e2x, y: c.y - e1y + e2y },
  ];
  const tex = [
    { x: -3, y: -3 },
    { x: 3, y: -3 },
    { x: 3, y: 3 },
    { x: -3, y: 3 },
  ];
  const col = Skia.Color(ink);
  const colours = GAUSS_STOPS.map((r) => {
    const q = Float32Array.from(col);
    q[3] = alpha * Math.exp(-(r * r) / 2) * (r >= 3 ? 0 : 1);
    return q;
  });
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setShader(Skia.Shader.MakeRadialGradient({ x: 0, y: 0 }, 3, colours, GAUSS_STOPS.map((r) => r / 3), TileMode.Clamp));
  canvas.drawVertices(Skia.MakeVertices(VertexMode.Triangles, pos, tex, undefined, [0, 1, 2, 0, 2, 3], true), BlendMode.SrcOver, p);
}

/** The star cloud, in a few batches by brightness (one points call each). */
export function drawStars(canvas: SkCanvas, stars: number[], cam: Camera, ink: string, k: number, size: number, w: number, h: number) {
  'worklet';
  const LEVELS = 5;
  const levels: { x: number; y: number }[][] = [];
  for (let l = 0; l < LEVELS; l++) levels.push([]);
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const ct = Math.cos(cam.tilt);
  const st = Math.sin(cam.tilt);
  const s = cam.scale;
  const { x: ox, y: oy, z: oz } = cam.center;
  for (let i = 0; i < stars.length; i += 4) {
    const dx = stars[i] - ox;
    const dy = stars[i + 1] - oy;
    const dz = stars[i + 2] - oz;
    const sx = cam.cx + (dx * cy - dy * sy) * s;
    const yy = cam.cy - ((dx * sy + dy * cy) * ct + dz * st) * s;
    if (sx < -4 || yy < -4 || sx > w + 4 || yy > h + 4) continue;
    levels[Math.min(LEVELS - 1, Math.floor(stars[i + 3] * LEVELS))].push({ x: sx, y: yy });
  }
  const paints: SkPaint[] = [];
  for (let l = 0; l < LEVELS; l++) {
    if (!levels[l].length) continue;
    const b = (l + 0.5) / LEVELS;
    const p = paints[l] ?? Skia.Paint();
    p.setAntiAlias(true);
    p.setColor(Skia.Color(ink));
    p.setAlphaf(Math.min(1, k * (0.18 + 0.7 * b)));
    p.setStrokeWidth(size * (0.6 + 1.4 * b * b));
    p.setStrokeCap(StrokeCap.Round);
    paints[l] = p;
    canvas.drawPoints(PointMode.Points, levels[l], p);
  }
}

/** The whole galaxy: glows, the face-on disc, then the stars. Zoomed out, the stars are smaller and fainter so the
 * glow carries the shape; zoomed in, they carry the depth. */
/** `fade` scales the stars, `glow` the glows and the disc (they fade in further out). */
export function drawGalaxy(canvas: SkCanvas, g: GalaxyScene, disc: SkImage | null, cam: Camera, T: Theme, w: number, h: number, fade = 1, glow = 1) {
  'worklet';
  const k = (T.dark ? 1 : 0.75) * fade;
  const kg = (T.dark ? 1 : 0.75) * glow;
  const discPt = DISC_RADIUS_PC * cam.scale;
  const near = Math.max(0, Math.min(1, (discPt - 120) / 600));
  if (kg > 0.01) {
    for (const bl of g.blobs) drawBlob(canvas, bl, cam, T.ink, kg * 0.85, w, h);
    if (disc) drawDiscTexture(canvas, disc, cam, T.ink, (T.dark ? 0.9 : 0.6) * glow);
  }
  drawStars(canvas, g.stars, cam, T.ink, k * (0.3 + 0.45 * near), 0.55 + 0.6 * near, w, h);
}
