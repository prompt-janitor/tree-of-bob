// The spoiler gate. computeView() returns everything known at one reading position and nothing past it.
// All screens read from a ProgressView; none of them touch the raw data file.
import {
  chapterIndex,
  headingSetting,
  narratorOf,
  rank,
  revealYear,
  type ChapterRef,
  type Model,
  type Setting,
} from './model';
import type {
  Alternative,
  BobRecord,
  FateRecord,
  MilestoneRecord,
  MoveRecord,
  OtherRecord,
  Reveal,
  ScutRecord,
  Status,
} from './types';

/** The chapter the reader is about to read. `finished` (last chapter only) means the series is read. */
export interface Progress {
  book: number;
  chapter: number;
  finished?: boolean;
}

export interface BobInfo {
  bob: BobRecord;
  /** Creation year; estimated from the parent or the reveal chapter when the data has none. */
  born: number;
  bornEstimated: boolean;
  generation: number;
  moves: MoveRecord[];
  fates: FateRecord[];
  scut: ScutRecord | null;
  kids: string[];
  status: Status;
  statusFate: FateRecord | null;
  /** End of the life lane: year lost, or NOW. */
  end: number;
  /** Last known system (departure point while in transit). */
  loc: string | null;
  inTransit: { to: string | null; from: number | null } | null;
  /** Short "where now" text: a system, "In transit", "Missing" or "Lost". */
  now: string;
  /** Narrator whose identity colour this Bob wears. */
  colourKey: string;
  monogram: string;
  /** Alternative values whose own reveal point has been reached (or that have none). */
  alts: Alternative[];
  /** Who physically made the copy, once revealed and when different from the parent. */
  madeBy: string | null;
  isNew: boolean;
}

export interface ChapterContext {
  ref: ChapterRef;
  narrator: string | null;
  /** The chapter's own story date, or NOW when the chapter has none. */
  time: number | null;
  /** Set only when the chapter is set earlier than NOW: the chapter's year. */
  flashbackYear: number | null;
  /** Where the heading sets the chapter (see headingSetting); from the narrator's records when it doesn't say. */
  setting: Setting['kind'] | null;
  /** The system the chapter is set in, or heading for ("En route to"). */
  system: string | null;
  /** Bobs alive at that system on the chapter date (narrator excluded). */
  here: string[];
  /** Bobs travelling with the narrator: in transit on the same journey on the chapter date. */
  travelling: string[];
  /** Bobs lost at that system on or before the chapter date. */
  lostHere: string[];
}

export interface NewInChapter {
  bobs: string[];
  moves: MoveRecord[];
  fates: FateRecord[];
  scut: ScutRecord[];
  milestones: MilestoneRecord[];
  total: number;
}

export interface ProgressView {
  model: Model;
  progress: Progress;
  index: number;
  /** Reveal gate: rank of the last chapter read (the one before the current chapter, or the current one when
   * finished). Records revealed later stay hidden. */
  P: number;
  /** True after the last chapter of the series. */
  finished: boolean;
  /** NOW: the latest story year the reader has reached. */
  latest: number | null;
  minYear: number;
  maxYear: number;
  ids: string[];
  info: Map<string, BobInfo>;
  moves: MoveRecord[];
  fates: FateRecord[];
  scut: ScutRecord[];
  milestones: MilestoneRecord[];
  others: OtherRecord[];
  /** Revealed movements of other replicants (moves whose "bob" is an others id), in story order. */
  otherMoves: MoveRecord[];
  /** Revealed fates of other replicants, in story order. */
  otherFates: FateRecord[];
  chapter: ChapterContext;
  newHere: NewInChapter;
}

function evYearOf(model: Model, e: { year: number | null; reveal: Reveal }): number | null {
  return typeof e.year === 'number' ? e.year : revealYear(model, e.reveal);
}

export function fateStatus(f: FateRecord): 'lost' | 'missing' | 'alive' {
  return f.status ?? (f.partial ? 'missing' : 'lost');
}

