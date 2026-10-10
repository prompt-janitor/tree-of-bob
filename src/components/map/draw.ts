// Drawing the map scene with the live camera. Runs as a worklet (UI thread on native) every time the camera moves,
// recording one Skia picture; React does not re-render while the map turns, tilts or zooms. Order: the galaxy disc
// (galaxy level), the floor (the infinite horizontal plane through the camera centre: a darker shade inside the
// viewport globe, a lighter one outside, distance rings), the viewport globe (fixed on the screen, turning with the
// camera), drop lines and feet,
// travel history, then what is in the air (SCUT, ghosts, voyages, hops), places, the narrator's puck, the scale bar,
// labels, and edge markers for occupied places off screen.
import { BlurStyle, FillType, PaintStyle, Skia, StrokeCap, TileMode, type SkCanvas, type SkFont, type SkPaint, type SkPathEffect } from '@shopify/react-native-skia';

import type { Camera, Vec3 } from '@/core';

import { COMPASS_R, compassAt, DIM, GALACTIC_CENTRE, PIP_GAP, lyLabel, pipOffset, scaleBarFor, viewportDiameter, type Font, type LabelLine, type Scene, type SceneNode } from './scene';

/** Radius of the viewport globe as a fraction of the free map area's shorter side. */
export const GLOBE_K = 0.45;

export interface Fonts {
  label: SkFont;
  line2: SkFont;
  small: SkFont;
}

export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface DrawOptions {
  /** Strength (0–1) of the drop lines that show only while the camera moves; places marked `drop` always have theirs. */
  drops: number;
  /** Zoomed out far below the fit: pips become counts, most voyage labels hide. */
  far: boolean;
  /** The map area not covered by other UI: labels stay inside it and edge markers sit on its border. */
  box: Box;
  /** Floating controls over the map (header card, buttons, pill): no label is placed under them. */
  chrome: Box[];
  /** The distance scale bar's fixed spot (its left end), bottom left of the map. */
  scaleBar: { x: number; y: number } | null;
  /** The length (ly) the scale bar showed before; kept while its bar stays within SCALE_BAR_KEEP (0: none yet). */
  scaleBarLy?: number;
  /** Words before the viewport diameter under the scale bar: "Viewport ⌀ " when the map font has the ⌀ glyph, else
   * "Viewport diameter ". */
  viewportPrefix?: string;
  /** Filled in for hit testing (taps run the drawing once into a throwaway picture): every pip and every name in a
   * label as drawn, so a tap opens exactly what is on the screen. */
  hits?: DrawHit[];
}

/** Something drawn that a tap opens: a person's pip (a point, crowd: its place, opened instead when the pips are
 * crowded) or his dot and name in a label (a rectangle, crowd null). */
export interface DrawHit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  crowd: string | null;
}

/** Width of a person's mark (dot or hollow square) and its gap before the name, and the gap between names. */
const MARK_W = 10;
const RUN_GAP = 8;

/** Screen width of a label line: its text, or its runs with their marks. */
export function lineWidth(l: LabelLine, f: SkFont): number {
  'worklet';
  if (!l.runs) return f.getTextWidth(l.text);
  let wsum = 0;
  for (let i = 0; i < l.runs.length; i++) {
    const r = l.runs[i];
    wsum += (i > 0 ? RUN_GAP : 0) + (r.mark !== undefined ? MARK_W : 0) + f.getTextWidth(r.text);
  }
  return wsum;
}

/** Same maths as project() in src/core/map.ts, inlined so it can run as a worklet. */
export function proj(x: number, y: number, z: number, cam: Camera): { x: number; y: number; depth: number } {
  'worklet';
  const dx = x - cam.center.x;
  const dy = y - cam.center.y;
  const dz = z - cam.center.z;
  const c = Math.cos(cam.yaw);
  const s = Math.sin(cam.yaw);
  const rx = dx * c - dy * s;
  const ry = dx * s + dy * c;
  const ct = Math.cos(cam.tilt);
  const st = Math.sin(cam.tilt);
  const up = ry * ct + dz * st;
  return { x: cam.cx + rx * cam.scale, y: cam.cy - up * cam.scale, depth: dz * ct - ry * st };
}

/** Depth cue for a place marker: nearer the viewer slightly larger and stronger, further slightly smaller and lighter.
 * `depthPt` is the projected depth in screen points (depth × scale) and `reach` the distance at which the cue is full.
 * The range is gentle (size 0.85–1.15, alpha 0.7–1) so markers, pips and labels stay legible. The alpha comes in steps
 * of 0.05 so a frame needs only a handful of distinct paints. */
export function depthCue(depthPt: number, reach: number): { size: number; alpha: number } {
  'worklet';
  const t = Math.max(-1, Math.min(1, depthPt / Math.max(1, reach)));
  return { size: 1 + 0.15 * t, alpha: Math.round((0.85 + 0.15 * t) * 20) / 20 };
}

/** Control point height of a hop arc: it rises above the plane by a third of its length. */
export function arcPoint(a: Vec3, b: Vec3, t: number): Vec3 {
  'worklet';
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const lift = len * 0.35;
  const u = 1 - t;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const mz = (a.z + b.z) / 2 + lift;
  return {
    x: u * u * a.x + 2 * u * t * mx + t * t * b.x,
    y: u * u * a.y + 2 * u * t * my + t * t * b.y,
    z: u * u * a.z + 2 * u * t * mz + t * t * b.z,
  };
}

/** Screen end of a track: its far end, or a short stub when that end has no position. A flat track (lineage mode)
 * lies on the floor, the horizontal plane through the camera centre. */
export function trackEnds(tr: Scene['tracks'][number], cam: Camera): { ax: number; ay: number; bx: number; by: number } {
  'worklet';
  const fz = cam.center.z;
  const a = proj(tr.a.x, tr.a.y, tr.flat ? fz : tr.a.z, cam);
  let bx: number;
  let by: number;
  if (tr.b) {
    const b = proj(tr.b.x, tr.b.y, tr.flat ? fz : tr.b.z, cam);
    bx = b.x;
    by = b.y;
  } else {
    bx = a.x + Math.cos(tr.stubAngle) * 26;
    by = a.y + Math.sin(tr.stubAngle) * 26;
  }
  // Shared legs sit side by side, 2.5 pt apart.
  const len = Math.hypot(bx - a.x, by - a.y) || 1;
  const nx = -(by - a.y) / len;
  const ny = (bx - a.x) / len;
  const off = (tr.lane - (tr.lanes - 1) / 2) * 2.5;
  return { ax: a.x + nx * off, ay: a.y + ny * off, bx: bx + nx * off, by: by + ny * off };
}

/** Screen position of the narrator's puck and, for a voyage with no known position, its arrow direction. */
export function puckAt(scene: Scene, cam: Camera): { x: number; y: number; ang: number | null } | null {
  'worklet';
  const pk = scene.puck;
  if (!pk) return null;
  const a = proj(pk.p.x, pk.p.y, pk.p.z, cam);
  if (!pk.arrow) return { x: a.x, y: a.y, ang: null };
  let ang = pk.stubAngle;
  if (pk.toward) {
    const b = proj(pk.toward.x, pk.toward.y, pk.toward.z, cam);
    ang = Math.atan2(b.y - a.y, b.x - a.x);
  }
  return { x: a.x + Math.cos(ang) * 14, y: a.y + Math.sin(ang) * 14, ang };
}

/** Places a node on screen must keep clear of: within this distance of a marker (or its pip row), a voyage's dots
 * would read as people at that place. */
export const DOT_CLEAR = 24;

/** Where a voyage group's dot row sits on the screen: at its elapsed fraction, slid along the line just enough to
 * clear the narrator's puck and every place marker; when no spot on the line is clear, collapsed to one dot. */
