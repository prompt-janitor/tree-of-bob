// One Bob's journey as a line of stations: stays at a system (with the other Bobs, and other replicants, there at
// the same time), legs in transit, instant wormhole hops and transmissions, joining SCUT and the end of the line.
// Built only from a ProgressView (view.moves, view.otherMoves), so nothing past the reader's position can appear.
// Story order, not to scale.
import { revealYear } from './model';
import type { MoveRecord, Reveal, Via } from './types';
import { fateStatus, type ProgressView } from './view';

/** Another Bob (or another replicant, isOther) at the same system during part or all of a stay. */
export interface Company {
  id: string;
  /** Another replicant (an others[] id), not a Bob. */
  isOther: boolean;
  from: number;
  to: number;
  /** True when he is there for the whole stay. */
  whole: boolean;
  /** How he comes into the stay. At the station where this Bob is made: his parent, or a sibling made at the same
   * moment. Otherwise: already there, arrives with this Bob (they travelled together), arrives from elsewhere, is
   * made here by another Bob, or is a copy this Bob makes. */
  came: 'parent' | 'sibling' | 'here' | 'with' | 'arrived' | 'made' | 'copy';
  /** How he leaves it before this Bob does; null when he is still there when this Bob leaves (or at NOW). */
  went: 'left' | 'lost' | null;
}

export type JourneyItem =
  | {
      kind: 'stay';
      place: string | null;
      from: number;
      to: number;
      ongoing: boolean;
      origin: boolean;
      estimated: boolean;
      company: Company[];
      /** Other replicants there during the stay (same rules as company; never parent, sibling or copy). */
      others: Company[];
      /** Set when he joined SCUT during this stay. */
      scut: { year: number; how: string } | null;
    }
  | {
      kind: 'transit';
      from: number;
      to: number;
      dest: string | null;
      ongoing: boolean;
      /** Bobs on the same journey: leaving together for the same destination. */
      company: string[];
      /** Other replicants on the same journey. */
      others: string[];
    }
  | {
      /** An instant jump: a wormhole hop or a matrix transmitted by comms. No duration. */
      kind: 'hop';
      year: number;
      from: string | null;
      /** Where he comes out; null when the record doesn't say. */
      to: string | null;
      via: Exclude<Via, 'voyage'>;
      /** Bobs and other replicants making the same hop at the same moment. */
      company: string[];
      others: string[];
    }
  | { kind: 'scut'; year: number; how: string }
  | { kind: 'end'; year: number; status: 'lost' | 'missing' };

interface Segment {
  kind: 'stay' | 'transit' | 'hop';
  /** Stay: the system. Transit and hop: the destination. */
  place: string | null;
  from: number;
  to: number;
  /** Stay after an arrival, and hop: the last system he was at before it. */
  prev?: string | null;
  via?: Exclude<Via, 'voyage'>;
}

const jump = (m: MoveRecord): Exclude<Via, 'voyage'> | null => (m.via && m.via !== 'voyage' ? m.via : null);

const EPS = 0.01;

function evYear(view: Pick<ProgressView, 'model'>, e: { year: number | null; reveal: Reveal }): number | null {
  return typeof e.year === 'number' ? e.year : revealYear(view.model, e.reveal);
}

/** Where the line ends: the year lost, the year he went missing, or NOW. */
function lineEnd(view: ProgressView, id: string): { year: number; status: 'active' | 'lost' | 'missing' } {
  const I = view.info.get(id)!;
  if (I.status === 'lost') return { year: I.end, status: 'lost' };
  if (I.status === 'missing') {
    const y = I.statusFate ? evYear(view, I.statusFate) : null;
    return { year: Math.max(I.born, y ?? view.latest ?? I.born), status: 'missing' };
  }
  return { year: Math.max(I.born, view.latest ?? I.born), status: 'active' };
}

/** Stays and transit legs from creation to the end of the line. */
function segmentsOf(view: ProgressView, id: string): Segment[] {
  const I = view.info.get(id)!;
  return segmentsFrom(view, I.moves, I.born, I.bob.where ?? null, lineEnd(view, id).year);
}

/** Where another replicant's line ends: the year of his last revealed loss up to NOW (a later "alive" fate undoes
 * it; "missing" never overrides a loss, as in otherAt), or NOW. */