export function computeView(model: Model, progress: Progress): ProgressView {
  let index = chapterIndex(model, progress.book, progress.chapter);
  if (index < 0) index = 0;
  const ref = model.chapters[index];
  const finished = !!progress.finished && index === model.chapters.length - 1;
  // The reader is about to read this chapter: only its heading (narrator, date, place) is known, so records
  // are revealed up to the chapter before it.
  const lastRead = finished ? ref : model.chapters[index - 1];
  const P = lastRead ? rank({ book: lastRead.book.id, chapter: lastRead.chapter.n }) : 0;
  const Pheading = rank({ book: ref.book.id, chapter: ref.chapter.n });
  const seen = (r: Reveal | null | undefined) => rank(r) <= P;
  const latest = model.latestYearAt[index];
  const d = model.data;

  const bobs = d.bobs.filter((b) => seen(b.reveal));
  const vis = new Set(bobs.map((b) => b.id));
  const moves = d.moves.filter((m) => seen(m.reveal) && vis.has(m.bob));
  const fates = d.fates.filter((f) => seen(f.reveal) && vis.has(f.bob));
  const scut = (d.scut ?? []).filter((s) => seen(s.reveal) && vis.has(s.bob));
  const milestones = (d.milestones ?? []).filter((m) => seen(m.reveal));
  const others = (d.others ?? []).filter((o) => seen(o.reveal));
  const otherIds = new Set(others.map((o) => o.id));
  const otherMoves = d.moves
    .filter((m) => seen(m.reveal) && otherIds.has(m.bob))
    .sort((a, c) => (evYearOf(model, a) ?? 0) - (evYearOf(model, c) ?? 0) || rank(a.reveal) - rank(c.reveal));
  const otherFates = d.fates
    .filter((f) => seen(f.reveal) && otherIds.has(f.bob))
    .sort((a, c) => (evYearOf(model, a) ?? 0) - (evYearOf(model, c) ?? 0) || rank(a.reveal) - rank(c.reveal));
  const evYear = (e: { year: number | null; reveal: Reveal }) => (typeof e.year === 'number' ? e.year : revealYear(model, e.reveal));

  // creation years (estimated from parent or reveal chapter when unknown)
  const bornMemo = new Map<string, { y: number; est: boolean }>();
  const effBorn = (b: BobRecord): { y: number; est: boolean } => {
    const hit = bornMemo.get(b.id);
    if (hit) return hit;
    let y = typeof b.born === 'number' ? b.born : null;
    const est = y == null;
    if (y == null) {
      const parent = b.parent && vis.has(b.parent) ? model.bobById.get(b.parent) : undefined;
      const py = parent ? effBorn(parent).y : null;
      const ry = revealYear(model, b.reveal);
      y = ry != null ? (py != null ? Math.max(py, ry) : ry) : py ?? latest ?? 0;
    }
    const out = { y, est };
    bornMemo.set(b.id, out);
    return out;
  };

  const info = new Map<string, BobInfo>();
  for (const b of bobs) {
    const { y, est } = effBorn(b);
    info.set(b.id, {
      bob: b, born: y, bornEstimated: est, generation: 0, moves: [], fates: [], scut: null, kids: [],
      status: 'active', statusFate: null, end: y, loc: null, inTransit: null, now: '', colourKey: model.root,
      monogram: '', alts: [], madeBy: null, isNew: rank(b.reveal) === P,
    });
  }
  for (const s of scut) {
    const I = info.get(s.bob)!;
    if (!I.scut) I.scut = s;
  }
  for (const m of moves) info.get(m.bob)!.moves.push(m);
  for (const I of info.values()) I.moves.sort((a, c) => (evYear(a) ?? 0) - (evYear(c) ?? 0) || rank(a.reveal) - rank(c.reveal));
  inferHeadingMoves(model, index, info);
  for (const f of fates) info.get(f.bob)!.fates.push(f);

  let maxYear = latest ?? Number.NEGATIVE_INFINITY;
  let minYear = Number.POSITIVE_INFINITY;
  for (const b of bobs) {
    const I = info.get(b.id)!;
    minYear = Math.min(minYear, I.born);
    I.moves.sort((a, c) => (evYear(a) ?? 0) - (evYear(c) ?? 0) || rank(a.reveal) - rank(c.reveal));
    // Last revealed fate wins, except that "missing" never overrides a known loss.
    let status: Status = 'active';
    let lostAt: number | null = null;
    for (const f of I.fates) {
      const s = fateStatus(f);
      if (s === 'missing' && status === 'lost') continue;
      status = s === 'alive' ? 'active' : s;
      I.statusFate = f;
      if (s === 'lost') lostAt = evYear(f);
    }
    I.status = status;
    const end = status === 'lost' ? lostAt ?? latest : latest;
    I.end = Math.max(I.born, end ?? I.born);
    let loc = b.where ?? null;
    let transit: BobInfo['inTransit'] = null;
    for (const m of I.moves) {
      const yy = evYear(m);
      if (m.kind === 'depart') {
        transit = { to: m.to ?? null, from: yy };
        if (m.from) loc = m.from;
      } else {
        transit = null;
        loc = m.to ?? loc;
      }
      if (yy != null) maxYear = Math.max(maxYear, yy);
    }
    I.loc = loc;
    I.inTransit = transit;
    I.now = status === 'lost' ? 'Lost' : status === 'missing' ? 'Missing' : transit ? 'In transit' : loc ?? 'Location not given';
    for (const f of I.fates) {
      const yy = evYear(f);
      if (yy != null) maxYear = Math.max(maxYear, yy);
    }
    maxYear = Math.max(maxYear, I.end);
    I.alts = (b.alt ?? []).filter((a) => !a.reveal || seen(a.reveal));
    const mb = b.madeBy;
    I.madeBy = mb && mb.id !== b.parent && vis.has(mb.id) && (!mb.reveal || seen(mb.reveal)) ? mb.id : null;
    if (b.parent && vis.has(b.parent)) info.get(b.parent)!.kids.push(b.id);
  }
  const byBirth = (a: string, c: string) => {
    const A = info.get(a)!, C = info.get(c)!;
    return A.born - C.born || rank(A.bob.reveal) - rank(C.bob.reveal) || (a < c ? -1 : 1);
  };
  for (const I of info.values()) I.kids.sort(byBirth);

  // generation: root is 1; Bobs with an unknown or unrevealed parent have generation 0 (unknown)
  const genOf = (id: string, guard = 0): number => {
    const I = info.get(id)!;
    if (I.generation) return I.generation;
    if (id === model.root) return (I.generation = 1);
    const p = I.bob.parent;
    if (!p || !vis.has(p) || guard > 200) return 0;
    const g = genOf(p, guard + 1);
    return (I.generation = g ? g + 1 : 0);
  };
  for (const id of vis) genOf(id);

  assignColours(model, Pheading, info, vis);
  assignMonograms(bobs.map((b) => b.id), info);

  const chapter = chapterContext(model, ref, latest, info);
  const at = (r: Reveal) => rank(r) === P;
  const nb = bobs.filter((b) => at(b.reveal)).map((b) => b.id);
  const nm = moves.filter((m) => at(m.reveal));
  const nf = fates.filter((f) => at(f.reveal));
  const ns = scut.filter((s) => at(s.reveal));
  const nml = milestones.filter((m) => at(m.reveal));

  return {
    model, progress: finished ? { book: ref.book.id, chapter: ref.chapter.n, finished } : { book: ref.book.id, chapter: ref.chapter.n }, index, P, finished, latest,
    minYear: Number.isFinite(minYear) ? minYear : latest ?? 0,
    maxYear: Number.isFinite(maxYear) ? maxYear : latest ?? 0,
    ids: bobs.map((b) => b.id), info, moves, fates, scut, milestones, others, otherMoves, otherFates, chapter,
    newHere: { bobs: nb, moves: nm, fates: nf, scut: ns, milestones: nml, total: nb.length + nm.length + nf.length + ns.length + nml.length },
  };
}