export function voyageDots(
  v: Scene['voyages'][number],
  cam: Camera,
  avoid: number[],
): { x: number; y: number; start: number; n: number; more: number } | null {
  'worklet';
  if (!v.b || v.fraction == null) return null;
  const a = proj(v.a.x, v.a.y, v.a.z, cam);
  const b = proj(v.b.x, v.b.y, v.b.z, cam);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const total = v.dots.length + v.more;
  const rowAt = (f: number, n: number) => {
    const x = a.x + (b.x - a.x) * f;
    const y = a.y + (b.y - a.y) * f;
    return { x, y, start: v.puck ? x + 22 : x - ((n - 1) * 9) / 2 };
  };
  const clear = (start: number, y: number, n: number) => {
    const w = (n - 1) * 9;
    for (let i = 0; i < avoid.length; i += 2) {
      const px = Math.max(start, Math.min(start + w, avoid[i]));
      if (Math.hypot(px - avoid[i], y - avoid[i + 1]) < DOT_CLEAR) return false;
    }
    return true;
  };
  const n = v.dots.length;
  const r0 = rowAt(v.fraction, n);
  if (clear(r0.start, r0.y, n)) return { ...r0, n, more: v.more };
  // Slide along the line in 8 pt steps, nearer positions first, staying off the end points.
  const step = 8 / len;
  for (let k = 1; k <= 12; k++) {
    for (const sgn of [1, -1]) {
      const f = v.fraction + sgn * k * step;
      if (f < 0.05 || f > 0.95) continue;
      const r = rowAt(f, n);
      if (clear(r.start, r.y, n)) return { ...r, n, more: v.more };
    }
  }
  const r1 = rowAt(v.fraction, 1);
  return { ...r1, n: Math.min(1, n), more: Math.max(0, total - 1) };
}

/** Screen points voyage dots keep clear of: the puck, and each place marker and its pip row. */
export function dotObstacles(scene: Scene, cam: Camera, pk: { x: number; y: number } | null): number[] {
  'worklet';
  const out: number[] = [];
  if (pk) out.push(pk.x, pk.y);
  for (const n of scene.nodes) {
    const a = proj(n.p.x, n.p.y, n.p.z, cam);
    out.push(a.x, a.y);
    if (n.pips.length) out.push(a.x, a.y + 13 + (n.puck ? 10 : 0));
  }
  return out;
}

/** Occupied places outside the map area: up to four, busiest first, as markers on its border. A place just inside the
 * edge strips (within 24 pt of the box) still counts as on screen: its own marker shows, so it gets no edge marker. */
export function edgeMarkers(scene: Scene, cam: Camera, box: Box): { x: number; y: number; ang: number; node: number }[] {
  'worklet';
  const out: { x: number; y: number; ang: number; node: number; count: number }[] = [];
  const mx = (box.l + box.r) / 2;
  const my = (box.t + box.b) / 2;
  const hw = (box.r - box.l) / 2 - 14;
  const hh = (box.b - box.t) / 2 - 14;
  if (hw <= 20 || hh <= 20) return [];
  const m = 24;
  for (let i = 0; i < scene.nodes.length; i++) {
    const n = scene.nodes[i];
    if (n.cluster || n.count === 0) continue;
    const p = proj(n.p.x, n.p.y, n.p.z, cam);
    if (p.x >= box.l - m && p.x <= box.r + m && p.y >= box.t - m && p.y <= box.b + m) continue;
    const dx = p.x - mx;
    const dy = p.y - my;
    const k = Math.min(Math.abs(hw / (dx || 1e-6)), Math.abs(hh / (dy || 1e-6)));
    out.push({ x: mx + dx * k, y: my + dy * k, ang: Math.atan2(dy, dx), node: i, count: n.count });
  }
  out.sort((a, b) => b.count - a.count);
  return out.slice(0, 4).map((o) => ({ x: o.x, y: o.y, ang: o.ang, node: o.node }));
}

/** Radius of the Milky Way's disc, parsecs, drawn COMPASS_R - 4 points across in the locator. */
const GALAXY_R_PC = 15000;
/** Spiral arms: logarithmic, 12 degree pitch, from 3 kpc out to the disc's edge; four arms, phased so the Sun (8.2 kpc
 * from the centre) lies between two of them, as it does in the Orion Spur. Schematic shapes, true scale. */
const ARM_B = Math.tan((12 * Math.PI) / 180);
const ARM_R0 = 3000;
const ARM_PHASE = Math.PI * 1.25 - Math.log(8178 / ARM_R0) / ARM_B;