function otherEnd(view: ProgressView, id: string, start: number): { year: number; lost: boolean } {
  const now = view.latest ?? start;
  let lost: number | null = null;
  for (const f of view.otherFates) {
    if (f.bob !== id) continue;
    const y = evYear(view, f);
    const s = fateStatus(f);
    if (y == null || y > now + EPS) continue;
    if (s === 'lost') lost = y;
    else if (s === 'alive') lost = null;
  }
  return lost != null ? { year: Math.max(start, lost), lost: true } : { year: Math.max(start, now), lost: false };
}

/** Another replicant's stays and legs, from his first revealed move to his loss or NOW. */
function otherSegments(view: ProgressView, id: string): Segment[] {
  const moves = view.otherMoves.filter((m) => m.bob === id);
  const first = moves[0];
  const start = first ? evYear(view, first) : null;
  if (!first || start == null) return [];
  const end = otherEnd(view, id, start).year;
  return segmentsFrom(view, moves, start, first.kind === 'depart' ? first.from ?? null : null, end);
}

/** Stays, transit legs and hops from a list of moves in story order. A wormhole hop or a transmission is a
 * point on the line, not a leg: arriving that way (or leaving that way into a network) ends the stay there and
 * opens the next one at once. */
function segmentsFrom(view: ProgressView, moves: MoveRecord[], start: number, where: string | null, end: number): Segment[] {
  const out: Segment[] = [];
  let open: Segment = { kind: 'stay', place: where, from: start, to: end };
  let last = where;
  for (const m of moves) {
    const y = Math.min(end, Math.max(open.from, evYear(view, m) ?? open.from));
    const via = jump(m);
    if (open.kind === 'stay' && open.place == null && m.from) open.place = m.from;
    if (open.kind === 'stay' && open.place != null) last = open.place;
    if (via) {
      // Into a network (or nowhere given) on departure, or out at the far end on arrival: either way instant.
      const from = m.from ?? last;
      out.push({ ...open, to: y });
      out.push({ kind: 'hop', place: m.to ?? null, from: y, to: y, prev: from, via });
      open = { kind: 'stay', place: m.to ?? null, from: y, to: end, prev: from };
      continue;
    }
    if (m.kind === 'depart') {
      if (open.kind === 'stay') {
        out.push({ ...open, to: y });
        open = { kind: 'transit', place: m.to ?? null, from: y, to: end, prev: open.place };
      } else {
        open.place = m.to ?? open.place;
      }
    } else {
      const prev = m.from ?? (open.kind === 'transit' ? open.prev : open.place) ?? last;
      out.push({ ...open, to: y });
      open = { kind: 'stay', place: m.to ?? (open.kind === 'transit' ? open.place : null), from: y, to: end, prev };
    }
  }
  out.push(open);
  return out;
}

function howCame(f: { first: boolean; present: boolean; parent: boolean; sibling: boolean; travelledWith: boolean; bornHere: boolean; copy: boolean }): Company['came'] {
  if (f.first && f.present && f.parent) return 'parent';
  if (f.first && f.present && f.sibling) return 'sibling';
  if (f.travelledWith) return 'with';
  if (f.present) return 'here';
  if (f.bornHere) return f.copy ? 'copy' : 'made';
  return 'arrived';
}