/**
 * Colour rules: a narrator wears his own slot once the reader has reached his first chapter. Everyone else
 * wears the colour of the narrator of the chapter where he first appears; if that narrator is not a (visible) Bob,
 * he wears his parent's colour; failing that, the root's.
 */
function assignColours(model: Model, P: number, info: Map<string, BobInfo>, vis: Set<string>) {
  const memo = new Map<string, string>();
  const busy = new Set<string>();
  const key = (id: string): string => {
    const hit = memo.get(id);
    if (hit) return hit;
    if (busy.has(id)) return model.root;
    busy.add(id);
    const b = model.bobById.get(id)!;
    const first = model.povFirst.get(id);
    const ref = model.chapters[chapterIndex(model, b.reveal.book, b.reveal.chapter)];
    const narrator = ref ? narratorOf(model, ref.chapter) : null;
    let k: string;
    if (first != null && first <= P) k = id;
    else if (narrator && narrator !== id && vis.has(narrator)) k = key(narrator);
    else if (b.parent && vis.has(b.parent)) k = key(b.parent);
    else k = model.root;
    busy.delete(id);
    memo.set(id, k);
    return k;
  };
  for (const id of vis) info.get(id)!.colourKey = key(id);
}

/** Two-letter monograms, unique among visible Bobs, first-revealed Bob keeps the plain form (HO, then HW). */
function assignMonograms(ids: string[], info: Map<string, BobInfo>) {
  const used = new Set<string>();
  for (const id of ids) {
    const letters = id.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').toUpperCase();
    const first = letters[0] ?? '?';
    let pick = (letters.slice(0, 2) || first + first).padEnd(2, first);
    if (used.has(pick)) {
      const alt = [...letters.slice(2)].map((c) => first + c).find((c) => !used.has(c));
      pick = alt ?? pick;
    }
    used.add(pick);
    info.get(id)!.monogram = pick;
  }
}

