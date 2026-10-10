// Life-lane geometry: where a Bob was (at a system, in transit) over story time, clipped to an axis window.
import { revealYear } from './model';
import type { ProgressView } from './view';

export type Zoom = 'all' | 'recent' | 'chapter';

export interface Axis {
  x0: number;
  x1: number;
  /** NOW marker (always the right edge or inside the window). */
  now: number | null;
  /** Chapter-date marker, only for flashback chapters. */
  ch: number | null;
  ticks: { year: number; label: string }[];
  unit: 'months' | 'years';
}

export interface Segment {
  kind: 'stay' | 'transit' | 'estimated';
  /** 0–1 fractions of the axis width. */
  start: number;
  end: number;
  place: string | null;
}

export interface Lane {
  segments: Segment[];
  /** Fraction where the Bob was lost, if inside the window. */
  lostAt: number | null;
  /** Fraction of the chapter-date ring, when this Bob gets one. */
  ring: number | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The axis never extends past NOW, so its range can't hint at later events. */
export function axisFor(view: ProgressView, zoom: Zoom): Axis {
  const now = view.latest;
  const hi = Math.max(now ?? view.maxYear, view.minYear);
  let lo = view.minYear;
  if (zoom === 'recent') lo = Math.max(lo, hi - view.model.recentYears);
  if (zoom === 'chapter' && view.chapter.time != null) lo = Math.max(lo, Math.min(view.chapter.time, hi) - 25);
  // Very short spans (early Book 1) widen to the left, so NOW stays at the right edge.
  const span = Math.max(hi - lo, 0.25);
  const x1 = hi;
  const x0 = hi - span;
  const unit = span < 2 ? 'months' : 'years';
  const ticks: Axis['ticks'] = [];
  if (unit === 'months') {
    const step = span < 0.75 ? 1 / 12 : 3 / 12;
    for (let y = Math.ceil(x0 * 12) / 12; y <= x1; y += step) {
      const m = Math.round((y - Math.floor(y)) * 12) % 12;
      ticks.push({ year: y, label: MONTHS[m] });
    }
  } else {
    const step = span <= 30 ? 5 : span <= 80 ? 10 : span <= 160 ? 25 : 50;
    for (let y = Math.ceil(x0 / step) * step; y <= x1; y += step) ticks.push({ year: y, label: String(y) });
  }
  return { x0, x1, now, ch: view.chapter.flashbackYear, ticks, unit };
}

export const frac = (axis: Axis, y: number) => Math.min(1, Math.max(0, (y - axis.x0) / (axis.x1 - axis.x0)));

export function laneFor(view: ProgressView, id: string, axis: Axis, ringIds: Set<string>): Lane {
  const I = view.info.get(id)!;
  const evYear = (e: { year: number | null; reveal: { book: number; chapter: number } }) =>
    typeof e.year === 'number' ? e.year : revealYear(view.model, e.reveal);
  const raw: { kind: Segment['kind']; a: number; b: number; place: string | null }[] = [];
  let cursor = I.born;
  let transit = false;
  let place = I.bob.where ?? null;
  if (I.bornEstimated) raw.push({ kind: 'estimated', a: I.born - Math.min(3, (axis.x1 - axis.x0) * 0.05), b: I.born, place: null });
  for (const m of I.moves) {
    const y = evYear(m);
    if (y == null || y < cursor) continue;
    raw.push({ kind: transit ? 'transit' : 'stay', a: cursor, b: Math.min(y, I.end), place: transit ? null : place });
    cursor = y;
    if (m.kind === 'depart') {
      transit = true;
      if (m.from) place = m.from;
    } else {
      transit = false;
      place = m.to ?? place;
    }
  }
  if (I.end >= cursor) raw.push({ kind: transit ? 'transit' : 'stay', a: cursor, b: I.end, place: transit ? null : place });
  const segments = raw
    .filter((s) => s.b >= axis.x0 && s.a <= axis.x1)
    .map((s) => ({ kind: s.kind, start: frac(axis, s.a), end: frac(axis, s.b), place: s.place }));
  const lostAt = I.status === 'lost' && I.end >= axis.x0 ? frac(axis, I.end) : null;
  const ring = axis.ch != null && ringIds.has(id) ? frac(axis, axis.ch) : null;
  return { segments, lostAt, ring };
}