export function journey(view: ProgressView, id: string): JourneyItem[] {
  const I = view.info.get(id);
  if (!I) return [];
  const end = lineEnd(view, id);
  const ongoing = end.status === 'active';
  const segs = segmentsOf(view, id);

  const cache = new Map<string, Segment[]>();
  const segsOf = (o: string, isOther: boolean) => {
    const key = `${isOther ? 'o' : 'b'}:${o}`;
    let s = cache.get(key);
    if (!s) cache.set(key, (s = isOther ? otherSegments(view, o) : segmentsOf(view, o)));
    return s;
  };
  const lostAt = (o: string, isOther: boolean) => {
    if (isOther) {
      const first = view.otherMoves.find((m) => m.bob === o);
      const start = first ? evYear(view, first) : null;
      if (start == null) return null;
      const e = otherEnd(view, o, start);
      return e.lost ? e.year : null;
    }
    const e = lineEnd(view, o);
    return e.status === 'lost' ? e.year : null;
  };
  const bobs = view.ids.filter((o) => o !== id);
  const others = view.others.map((o) => o.id);

  const items: JourneyItem[] = [];
  segs.forEach((s, i) => {
    items.push(itemFor(s, i));
  });
  function itemFor(s: Segment, i: number): JourneyItem {
    const last = i === segs.length - 1;
    if (s.kind === 'hop') {
      const same = (o: string, isOther: boolean) => segsOf(o, isOther).some((t) => t.kind === 'hop' && t.place === s.place && Math.abs(t.from - s.from) < 0.05);
      return {
        kind: 'hop', year: s.from, from: s.prev ?? null, to: s.place, via: s.via!,
        company: bobs.filter((o) => same(o, false)), others: others.filter((o) => same(o, true)),
      };
    }
    if (s.kind === 'transit') {
      const same = (o: string, isOther: boolean) => segsOf(o, isOther).some((t) => t.kind === 'transit' && t.place === s.place && Math.abs(t.from - s.from) < 0.1);
      return {
        kind: 'transit', from: s.from, to: s.to, dest: s.place, ongoing: last && ongoing,
        company: bobs.filter((o) => same(o, false)), others: others.filter((o) => same(o, true)),
      };
    }
    const at = (o: string, isOther: boolean): Company[] => {
      if (s.place == null) return [];
      const out: Company[] = [];
      const O = isOther ? null : view.info.get(o)!;
      const mine = segsOf(o, isOther);
      // A stay that starts on the date it ends (arriving at NOW) still has whoever is there at that moment.
      const instant = s.to - s.from <= EPS;
      for (const t of mine) {
        if (t.kind !== 'stay' || t.place !== s.place) continue;
        const from = Math.max(s.from, t.from);
        const to = Math.min(s.to, t.to);
        const lost = lostAt(o, isOther);
        // Lost on arrival (the records give both the same date) still counts: he was there, and was lost there.
        const lostOnArrival = lost != null && Math.abs(lost - t.to) < 0.05 && t === mine[mine.length - 1] && t.from >= s.from - EPS && t.to <= s.to + EPS;
        if (instant ? !(t.from <= s.from + EPS && t.to >= s.to - EPS) : to - from <= EPS && !lostOnArrival) continue;
        const bornHere = !!O && Math.abs(O.born - t.from) < 0.05 && t === mine[0];
        const prev = items[items.length - 1];
        // Travelled together: on the same journey into this station, or (when the records skip the leg) arriving at
        // the same moment from the same place.
        const sameLeg = (prev?.kind === 'transit' || prev?.kind === 'hop') && (isOther ? prev.others : prev.company).includes(o);
        const sameArrival = i > 0 && s.prev != null && t.prev === s.prev && t !== mine[0] && Math.abs(t.from - s.from) < 0.05;
        const came = howCame({
          first: i === 0,
          present: from <= s.from + EPS,
          parent: !isOther && o === I!.bob.parent,
          sibling: !!O && !!O.bob.parent && O.bob.parent === I!.bob.parent && Math.abs(O.born - I!.born) < 0.05,
          travelledWith: (sameLeg || sameArrival) && Math.abs(t.from - s.from) < 0.1,
          bornHere,
          copy: !!O && O.bob.parent === id,
        });
        const went: Company['went'] = to < s.to - EPS ? (lost != null && Math.abs(lost - to) < 0.05 ? 'lost' : 'left') : null;
        out.push({ id: o, isOther, from, to, whole: from <= s.from + EPS && to >= s.to - EPS, came, went });
      }
      return out;
    };
    const order = (a: Company, b: Company) => a.from - b.from || (a.id < b.id ? -1 : 1);
    const company = bobs.flatMap((o) => at(o, false)).sort(order);
    const otherCompany = others.flatMap((o) => at(o, true)).sort(order);
    return {
      kind: 'stay', place: s.place, from: s.from, to: s.to, ongoing: last && ongoing, origin: i === 0, estimated: i === 0 && I!.bornEstimated,
      company, others: otherCompany, scut: null,
    };
  }

  if (I.scut) {
    const y = I.scut.how === 'born' ? I.born : evYear(view, I.scut) ?? I.born;
    const scut = { year: y, how: I.scut.how };
    // During a stay it belongs to that station; otherwise it is an event on the line after the leg it falls in.
    const stay = items.find((it) => it.kind === 'stay' && y >= it.from - EPS && (y < it.to - EPS || it.ongoing || it === items[items.length - 1]));
    if (stay && stay.kind === 'stay') stay.scut = scut;
    else {
      const at = items.findIndex((it) => (it.kind === 'stay' || it.kind === 'transit') && it.from > y + EPS);
      items.splice(at < 0 ? items.length : at, 0, { kind: 'scut', ...scut });
    }
  }
  if (end.status !== 'active') items.push({ kind: 'end', year: end.year, status: end.status });
  return items;
}