/**
 * A chapter heading names the narrator, a date and a place, and the reader knows it on starting the chapter, so
 * the narrator's position on that date follows the heading even before the records catch up:
 * - set in a system, or approaching one: if the records still have him in transit there (or to somewhere not
 *   given), he has arrived, and Bobs who left on the same journey at the same time arrive with him;
 * - en route, or in interstellar space: if the records still have him in a system, he has left it.
 * A system heading that isn't his destination is left alone, since Bobs often narrate distant events over SCUT.
 * Inferred moves go into each Bob's own moves only, never into the Log.
 */
function inferHeadingMoves(model: Model, index: number, info: Map<string, BobInfo>) {
  const partial = { model, info };
  const yearOf = (m: MoveRecord) => m.year ?? revealYear(model, m.reveal) ?? 0;
  const add = (m: MoveRecord) => {
    const I = info.get(m.bob)!;
    I.moves.push(m);
    I.moves.sort((a, c) => yearOf(a) - yearOf(c));
  };
  for (const ref of model.chapters.slice(0, index + 1)) {
    const t = ref.chapter.year;
    const nar = narratorOf(model, ref.chapter);
    const where = headingSetting(model, ref.chapter.place);
    if (typeof t !== 'number' || !nar || !info.has(nar) || !where) continue;
    const s = locAt(partial, nar, t);
    if (!s || s.notYet || s.status !== 'active') continue;
    const reveal = { book: ref.book.id, chapter: ref.chapter.n };
    const base = { year: t, at: null, reveal, confidence: 'low' as const, inferred: true };
    if (where.kind === 'enroute' || where.kind === 'deep') {
      if (!s.transit) add({ ...base, bob: nar, kind: 'depart', from: s.loc, to: where.system });
      continue;
    }
    if (!s.transit || (s.transit.to && s.transit.to !== where.system)) continue;
    const dep = travelLeg(partial, nar, t);
    for (const id of dep ? companions(partial, nar, t, dep) : []) add({ ...base, bob: id, kind: 'arrive', from: dep!.from ?? null, to: where.system });
    add({ ...base, bob: nar, kind: 'arrive', from: dep?.from ?? null, to: where.system });
  }
}