export function drawScene(canvas: SkCanvas, scene: Scene, cam: Camera, fonts: Fonts | null, w: number, h: number, opt: DrawOptions) {
  'worklet';
  const T = scene.theme;
  // Paints are shared by style within a frame: a few dozen distinct ones instead of one (or more) per element.
  // A cached paint is never changed after it is made.
  const paints: Record<string, SkPaint> = {};
  const dashes: Record<string, SkPathEffect> = {};
  const paint = (colour: string | null, alpha: number, stroke = 0, dash: number[] | null = null): SkPaint => {
    const a = Math.round(alpha * 200) / 200;
    const key = `${colour ?? ''}|${a}|${stroke}|${dash ? dash.join(',') : ''}`;
    const hit = paints[key];
    if (hit) return hit;
    const p = Skia.Paint();
    p.setAntiAlias(true);
    p.setColor(Skia.Color(colour ?? T.ink));
    p.setAlphaf(a);
    if (stroke > 0) {
      p.setStyle(PaintStyle.Stroke);
      p.setStrokeWidth(stroke);
      p.setStrokeCap(StrokeCap.Round);
    }
    if (dash) {
      const dk = dash.join(',');
      dashes[dk] ??= Skia.PathEffect.MakeDash(dash, 0);
      p.setPathEffect(dashes[dk]);
    }
    paints[key] = p;
    return p;
  };
  const P = (v: Vec3) => proj(v.x, v.y, v.z, cam);
  const on = (x: number, y: number, m = 40) => x > -m && y > -m && x < w + m && y < h + m;
  // A flat ring on the plane: its height on the screen shrinks to nothing edge-on and grows again seen from below.
  const squash = Math.max(0.001, Math.abs(Math.cos(cam.tilt)));
  // Near straight down a drop line carries no height and its foot sits on the marker: the drops fade out below about
  // 20° of tilt and are gone below about 7°. In steps of 0.05, so the paints stay few.
  const tiltT = Math.max(0, Math.min(1, (Math.sin(cam.tilt) - 0.12) / (0.35 - 0.12)));
  const dropTilt = Math.round(tiltT * tiltT * (3 - 2 * tiltT) * 20) / 20;
  /** A foot this close to its marker (screen points) draws no line or foot: it would only make a double ring. */
  const FOOT_MIN = 6;
  const fontOf = (f: Font): SkFont | null => (fonts ? fonts[f] : null);
  const toneOf = (t: string) => (t === 'ink2' ? T.ink2 : t === 'ink3' ? T.ink3 : T.ink);
  /** Where the galactic centre's glow is on screen (labelled last, if there is room), and how strong the band is. */
  let skyLabel: { x: number; y: number; k: number } | null = null;

  // Labels are collected and drawn last, in priority order, skipping any that would overlap one already placed.
  // The floating controls are placed first, so no label goes under them; labels also stay inside the map area.
  const placed: number[] = [];
  for (const c of opt.chrome) placed.push(c.l, c.t, c.r - c.l, c.b - c.t);
  const bx = opt.box;
  // Names on, a place's pip row is drawn only if its label finds no room, and then wherever it falls: until its own
  // label is placed, the row's box is held (as [node, l, t, w, h]) so no other label lands where it may be drawn.
  const held: number[] = [];
  const fits = (x: number, y: number, bw: number, bh: number, self = -1) => {
    if (x < Math.max(2, bx.l) || y < Math.max(2, bx.t) || x + bw > Math.min(w - 2, bx.r) || y + bh > Math.min(h - 2, bx.b)) return false;
    for (let i = 0; i < placed.length; i += 4) {
      if (x < placed[i] + placed[i + 2] && x + bw > placed[i] && y < placed[i + 1] + placed[i + 3] && y + bh > placed[i + 1]) return false;
    }
    for (let i = 0; i < held.length; i += 5) {
      if (held[i] < 0 || held[i] === self) continue;
      if (x < held[i + 1] + held[i + 3] && x + bw > held[i + 1] && y < held[i + 2] + held[i + 4] && y + bh > held[i + 2]) return false;
    }
    return true;
  };
  const release = (node: number) => {
    for (let i = 0; i < held.length; i += 5) if (held[i] === node) held[i] = -1;
  };
  const halo = paint(T.bg, 0.9, 3.5);
  const text = (s: string, x: number, y: number, font: SkFont, colour: string, alpha: number) => {
    canvas.drawText(s, x, y, halo, font);
    canvas.drawText(s, x, y, paint(colour, alpha), font);
  };
  const flatOval = (x: number, y: number, rx: number, p: SkPaint) => {
    canvas.drawOval(Skia.XYWHRect(x - rx, y - rx * squash, rx * 2, rx * 2 * squash), p);
  };

  // 0. The sky (local level). Infinitely far, so it depends only on which way the camera looks: turning slides it
  // past and tilting raises or lowers it; panning and zooming leave it, as the real sky does for a move of a few
  // dozen light years. A direction is drawn as a perspective camera looking along the view would see it. Faint stars
  // everywhere, denser along the galactic plane; near edge-on, the Milky Way band along the plane, brightest towards
  // the galactic centre (with a glow there) and faintest away from it. Looking down on the floor, the plane is at
  // the horizon, off screen.
  if (scene.level === 'local') {
    const F = Math.max(w, h) * 0.55;
    const c = Math.cos(cam.yaw);
    const sn = Math.sin(cam.yaw);
    const ct = Math.cos(cam.tilt);
    const st = Math.sin(cam.tilt);
    const scx = (opt.box.l + opt.box.r) / 2;
    const scy = (opt.box.t + opt.box.b) / 2;
    // Screen point of a direction, or null when it is behind the view.
    const sky = (x: number, y: number, z: number): { x: number; y: number; f: number } | null => {
      const rx = x * c - y * sn;
      const ry = x * sn + y * c;
      const up = ry * ct + z * st;
      const fwd = ry * st - z * ct;
      if (fwd < 0.08) return null;
      return { x: scx + (F * rx) / fwd, y: scy - (F * up) / fwd, f: fwd };
    };
    const starK = T.dark ? 0.32 : 0.22;
    const sk = scene.sky;
    for (let i = 0; i < sk.length; i += 4) {
      const q = sky(sk[i], sk[i + 1], sk[i + 2]);
      if (!q || !on(q.x, q.y, 0)) continue;
      canvas.drawCircle(q.x, q.y, 0.6 + sk[i + 3] * 0.6, paint(T.ink, Math.round(starK * sk[i + 3] * 20) / 20));
    }
    // The band shows only near edge-on: from about 15 degrees off the plane (either side), full at 3.
    const edge = Math.max(0, Math.min(1, (Math.abs(st) - 0.96) / (0.9986 - 0.96)));
    const bandK = Math.round(edge * edge * (3 - 2 * edge) * 20) / 20;
    if (bandK > 0) {
      // Three layers along the plane, each a single path (so no joints show): the whole circle, wide and faint; the
      // half facing the galactic centre; and a narrower, stronger stretch round the centre itself.
      const band = (half: number, width: number, a: number) => {
        const path = Skia.PathBuilder.Make();
        const N = Math.max(8, Math.round((half / Math.PI) * 120));
        let open = false;
        for (let i = 0; i <= N; i++) {
          const l = -half + (i / N) * 2 * half;
          const q = sky(Math.cos(l), Math.sin(l), 0);
          if (!q) {
            open = false;
            continue;
          }
          if (open) path.lineTo(q.x, q.y);
          else path.moveTo(q.x, q.y);
          open = true;
        }
        // Blurred, so the band has soft edges and fades out at its ends like a glow, not a stripe.
        const bp = Skia.Paint();
        bp.setAntiAlias(true);
        bp.setColor(Skia.Color(T.ink));
        bp.setAlphaf(a * bandK * (T.dark ? 1.3 : 1));
        bp.setStyle(PaintStyle.Stroke);
        bp.setStrokeWidth(F * width);
        bp.setStrokeCap(StrokeCap.Round);
        bp.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, F * width * 0.45, true));
        canvas.drawPath(path.build(), bp);
      };
      band(Math.PI, 0.12, 0.05);
      band(Math.PI / 2, 0.08, 0.05);
      band(Math.PI / 5, 0.05, 0.06);
      const gc = sky(1, 0, 0);
      if (gc && on(gc.x, gc.y, F * 0.3)) {
        const r = F * 0.22;
        const rgb = T.dark ? '255,255,255' : '0,0,0';
        const glow = Skia.Paint();
        glow.setAntiAlias(true);
        glow.setShader(Skia.Shader.MakeRadialGradient({ x: gc.x, y: gc.y }, r, [Skia.Color(`rgba(${rgb},${(T.dark ? 0.2 : 0.14) * bandK})`), Skia.Color(`rgba(${rgb},0)`)], [0, 1], TileMode.Clamp));
        canvas.drawCircle(gc.x, gc.y, r, glow);
        skyLabel = { x: gc.x, y: gc.y, k: bandK };
      }
    }
  }

  // 1. Galaxy level: the schematic Milky Way disc, a world object on the galactic plane that moves with the stars.
  const disc = scene.disc;
  if (disc) {
    const c = P(disc.c);
    const r = disc.r * cam.scale;
    flatOval(c.x, c.y, r, paint(T.ink, T.dark ? 0.07 : 0.06));
    flatOval(c.x, c.y, r * 0.1, paint(T.ink, T.dark ? 0.11 : 0.09));
  }
  // The floor: the horizontal plane (parallel to the galactic plane) through the camera centre, the point the camera
  // orbits. Every height is measured from it: drop lines end on it and lineage tracks lie on it. It is infinite, so it
  // is drawn to the edges of the map: inside the viewport globe (its equatorial disc) a uniform grey, outside it a
  // lighter one, and concentric rings round the centre of view spaced at the scale bar's length. A horizontal circle
  // round the centre projects to an ellipse centred there with its long axis across the screen at every yaw, squashed
  // by |cos tilt|; the rings and the globe's equator are similar ellipses, so each ring lies wholly inside or wholly
  // outside the globe. Seen from beneath (past edge-on) everything is a little fainter. Near edge-on the plane is seen
  // at a glancing angle: the outside shade and rings fade out (smoothstep of |cos tilt| over 0.04–0.35) and a thin
  // horizon line takes over, so it never floods the screen. Every drop line's foot lands on visible plane.
  const floorZ = cam.center.z;
  const sb = scaleBarFor(cam.scale, 120, opt.scaleBarLy ?? 0);
  const gw = bx.r - bx.l;
  const gh = bx.b - bx.t;
  const GR = GLOBE_K * Math.min(gw, gh);
  /** A ring this close to the globe's equator (screen points, along the long axis) is not drawn or labelled. */
  const RIM_GAP = 12;
  const fcx = (bx.l + bx.r) / 2;
  const fcy = (bx.t + bx.b) / 2;
  {
    const smooth = (a: number, b: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return Math.round(t * t * (3 - 2 * t) * 20) / 20;
    };
    const under = Math.cos(cam.tilt) < 0 ? 0.75 : 1;
    const outK = smooth(0.04, 0.35, squash);
    const inRingK = smooth(0.02, 0.15, squash);
    const disc = GR > 20 ? Skia.XYWHRect(fcx - GR, fcy - GR * squash, GR * 2, GR * 2 * squash) : null;
    if (disc) canvas.drawOval(disc, paint(T.ink, (T.dark ? 0.085 : 0.065) * under));
    if (outK > 0) {
      const out = Skia.PathBuilder.Make();
      out.addRect(Skia.XYWHRect(0, 0, w, h));
      if (disc) out.addOval(disc);
      out.setFillType(FillType.EvenOdd);
      canvas.drawPath(out.build(), paint(T.ink, (T.dark ? 0.04 : 0.03) * under * outK));
    }
    if (outK < 1) {
      // Edge-on: the plane outside the globe is a horizon line through the centre of view.
      const hp = paint(T.ink, (T.dark ? 0.2 : 0.16) * (1 - outK), 0.75);
      const r0 = disc ? GR : 0;
      canvas.drawLine(0, fcy, fcx - r0, fcy, hp);
      canvas.drawLine(fcx + r0, fcy, w, fcy, hp);
    }
    if (sb.pt > 8 && (inRingK > 0 || outK > 0)) {
      // Rings up to the one that encloses the whole map (at most 60).
      let far = 0;
      for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) far = Math.max(far, Math.hypot(x - fcx, (y - fcy) / squash));
      const n = Math.min(60, Math.ceil(far / sb.pt));
      const inner = Skia.PathBuilder.Make();
      const outer = Skia.PathBuilder.Make();
      let nIn = 0;
      let nOut = 0;
      for (let k = 1; k <= n; k++) {
        const R = k * sb.pt;
        // A ring within RIM_GAP of the globe's equator would read as a doubled rim: the equator and the shade change
        // already mark that radius.
        if (GR > 20 && Math.abs(R - GR) < RIM_GAP) continue;
        const isIn = R < GR - 0.5;
        if (isIn ? inRingK <= 0 : outK <= 0) continue;
        const rect = Skia.XYWHRect(fcx - R, fcy - R * squash, R * 2, R * 2 * squash);
        if (isIn) {
          inner.addOval(rect);
          nIn++;
        } else {
          outer.addOval(rect);
          nOut++;
        }
      }
      if (nIn) canvas.drawPath(inner.build(), paint(T.ink, (T.dark ? 0.16 : 0.13) * under * inRingK, 0.75));
      if (nOut) canvas.drawPath(outer.build(), paint(T.ink, (T.dark ? 0.1 : 0.075) * under * outK, 0.75));
    }
    // The cross: two straight lines on the floor through the centre of view, along galactic x and y (the directions
    // of the globe's meridians), so they join the equator's 0, 90, 180 and 270 degree points. A unit step along
    // galactic x on the plane moves (cos yaw, -sin yaw cos tilt) on the screen, along y (-sin yaw, -cos yaw cos tilt).
    // Inside the globe a little stronger than the inner rings (fading with them near edge-on, where the equator line
    // already lies there); outside it as faint as the outer rings, fading with the outside shade, so edge-on only the
    // horizon line is left and nothing doubles it. Outside, each line runs to the ring that encloses the whole map.
    if (GR > 20 && (inRingK > 0 || outK > 0)) {
      const cyw = Math.cos(cam.yaw);
      const syw = Math.sin(cam.yaw);
      const ct = Math.cos(cam.tilt);
      const axes = [cyw, -syw * ct, -syw, -cyw * ct];
      if (inRingK > 0) {
        const inner = Skia.PathBuilder.Make();
        for (let i = 0; i < 4; i += 2) {
          inner.moveTo(fcx - axes[i] * GR, fcy - axes[i + 1] * GR);
          inner.lineTo(fcx + axes[i] * GR, fcy + axes[i + 1] * GR);
        }
        canvas.drawPath(inner.build(), paint(T.ink, (T.dark ? 0.2 : 0.16) * under * inRingK, 0.75));
      }
      if (outK > 0) {
        let far = 0;
        for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) far = Math.max(far, Math.hypot(x - fcx, (y - fcy) / squash));
        far = Math.min(far + 4, 1e6);
        if (far > GR) {
          const outer = Skia.PathBuilder.Make();
          for (let i = 0; i < 4; i += 2) {
            for (const sgn of [1, -1]) {
              outer.moveTo(fcx + sgn * axes[i] * GR, fcy + sgn * axes[i + 1] * GR);
              outer.lineTo(fcx + sgn * axes[i] * far, fcy + sgn * axes[i + 1] * far);
            }
          }
          canvas.drawPath(outer.build(), paint(T.ink, (T.dark ? 0.1 : 0.075) * under * outK, 0.75));
        }
      }
    }
  }

  // The viewport globe: an orientation guide fixed on the screen, like a navball. Centred in the free map area (where
  // the pivot sits), radius GLOBE_K of that area's shorter side; zooming and moving never change it, so zooming out
  // shows more light years inside it. It turns and tilts with the camera (rotation only): the floor's darker shade
  // inside it is its equatorial disc (drawn above), a faint outline circle (the sphere's silhouette from every angle), the equator (the galactic
  // plane's orientation) and two meridians through the poles along the galactic x and y axes. The half
  // nearer the viewer is solid and a little stronger, the far half fainter and dashed. A meridian seen edge-on is a
  // straight line through the centre that reads as a drop line or an axis, so each meridian fades by how edge-on it is:
  // |n·v| with n its plane's normal (galactic x or y) and v the view direction, smoothstep 0.12–0.35, in steps of 0.05
  // so the paints stay few. Small ticks mark the poles (not near straight down or up, where they sit on the centre).
  // Decoration only: never tappable and never in the way of a label.
  if (GR > 20) {
    const gcam: Camera = { yaw: cam.yaw, tilt: cam.tilt, scale: 1, center: { x: 0, y: 0, z: 0 }, cx: (bx.l + bx.r) / 2, cy: (bx.t + bx.b) / 2 };
    canvas.drawCircle(gcam.cx, gcam.cy, GR, paint(T.ink, T.dark ? 0.13 : 0.1, 0.75));
    const vx = -Math.sin(cam.yaw) * Math.sin(cam.tilt);
    const vy = -Math.cos(cam.yaw) * Math.sin(cam.tilt);
    const face = (d: number) => {
      const t = Math.max(0, Math.min(1, (Math.abs(d) - 0.12) / (0.35 - 0.12)));
      return Math.round(t * t * (3 - 2 * t) * 20) / 20;
    };
    const N = 72;
    for (let ring = 0; ring < 3; ring++) {
      const k = ring === 0 ? 1 : ring === 1 ? face(vy) : face(vx);
      if (k <= 0) continue;
      const near = Skia.PathBuilder.Make();
      const far = Skia.PathBuilder.Make();
      let nearOpen = false;
      let farOpen = false;
      let px = 0;
      let py = 0;
      let pd = 0;
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * Math.PI * 2;
        const u = Math.cos(th) * GR;
        const v = Math.sin(th) * GR;
        const q = ring === 0 ? proj(u, v, 0, gcam) : ring === 1 ? proj(u, 0, v, gcam) : proj(0, u, v, gcam);
        if (i > 0) {
          // Near or far by the segment's depth relative to the centre. Seen straight down or up the equator is all at
          // the centre's depth: it counts as near (solid), so rounding never splits it.
          const isNear = (pd + q.depth) / 2 >= -GR * 1e-3;
          if (isNear) {
            if (!nearOpen) near.moveTo(px, py);
            near.lineTo(q.x, q.y);
          } else {
            if (!farOpen) far.moveTo(px, py);
            far.lineTo(q.x, q.y);
          }
          nearOpen = isNear;
          farOpen = !isNear;
        }
        px = q.x;
        py = q.y;
        pd = q.depth;
      }
      canvas.drawPath(far.build(), paint(T.ink, (T.dark ? 0.12 : 0.1) * k, 0.75, [3, 4]));
      canvas.drawPath(near.build(), paint(T.ink, (T.dark ? 0.24 : 0.18) * k, 0.75));
    }
    const tiltSin = Math.sin(cam.tilt);
    if (tiltSin > 0.3) {
      // Like the rings, the pole on the far side of the globe gets the fainter tick (half the alpha).
      const tickA = (T.dark ? 0.3 : 0.24) * Math.min(1, (tiltSin - 0.3) / 0.3);
      const nearTick = paint(T.ink, tickA, 1);
      const farTick = paint(T.ink, tickA * 0.5, 1);
      for (const sgn of [1, -1]) {
        const a = proj(0, 0, sgn * GR, gcam);
        const b = proj(0, 0, sgn * GR * 1.07, gcam);
        canvas.drawLine(a.x, a.y, b.x, b.y, a.depth < 0 ? farTick : nearTick);
      }
    }
  }

  // 2. Background stars: small ink dots with thin drop lines to a flat dot on the floor.
  const dropPaint = paint(T.ink, (T.dark ? 0.14 : 0.11) * dropTilt, 0.75);
  const starPaint = paint(T.ink, T.dark ? 0.55 : 0.45);
  const starFoot = paint(T.ink, (T.dark ? 0.3 : 0.22) * dropTilt);
  const st = scene.stars;
  for (let i = 0; i < st.length; i += 3) {
    const a = proj(st[i], st[i + 1], st[i + 2], cam);
    if (!on(a.x, a.y)) continue;
    const f = proj(st[i], st[i + 1], floorZ, cam);
    if (dropTilt > 0 && Math.hypot(f.x - a.x, f.y - a.y) >= FOOT_MIN) {
      canvas.drawLine(a.x, a.y, f.x, f.y, dropPaint);
      flatOval(f.x, f.y, 1, starFoot);
    }
    canvas.drawCircle(a.x, a.y, 1.4, starPaint);
  }

  // 3. Drop lines and feet, to the floor through the camera centre (dashed for places below it). At rest only the
  // pivot or focus place and the selected Bob's places have them; the rest fade in while the camera moves, so height
  // reads while turning or tilting and the map is calm otherwise. The pivot itself is on the floor: none.
  const dropAlpha = T.dark ? 0.45 : 0.35;
  const anchors: number[] = [];
  const depths: number[] = [];
  for (let n = 0; n < scene.nodes.length; n++) {
    const node = scene.nodes[n];
    const a = P(node.p);
    anchors.push(a.x, a.y);
    depths.push(a.depth * cam.scale);
    const k = (node.drop ? 1 : opt.drops) * dropTilt;
    if (node.cluster || k < 0.02 || !on(a.x, a.y, 120)) continue;
    const f = proj(node.p.x, node.p.y, floorZ, cam);
    if (Math.hypot(f.x - a.x, f.y - a.y) < FOOT_MIN) continue;
    const al = dropAlpha * k;
    canvas.drawLine(a.x, a.y, f.x, f.y, node.p.z < floorZ ? paint(T.ink, al, 1, [2, 3]) : paint(T.ink, al, 1));
    flatOval(f.x, f.y, 3, paint(T.ink, al, 1));
  }
  // Depth cues reach full strength at a third of the map's smaller side.
  const reach = Math.min(bx.r - bx.l, bx.b - bx.t) / 3;

  // Chevrons (on voyages) keep off other places' markers and pips.
  const nearMarker = (x: number, y: number) => {
    for (let i = 0; i < anchors.length; i += 2) {
      const ax = anchors[i];
      const ay = anchors[i + 1];
      if (Math.abs(x - ax) < 30 && y > ay - 12 && y < ay + 26) return true;
    }
    return false;
  };

  // 4. Travel history, the past (on the floor in lineage mode, star to star otherwise): a thin, faint solid line in
  // his colour (another replicant: a thinner, fainter ink line, never stronger than a Bob's), no chevrons, so it stays
  // well behind the voyages under way. No dashes: on the Tree a dashed line means in transit. Wormhole legs add a flat
  // gate at each end; transmitted legs are dotted.
  for (const tr of scene.tracks) {
    const e = trackEnds(tr, cam);
    const alpha = tr.alpha;
    if (tr.via === 'transmitted') canvas.drawLine(e.ax, e.ay, e.bx, e.by, paint(tr.colour, alpha, tr.width + 0.25, [0.1, 4]));
    else if (tr.colour == null) canvas.drawLine(e.ax, e.ay, e.bx, e.by, paint(null, alpha * 0.6, Math.max(0.75, tr.width - 0.25)));
    else canvas.drawLine(e.ax, e.ay, e.bx, e.by, paint(tr.colour, alpha, tr.width));
    if (tr.via === 'wormhole' && tr.b) {
      flatOval(e.ax, e.ay, 9, paint(null, alpha, 1));
      flatOval(e.bx, e.by, 9, paint(null, alpha, 1));
    }
  }
  // Where each was made: a diamond on the floor (another replicant: hollow ink, where his route begins).
  for (const d of scene.diamonds) {
    const p = proj(d.p.x, d.p.y, d.flat ? floorZ : d.p.z, cam);
    if (!on(p.x, p.y)) continue;
    const r = d.size;
    const path = Skia.PathBuilder.Make();
    path.moveTo(p.x, p.y - r);
    path.lineTo(p.x + r, p.y);
    path.lineTo(p.x, p.y + r);
    path.lineTo(p.x - r, p.y);
    path.close();
    const dp = path.build();
    canvas.drawPath(dp, paint(T.bg, 1, 3));
    if (d.colour) canvas.drawPath(dp, paint(d.colour, d.alpha));
    else {
      canvas.drawPath(dp, paint(T.bg, 1));
      canvas.drawPath(dp, paint(null, d.alpha, 1.25));
    }
  }

  // 5. SCUT links: thin ink lines in the air with a short cross tick near each end, so without colour they still differ
  // from a faint solid history line (ticks only on links long enough to carry them).
  const scutPaint = paint(T.ink, 0.3, 0.75);
  for (const [a, b] of scene.scut) {
    const pa = P(a);
    const pb = P(b);
    canvas.drawLine(pa.x, pa.y, pb.x, pb.y, scutPaint);
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    if (len < 40) continue;
    const ux = (pb.x - pa.x) / len;
    const uy = (pb.y - pa.y) / len;
    for (const [x, y] of [
      [pa.x + ux * 12, pa.y + uy * 12],
      [pb.x - ux * 12, pb.y - uy * 12],
    ]) canvas.drawLine(x - uy * 3.5, y + ux * 3.5, x + uy * 3.5, y - ux * 3.5, scutPaint);
  }

  // 6. Ghost trails (flashbacks): a faint double hairline (a solid line with chevrons means a voyage, a faint solid
  // one travel history), ending in a hollow ring.
  for (const gh of scene.ghosts) {
    const pa = P(gh.a);
    const pb = P(gh.b);
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
    const nx = (-(pb.y - pa.y) / len) * 1.5;
    const ny = ((pb.x - pa.x) / len) * 1.5;
    const gp = paint(gh.colour, gh.dim ? 0.15 : 0.4, 0.6);
    canvas.drawLine(pa.x + nx, pa.y + ny, pb.x + nx, pb.y + ny, gp);
    canvas.drawLine(pa.x - nx, pa.y - ny, pb.x - nx, pb.y - ny, gp);
    canvas.drawCircle(pb.x, pb.y, 5, paint(gh.colour, gh.dim ? 0.25 : 0.6, 1.25));
  }

  // 7. Voyages under way: one solid line per group in its colour (the narrator's, else the first member's; other
  // replicants: outlined ink) with chevrons pointing from the origin to the destination; colour dots at the elapsed
  // fraction when both ends are known (none when the arrival is not revealed: the whole line, no position); a short
  // stub with an arrowhead when the destination is not given.
  const pk = puckAt(scene, cam);
  const avoid = dotObstacles(scene, cam, pk);
  for (const v of scene.voyages) {
    const pa = P(v.a);
    const alpha = v.dim ? DIM : 1;
    const width = v.strong ? 2.5 : 1.75;
    let ex: number;
    let ey: number;
    if (v.b) {
      const pb = P(v.b);
      ex = pb.x;
      ey = pb.y;
    } else {
      ex = pa.x + Math.cos(v.stubAngle) * 26;
      ey = pa.y + Math.sin(v.stubAngle) * 26;
    }
    if (v.colour == null) {
      canvas.drawLine(pa.x, pa.y, ex, ey, paint(null, alpha, width + 2));
      canvas.drawLine(pa.x, pa.y, ex, ey, paint(T.bg, 1, width - 0.5));
    } else {
      canvas.drawLine(pa.x, pa.y, ex, ey, paint(v.colour, alpha, width));
    }
    if (!v.b) {
      const ang = Math.atan2(ey - pa.y, ex - pa.x);
      const head = Skia.PathBuilder.Make();
      head.moveTo(ex + Math.cos(ang) * 4, ey + Math.sin(ang) * 4);
      head.lineTo(ex + Math.cos(ang + 2.5) * 6, ey + Math.sin(ang + 2.5) * 6);
      head.lineTo(ex + Math.cos(ang - 2.5) * 6, ey + Math.sin(ang - 2.5) * 6);
      head.close();
      canvas.drawPath(head.build(), paint(v.colour, alpha));
      continue;
    }
    const row = v.fraction != null ? voyageDots(v, cam, avoid) : null;
    // Chevrons every 36 pt from the origin towards the destination, off place markers, the puck and the dot row;
    // a line too crowded for any still gets one at its middle.
    const len = Math.hypot(ex - pa.x, ey - pa.y);
    if (len >= 14) {
      const ux = (ex - pa.x) / len;
      const uy = (ey - pa.y) / len;
      const chev = paint(v.colour, alpha, v.strong ? 2 : 1.6);
      const arm = v.strong ? 5.5 : 4.75;
      const half = v.strong ? 4.5 : 3.75;
      const clear = (x: number, y: number) => {
        if (nearMarker(x, y)) return false;
        if (pk && Math.hypot(x - pk.x, y - pk.y) < 22) return false;
        if (row) {
          const w = Math.max(0, row.n - 1) * 9;
          const qx = Math.max(row.start, Math.min(row.start + w, x));
          if (Math.hypot(x - qx, y - row.y) < 12) return false;
        }
        return true;
      };
      const marks: number[] = [];
      for (let d = 18; d < len - 12; d += 36) marks.push(d);
      let drawn = 0;
      const chevron = (d: number) => {
        const tipX = pa.x + ux * (d + 3);
        const tipY = pa.y + uy * (d + 3);
        canvas.drawLine(tipX - ux * arm - uy * half, tipY - uy * arm + ux * half, tipX, tipY, chev);
        canvas.drawLine(tipX - ux * arm + uy * half, tipY - uy * arm - ux * half, tipX, tipY, chev);
        drawn++;
      };
      for (const d of marks) if (clear(pa.x + ux * d, pa.y + uy * d)) chevron(d);
      if (!drawn) {
        // Try the free spots nearest the middle, then the middle itself.
        let best = -1;
        for (let d = 10; d < len - 10; d += 4) if (clear(pa.x + ux * d, pa.y + uy * d) && (best < 0 || Math.abs(d - len / 2) < Math.abs(best - len / 2))) best = d;
        chevron(best >= 0 ? best : len / 2);
      }
    }
    if (row) {
      const { x, y, start, n, more } = row;
      if (v.colour == null) {
        canvas.drawCircle(x, y, 5.5, paint(T.bg, 1));
        canvas.drawCircle(x, y, 4, paint(null, alpha, 1.5));
        placed.push(x - 6, y - 6, 12, 12);
      } else {
        for (let i = 0; i < n; i++) {
          canvas.drawCircle(start + i * 9, y, 5, paint(T.bg, 1));
          canvas.drawCircle(start + i * 9, y, 3.75, paint(v.dots[i], alpha));
        }
        if (more > 0 && fonts) text(`+${more}`, start + (n - 1) * 9 + 7, y + 3.5, fonts.small, T.ink2, alpha);
        if (n) placed.push(start - 5, y - 5, (n - 1) * 9 + 10 + (more ? 18 : 0), 10);
      }
    }
  }

  // 8. Wormhole hops: a thin solid arc rising above the plane, with a flat gate on the floor at each end.
  // Transmitted: dotted ink, no gates.
  const gateRx = 11;
  for (const hp of scene.hops) {
    const alpha = hp.dim ? DIM : 1;
    const pb = P(hp.b);
    if (hp.a) {
      const path = Skia.PathBuilder.Make();
      for (let i = 0; i <= 32; i++) {
        const q = arcPoint(hp.a, hp.b, i / 32);
        const s = proj(q.x, q.y, q.z, cam);
        if (i === 0) path.moveTo(s.x, s.y);
        else path.lineTo(s.x, s.y);
      }
      const arc = path.build();
      if (hp.transmitted) canvas.drawPath(arc, paint(null, alpha, 1.5, [0.1, 4]));
      else if (hp.colour == null) {
        canvas.drawPath(arc, paint(null, alpha, 3.5));
        canvas.drawPath(arc, paint(T.bg, 1, 1));
      } else canvas.drawPath(arc, paint(hp.colour, alpha, 1.5));
      if (!hp.transmitted) {
        const pa = P(hp.a);
        flatOval(pa.x, pa.y, gateRx, paint(null, alpha, 1.25));
      }
    }
    if (!hp.transmitted) flatOval(pb.x, pb.y, gateRx, paint(null, alpha, 1.25));
  }

  // 9. Places: ink dots (empty places: small hollow dots), pips for who is there, crosses for the lost.
  /** The box a place's pip row (or its count, zoomed far out) takes: [l, t, w, h]; null when it has none. */
  const pipBox = (node: SceneNode, a: { x: number; y: number }): number[] | null => {
    const np = node.pips.length;
    if (!np) return null;
    if (opt.far && fonts) {
      const tw = fonts.small.getTextWidth(String(node.count - (node.puck ? 1 : 0)));
      const o = pipOffset(0, 1, node.puck);
      return [a.x - tw / 2 - 1, a.y + o.dy - 6, tw + 2, 12];
    }
    const o0 = pipOffset(0, np, node.puck);
    return [a.x + o0.dx - 5, a.y + o0.dy - 5, (np - 1) * PIP_GAP + 10 + (node.more ? 20 : 0), 10];
  };
  /** Draws a place's pip row (or its count, zoomed far out). With `check`, only if its box is clear; false if not. */
  const drawPips = (node: SceneNode, a: { x: number; y: number }, alpha: number, check = false, self = -1): boolean => {
    const np = node.pips.length;
    const pb = pipBox(node, a);
    if (check && pb && !fits(pb[0], pb[1], pb[2], pb[3], self)) return false;
    if (self >= 0) release(self);
    if (opt.far && np && fonts) {
      // Zoomed far out: the pips become a count.
      const s = String(node.count - (node.puck ? 1 : 0));
      const tw = fonts.small.getTextWidth(s);
      const o = pipOffset(0, 1, node.puck);
      text(s, a.x - tw / 2, a.y + o.dy + 4, fonts.small, T.ink2, alpha);
      placed.push(pb![0], pb![1], pb![2], pb![3]);
      return true;
    }
    for (let i = 0; i < np; i++) {
      const pip = node.pips[i];
      const o = pipOffset(i, np, node.puck);
      const x = a.x + o.dx;
      const y = a.y + o.dy;
      const pa = pip.dim ? DIM : 1;
      opt.hits?.push({ id: pip.id, x, y, w: 0, h: 0, crowd: node.ids[0] ?? null });
      canvas.drawCircle(x, y, 4.25, paint(T.bg, 1));
      if (pip.colour) canvas.drawCircle(x, y, 3.25, paint(pip.colour, pa));
      else canvas.drawCircle(x, y, 2.75, paint(null, pa, 1.25));
    }
    if (node.more > 0 && fonts) {
      const o = pipOffset(np - 1, np, node.puck);
      text(`+${node.more}`, a.x + o.dx + 7, a.y + o.dy + 3.5, fonts.small, T.ink2, 1);
    }
    if (pb) placed.push(pb[0], pb[1], pb[2], pb[3]);
    return true;
  };
  for (let n = 0; n < scene.nodes.length; n++) {
    const node = scene.nodes[n];
    const a = { x: anchors[n * 2], y: anchors[n * 2 + 1] };
    if (!on(a.x, a.y, 120)) continue;
    const cue = depthCue(depths[n], reach);
    const alpha = node.dim ? 0.45 : 1;
    if (node.cluster) {
      canvas.drawCircle(a.x, a.y, 9, paint(T.bg, 1));
      canvas.drawCircle(a.x, a.y, 9, paint(null, alpha, 1.25));
      canvas.drawCircle(a.x, a.y, 3.5, paint(null, alpha));
    } else if (node.empty) {
      canvas.drawCircle(a.x, a.y, 4 * cue.size, paint(T.bg, 1));
      canvas.drawCircle(a.x, a.y, 3 * cue.size, paint(null, alpha * 0.7 * cue.alpha, 1.25));
    } else if (!node.puck) {
      canvas.drawCircle(a.x, a.y, 5.5 * cue.size, paint(T.bg, 1));
      canvas.drawCircle(a.x, a.y, 4.25 * cue.size, paint(null, alpha * cue.alpha));
    }
    if (node.chapterRing) canvas.drawCircle(a.x, a.y, 10, paint(null, 1, 1.5));
    // Home systems, colonies, outposts and territory, in ink and told apart by shape: a home system is a double ring
    // round the marker, a colony a ring, an outpost a small square, territory a wide dashed ring.
    for (const k of node.presence) {
      const r0 = node.puck ? 19 : 8.5;
      if (k === 'home') {
        canvas.drawCircle(a.x, a.y, r0, paint(null, alpha * 0.75, 1.25));
        canvas.drawCircle(a.x, a.y, r0 + 3.5, paint(null, alpha * 0.75, 1.25));
      } else if (k === 'colony') canvas.drawCircle(a.x, a.y, r0, paint(null, alpha * 0.7, 1.25));
      else if (k === 'outpost') canvas.drawRect(Skia.XYWHRect(a.x - r0, a.y - r0, r0 * 2, r0 * 2), paint(null, alpha * 0.7, 1));
      else canvas.drawCircle(a.x, a.y, r0 + 7, paint(null, alpha * 0.5, 1, [3, 3]));
    }
    // Names on: the people are in the label; the pip row is drawn only if the label finds no room (below), and its
    // box is held until then.
    if (!node.cluster && !node.namesInLabel) drawPips(node, a, alpha);
    else if (!node.cluster) {
      const pb = pipBox(node, a);
      if (pb) held.push(n, pb[0], pb[1], pb[2], pb[3]);
    }
    // Lost: tiny ink crosses on the left of the marker. More than three become one cross with the count beside it.
    const lostPaint = paint(null, alpha * 0.8, 1.25);
    const crosses = node.lost > 3 ? 1 : node.lost;
    const lx = node.puck ? -20 : -12;
    for (let i = 0; i < crosses; i++) {
      const x = a.x + lx - i * 7;
      const y = a.y - 9;
      canvas.drawLine(x - 2.5, y - 2.5, x + 2.5, y + 2.5, lostPaint);
      canvas.drawLine(x - 2.5, y + 2.5, x + 2.5, y - 2.5, lostPaint);
    }
    let lostW = crosses > 0 ? (crosses - 1) * 7 + 6 : 0;
    if (node.lost > 3 && fonts) {
      const s = String(node.lost);
      const tw = fonts.small.getTextWidth(s);
      text(s, a.x + lx - 5 - tw, a.y - 5.5, fonts.small, T.ink2, alpha);
      lostW += tw + 2;
    }
    const mr = node.puck ? 16 : node.cluster || node.chapterRing ? 12 : 6;
    placed.push(a.x - mr, a.y - mr, mr * 2, mr * 2);
    if (lostW > 0) placed.push(a.x + lx + 3 - lostW, a.y - 13, lostW, 8);
  }

  // 10. The narrator's puck: a halo, a ring and a core in his colour (GPS-like). On a voyage with no known position
  // it sits near the origin with an arrowhead and claims no position.
  if (pk && scene.puck) {
    const c = scene.puck.colour;
    canvas.drawCircle(pk.x, pk.y, 16, paint(c, T.dark ? 0.24 : 0.18));
    canvas.drawCircle(pk.x, pk.y, 16, paint(c, 0.5, 1));
    canvas.drawCircle(pk.x, pk.y, 7.25, paint(T.bg, 1));
    canvas.drawCircle(pk.x, pk.y, 6, paint(c, 1));
    if (pk.ang != null) {
      const ang = pk.ang;
      const hx = pk.x + Math.cos(ang) * 21;
      const hy = pk.y + Math.sin(ang) * 21;
      const head = Skia.PathBuilder.Make();
      head.moveTo(hx + Math.cos(ang) * 4, hy + Math.sin(ang) * 4);
      head.lineTo(hx + Math.cos(ang + 2.4) * 5, hy + Math.sin(ang + 2.4) * 5);
      head.lineTo(hx + Math.cos(ang - 2.4) * 5, hy + Math.sin(ang - 2.4) * 5);
      head.close();
      canvas.drawPath(head.build(), paint(c, 1));
    }
    placed.push(pk.x - 16, pk.y - 16, 32, 32);
  }

  // The distance scale: one bar in its fixed spot at the bottom left, a round length (1, 2, 5, 10, 20 ... ly) that
  // depends on the zoom only, so turning and tilting never move or change it; the length shown before is kept while
  // its bar stays 40–130 pt, so a pinch near a step never makes it flip. Across the screen the orthographic
  // projection keeps lengths, so the bar is exactly that many light years anywhere on the map.
  if (opt.scaleBar) {
    if (sb.pt > 0) {
      const { x, y } = opt.scaleBar;
      const sp = paint(T.ink, 0.6, 1.25);
      canvas.drawLine(x, y, x + sb.pt, y, sp);
      canvas.drawLine(x, y - 4, x, y + 1, sp);
      canvas.drawLine(x + sb.pt, y - 4, x + sb.pt, y + 1, sp);
      if (fonts) {
        text(sb.label, x + sb.pt + 6, y + 3.5, fonts.small, T.ink2, 1);
        placed.push(x - 2, y - 8, sb.pt + 10 + fonts.small.getTextWidth(sb.label), 14);
        // Under the bar, how wide the viewport globe is at this zoom (its diameter on the floor).
        const dia = GR > 20 ? viewportDiameter(GR, cam.scale) : '';
        if (dia) {
          const s = (opt.viewportPrefix ?? 'Viewport diameter ') + dia;
          text(s, x, y + 16, fonts.small, T.ink3, 1);
          placed.push(x - 2, y + 6, fonts.small.getTextWidth(s) + 4, 13);
        }
      }
    }
  }

  // The galaxy locator, above the scale bar: the Milky Way at true scale (disc, bulge, schematic spiral arms) seen
  // from the same angle as the map, with a ring where the Sun is, 26,700 ly from the centre. It turns and tilts with
  // the camera, so at every angle it shows how the local map sits in the galaxy. An arrow from the Sun points to
  // galactic north (N). A tap on it turns the map back to the default view.
  const cp = compassAt(opt.scaleBar);
  if (cp) {
    const R = COMPASS_R;
    canvas.drawCircle(cp.x, cp.y, R, paint(T.bg, 0.85));
    canvas.drawCircle(cp.x, cp.y, R, paint(T.ink, 0.2, 0.75));
    const gcam: Camera = { yaw: cam.yaw, tilt: cam.tilt, scale: (R - 4) / GALAXY_R_PC, center: GALACTIC_CENTRE, cx: cp.x, cy: cp.y };
    const G = (x: number, y: number, z: number) => proj(x, y, z, gcam);
    const sq = Math.max(0.02, squash);
    const gr = R - 4;
    canvas.drawOval(Skia.XYWHRect(cp.x - gr, cp.y - gr * sq, gr * 2, gr * 2 * sq), paint(T.ink, T.dark ? 0.08 : 0.06));
    const arms = Skia.PathBuilder.Make();
    for (let arm = 0; arm < 4; arm++) {
      const ph = ARM_PHASE + (arm * Math.PI) / 2;
      for (let i = 0; i <= 48; i++) {
        const r = ARM_R0 * Math.pow(GALAXY_R_PC / ARM_R0, i / 48);
        const th = ph + Math.log(r / ARM_R0) / ARM_B;
        const q = G(GALACTIC_CENTRE.x + r * Math.cos(th), r * Math.sin(th), 0);
        if (i === 0) arms.moveTo(q.x, q.y);
        else arms.lineTo(q.x, q.y);
      }
    }
    canvas.drawPath(arms.build(), paint(T.ink, T.dark ? 0.3 : 0.24, 1));
    const bulge = 2200 * gcam.scale;
    canvas.drawOval(Skia.XYWHRect(cp.x - bulge, cp.y - bulge * Math.max(0.45, sq), bulge * 2, bulge * 2 * Math.max(0.45, sq)), paint(T.ink, T.dark ? 0.3 : 0.22));
    const sun = G(0, 0, 0);
    const n = G(0, 0, 0.55 * GALAXY_R_PC);
    const nl = Math.hypot(n.x - sun.x, n.y - sun.y);
    const np = paint(T.ink, 0.85, 1.25);
    if (nl >= 4) {
      canvas.drawLine(sun.x, sun.y, n.x, n.y, np);
      const ang = Math.atan2(n.y - sun.y, n.x - sun.x);
      const head = Skia.PathBuilder.Make();
      head.moveTo(n.x + Math.cos(ang) * 3, n.y + Math.sin(ang) * 3);
      head.lineTo(n.x + Math.cos(ang + 2.5) * 4, n.y + Math.sin(ang + 2.5) * 4);
      head.lineTo(n.x + Math.cos(ang - 2.5) * 4, n.y + Math.sin(ang - 2.5) * 4);
      head.close();
      canvas.drawPath(head.build(), paint(T.ink, 0.85));
    }
    canvas.drawCircle(sun.x, sun.y, 3.5, paint(T.bg, 1));
    canvas.drawCircle(sun.x, sun.y, 3.5, paint(T.ink, 0.9, 1.5));
    if (fonts && nl >= 4) {
      const f = fonts.small;
      const ux = (n.x - sun.x) / nl;
      const uy = (n.y - sun.y) / nl;
      text('N', n.x + ux * 8 - f.getTextWidth('N') / 2, n.y + uy * 8 + 4, f, T.ink, 0.9);
    }
    placed.push(cp.x - R - 4, cp.y - R - 4, R * 2 + 8, R * 2 + 8);
  }

  if (!fonts) {
    // No label text yet (the font is loading): names on, the pip rows stand in.
    for (let n = 0; n < scene.nodes.length; n++) {
      const node = scene.nodes[n];
      if (node.namesInLabel && on(anchors[n * 2], anchors[n * 2 + 1], 120)) drawPips(node, { x: anchors[n * 2], y: anchors[n * 2 + 1] }, node.dim ? 0.45 : 1);
    }
    return;
  }

  /** Places one block of label lines beside (or under) its anchor; false when there was no room. */
  const placeLabel = (lb: Scene['labels'][number], lines: Scene['labels'][number]['lines'], ax: number, ay: number, mayForce: boolean): boolean => {
    let bw = 0;
    let bh = 0;
    for (const l of lines) {
      const f = fontOf(l.font)!;
      bw = Math.max(bw, lineWidth(l, f));
      bh += f.getSize() * 1.25;
    }
    const first = fontOf(lines[0].font)!.getSize() * 1.25;
    const tries = lb.centred
      ? [
          [ax - bw / 2, ay],
          [ax + 8, ay - first * 0.75],
          [ax - 8 - bw, ay - first * 0.75],
        ]
      : [
          [ax + lb.gap, ay - first * 0.75],
          [ax - lb.gap - bw, ay - first * 0.75],
          [ax - bw / 2, ay + lb.below],
          [ax - bw / 2, ay - lb.gap - bh],
          [ax + lb.gap, ay - lb.gap - bh * 0.8],
          [ax - lb.gap - bw, ay - lb.gap - bh * 0.8],
        ];
    for (let n = 0; n < tries.length; n++) {
      let x = tries[n][0];
      let y = tries[n][1];
      if (!fits(x, y, bw, bh, lb.node)) {
        // The focus place's label always shows: if nothing fits, it takes the first spot in the map area anyway.
        if (!(n === tries.length - 1 && mayForce && lb.force)) continue;
        x = Math.max(bx.l + 2, Math.min(bx.r - 2 - bw, tries[0][0]));
        y = Math.max(bx.t + 2, Math.min(bx.b - 2 - bh, tries[0][1]));
      }
      placed.push(x, y, bw, bh);
      let yy = y;
      for (const l of lines) {
        const f = fontOf(l.font)!;
        const lh = f.getSize() * 1.25;
        const base = yy + lh * 0.8;
        if (!l.runs) text(l.text, x, base, f, toneOf(l.tone), lb.alpha);
        else {
          // Each person's mark, then his name: a Bob's identity colour dot, another replicant's hollow ink square.
          let xx = x;
          const my = base - f.getSize() * 0.36;
          for (let i = 0; i < l.runs.length; i++) {
            const r = l.runs[i];
            if (i > 0) xx += RUN_GAP;
            const x0 = xx;
            const ra = lb.alpha * (r.dim ? DIM : 1);
            if (r.mark !== undefined) {
              if (r.mark) {
                canvas.drawCircle(xx + 3.5, my, 4.5, paint(T.bg, 1));
                canvas.drawCircle(xx + 3.5, my, 3.5, paint(r.mark, ra));
              } else {
                const sq = Skia.XYWHRect(xx + 0.75, my - 2.75, 5.5, 5.5);
                canvas.drawRect(sq, paint(T.bg, 1));
                canvas.drawRect(sq, paint(null, ra, 1.25));
              }
              xx += MARK_W;
            }
            text(r.text, xx, base, f, toneOf(l.tone), r.dim ? lb.alpha * 0.55 : lb.alpha);
            xx += f.getTextWidth(r.text);
            if (r.id) opt.hits?.push({ id: r.id, x: x0, y: yy, w: xx - x0, h: lh, crowd: null });
          }
        }
        yy += lh;
      }
      return true;
    }
    return false;
  };

  // 11. Labels, by priority (set by the scene): a block of lines beside the anchor (right, then left, then below),
  // or centred under it for floor labels; skipped when there is no room.
  const tried: boolean[] = [];
  for (const lb of scene.labels) {
    if (opt.far && lb.hideWhenFar) continue;
    // Anchors to try: the node, the point, or for a voyage line its middle, then a third and two thirds along it.
    const pts: number[] = [];
    if (lb.node >= 0) pts.push(anchors[lb.node * 2], anchors[lb.node * 2 + 1]);
    else {
      const a = proj(lb.p.x, lb.p.y, lb.flat ? floorZ : lb.p.z, cam);
      if (lb.q) {
        const b = P(lb.q);
        for (const f of [0.5, 0.33, 0.67]) pts.push(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
      } else pts.push(a.x, a.y);
    }
    // The full text first (at each anchor), then the short one (voyage groups without names).
    const variants = lb.fallback ? [lb.lines, lb.fallback] : [lb.lines];
    let done = false;
    for (let vi = 0; vi < variants.length && !done; vi++) {
      for (let k = 0; k < pts.length && !done; k += 2) {
        const ax = pts[k] + lb.dx;
        const ay = pts[k + 1] + lb.dy;
        if (!on(ax, ay, 0)) continue;
        done = placeLabel(lb, variants[vi], ax, ay, vi === variants.length - 1 && k === 0);
      }
    }
    if (lb.node >= 0) {
      tried[lb.node] = true;
      // Names on, a place whose label found no room still shows who is there: its pip row, in the box held for it
      // (so no label placed before it covers it). A place whose label was placed frees its box.
      const node = scene.nodes[lb.node];
      if (!done && node.namesInLabel) {
        const a = { x: anchors[lb.node * 2], y: anchors[lb.node * 2 + 1] };
        if (on(a.x, a.y, 120)) drawPips(node, a, node.dim ? 0.45 : 1, false, lb.node);
      }
      release(lb.node);
    }
  }
  // Names on, a place with no label at all (none in the scene, or hidden zoomed far out): its pip row where it is clear.
  for (let n = 0; n < scene.nodes.length; n++) {
    const node = scene.nodes[n];
    if (!node.namesInLabel || tried[n]) continue;
    const a = { x: anchors[n * 2], y: anchors[n * 2 + 1] };
    if (on(a.x, a.y, 120)) drawPips(node, a, node.dim ? 0.45 : 1, true, n);
    release(n);
  }

  // 12. Occupied places off screen: an ink triangle on the border pointing at them, with the name and head count.
  for (const m of edgeMarkers(scene, cam, opt.box)) {
    const node = scene.nodes[m.node];
    const c = Math.cos(m.ang);
    const s = Math.sin(m.ang);
    const head = Skia.PathBuilder.Make();
    head.moveTo(m.x + c * 5, m.y + s * 5);
    head.lineTo(m.x + Math.cos(m.ang + 2.5) * 6, m.y + Math.sin(m.ang + 2.5) * 6);
    head.lineTo(m.x + Math.cos(m.ang - 2.5) * 6, m.y + Math.sin(m.ang - 2.5) * 6);
    head.close();
    canvas.drawPath(head.build(), paint(null, node.dim ? 0.5 : 0.9));
    const label = `${node.name} · ${node.count}`;
    const tw = fonts.small.getTextWidth(label);
    let tx = m.x - tw / 2;
    let ty = m.y + 3.5;
    if (Math.abs(c) > 0.6) {
      tx = c > 0 ? m.x - 10 - tw : m.x + 10;
    } else ty = s > 0 ? m.y - 9 : m.y + 16;
    tx = Math.max(bx.l + 2, Math.min(bx.r - 2 - tw, tx));
    if (!fits(tx, ty - 9, tw, 12)) continue;
    placed.push(tx, ty - 9, tw, 12);
    text(label, tx, ty, fonts.small, T.ink2, node.dim ? 0.6 : 1);
  }

  // 13. One ring label, last so it never covers anything: the radius of the first ring (of the first four drawn) with
  // room just outside it. Spots tried for each ring: right and left on its long axis (above the horizon line), centred
  // above its top and below its bottom, then the four diagonal points. Rings skipped beside the globe's equator are
  // not labelled.
  if (skyLabel) {
    const s1 = 'Galactic centre';
    const tw = fonts.small.getTextWidth(s1);
    const tx = skyLabel.x - tw / 2;
    const ty = skyLabel.y - 14;
    if (fits(tx, ty - 9, tw, 11)) {
      placed.push(tx, ty - 9, tw, 11);
      text(s1, tx, ty, fonts.small, T.ink3, skyLabel.k);
    }
  }

  const ringK = Math.max(0, Math.min(1, (squash - 0.15) / 0.2));
  if (sb.pt > 8 && ringK > 0) {
    const D = Math.SQRT1_2;
    let tried = 0;
    for (let k = 1; tried < 4 && k <= 8; k++) {
      const R = k * sb.pt;
      if (GR > 20 && Math.abs(R - GR) < RIM_GAP) continue;
      tried++;
      const s1 = lyLabel(k * sb.ly);
      const tw = fonts.small.getTextWidth(s1);
      const ry = R * squash;
      const dx = R * D;
      const dy = ry * D;
      // [left x, baseline y] of each spot.
      const spots: [number, number][] = [
        [fcx + R + 3, fcy - 3],
        [fcx - R - 3 - tw, fcy - 3],
        [fcx - tw / 2, fcy - ry - 3],
        [fcx - tw / 2, fcy + ry + 11],
        [fcx + dx + 2, fcy - dy - 2],
        [fcx - dx - 2 - tw, fcy - dy - 2],
        [fcx + dx + 2, fcy + dy + 10],
        [fcx - dx - 2 - tw, fcy + dy + 10],
      ];
      let done = false;
      for (const [tx, ty] of spots) {
        if (!fits(tx, ty - 9, tw, 11)) continue;
        placed.push(tx, ty - 9, tw, 11);
        text(s1, tx, ty, fonts.small, T.ink3, Math.round(ringK * 20) / 20);
        done = true;
        break;
      }
      if (done) break;
    }
  }
}