/** The departure a Bob is travelling on at time t. */
function travelLeg(view: Pick<ProgressView, 'model' | 'info'>, id: string, t: number): MoveRecord | null {
  const moves = view.info.get(id)?.moves ?? [];
  let leg: MoveRecord | null = null;
  for (const m of moves) {
    const y = m.year ?? revealYear(view.model, m.reveal);
    if (y == null || y > t) continue;
    leg = m.kind === 'depart' ? m : null;
  }
  return leg;
}

/** Bobs in transit at time t on the same journey as `leg`: same origin and destination, leaving together. */
function companions(view: Pick<ProgressView, 'model' | 'info'>, id: string, t: number, leg: MoveRecord): string[] {
  const out: string[] = [];
  for (const o of view.info.keys()) {
    if (o === id) continue;
    const s = locAt(view, o, t);
    if (!s || s.notYet || !s.transit || s.status !== 'active') continue;
    const od = travelLeg(view, o, t);
    if (od && (od.to ?? null) === (leg.to ?? null) && (od.from ?? null) === (leg.from ?? null) && Math.abs((od.year ?? 0) - (leg.year ?? 0)) < 0.1) out.push(o);
  }
  return out;
}

/** Where a Bob was at story time t, using only revealed records. */
export function locAt(view: Pick<ProgressView, 'model' | 'info'>, id: string, t: number) {
  const I = view.info.get(id);
  if (!I) return null;
  if (I.born > t + 0.05) return { notYet: true as const };
  const evYear = (e: { year: number | null; reveal: Reveal }) => (typeof e.year === 'number' ? e.year : revealYear(view.model, e.reveal));
  let loc = I.bob.where ?? null;
  let transit: { to: string | null } | null = null;
  for (const m of I.moves) {
    const y = evYear(m);
    if (y == null || y > t) continue;
    if (m.kind === 'depart') {
      transit = { to: m.to ?? null };
      if (m.from) loc = m.from;
    } else {
      transit = null;
      loc = m.to ?? loc;
    }
  }
  let status: Status = 'active';
  let lostAt: number | null = null;
  for (const f of I.fates) {
    const y = evYear(f);
    const s = fateStatus(f);
    if (y == null || y > t || (s === 'missing' && status === 'lost')) continue;
    status = s === 'alive' ? 'active' : s;
    if (s === 'lost') lostAt = y;
  }
  return { notYet: false as const, loc, transit, status, lostAt };
}

function chapterContext(
  model: Model,
  ref: ChapterRef,
  latest: number | null,
  info: Map<string, BobInfo>,
): ChapterContext {
  const narratorId = narratorOf(model, ref.chapter);
  const narrator = narratorId && info.has(narratorId) ? narratorId : null;
  const time = typeof ref.chapter.year === 'number' ? ref.chapter.year : latest;
  const flashbackYear = typeof ref.chapter.year === 'number' && latest != null && ref.chapter.year < latest - 0.05 ? ref.chapter.year : null;
  const partial = { model, info };
  const nl = narrator && time != null ? locAt(partial, narrator, time) : null;
  let setting: ChapterContext['setting'] = null;
  let system: string | null = null;
  const heading = headingSetting(model, ref.chapter.place);
  if (heading) {
    setting = heading.kind;
    system = heading.system;
  } else if (nl && !nl.notYet) {
    // No usable place in the heading: follow the narrator's records.
    if (nl.transit) {
      setting = nl.transit.to ? 'enroute' : 'deep';
      system = nl.transit.to;
    } else if (nl.loc) {
      setting = 'system';
      system = nl.loc;
    }
  }
  const here: string[] = [];
  const lostHere: string[] = [];
  if (narrator && system && time != null) {
    for (const id of info.keys()) {
      if (id === narrator) continue;
      const s = locAt(partial, id, time);
      if (!s || s.notYet || s.loc !== system) continue;
      if (s.status === 'lost') lostHere.push(id);
      else if (s.status === 'active' && !s.transit) here.push(id);
    }
  }
  const leg = narrator && time != null && nl && !nl.notYet && nl.transit ? travelLeg(partial, narrator, time) : null;
  const travelling = leg && narrator && time != null ? companions(partial, narrator, time, leg) : [];
  return { ref, narrator, time, flashbackYear, setting, system, here, lostHere, travelling };
}
