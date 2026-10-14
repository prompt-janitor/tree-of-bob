// The Systems map: where everyone is on a given story date, built only from a ProgressView (so nothing past the
// reveal gate or NOW can appear), plus the geometry to draw it.
import { rank, revealYear, type Model } from './model';
import type { MoveRecord, PresenceRecord, RemoteVia, Reveal, ScutRange, SystemRecord, Via } from './types';
import { fateStatus, knownPlaces, locAt, type ProgressView } from './view';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const LY_PER_PC = 3.26156;
/** Places within this distance of Sol belong to the local neighbourhood level; anything further is galaxy level. */
export const LOCAL_RADIUS_LY = 200;

// Equatorial J2000 → galactic (IAU 1958, Hipparcos values): x towards the galactic centre, y towards l = 90°,
// z towards the north galactic pole.
const EQ_TO_GAL = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];

export function toGalactic(p: Vec3): Vec3 {
  const [a, b, c] = EQ_TO_GAL;
  return {
    x: a[0] * p.x + a[1] * p.y + a[2] * p.z,
    y: b[0] * p.x + b[1] * p.y + b[2] * p.z,
    z: c[0] * p.x + c[1] * p.y + c[2] * p.z,
  };
}

export function distanceLy(a: Vec3, b: Vec3 = { x: 0, y: 0, z: 0 }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * LY_PER_PC;
}

export function lerp3(a: Vec3, b: Vec3, f: number): Vec3 {
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
}

/** A "near" place this close to its anchor is drawn on it; further out, its direction is unknown, so it is unplaced. */
export const NEAR_SAME_POINT_LY = 10;

/** A best-guess position: the catalogue star chosen (null: a point in a region) and the 95% range of its distance
 * from Sol. */
export interface PlaceGuess {
  candidate: string | null;
  rangeLy: [number, number] | null;
}

/** Whether a place's position is a best guess: its own, or that of the place it sits on (near, within
 * NEAR_SAME_POINT_LY). The guess's free text is left out: it may cite later chapters. */
export function placeGuess(model: Model, id: string): PlaceGuess | null {
  const recs = model.data.systems ?? [];
  let at: string | null = id;
  for (let i = 0; i < 8 && at; i++) {
    const s = recs.find((x) => x.id === at);
    if (!s) return null;
    if (s.guess) return { candidate: s.guess.candidate ?? null, rangeLy: s.guess.distSolLy95 ?? null };
    if (s.pos || s.kind !== 'near' || (s.offsetLy ?? 0) > NEAR_SAME_POINT_LY) return null;
    at = s.near ?? null;
  }
  return null;
}

/** Galactic-frame positions (parsecs) for every place that has one. A "near" place within NEAR_SAME_POINT_LY of its
 * anchor sits on it (a few light years from a galactic-scale object is the same point). Static: no progress involved. */
export function placePositions(model: Model): Map<string, Vec3> {
  const out = new Map<string, Vec3>();
  const recs = new Map((model.data.systems ?? []).map((s) => [s.id, s]));
  const resolve = (s: SystemRecord, guard = 0): Vec3 | null => {
    if (s.pos) return toGalactic(s.pos);
    if (s.kind === 'near' && s.near && (s.offsetLy ?? 0) <= NEAR_SAME_POINT_LY && guard < 10) {
      const n = recs.get(s.near);
      return n ? resolve(n, guard + 1) : null;
    }
    return null;
  };
  for (const s of recs.values()) {
    const p = resolve(s);
    if (p) out.set(s.id, p);
  }
  return out;
}

/** The background starfield reaches this far from Sol (the cutoff of data.stars). */
export const BACKGROUND_RADIUS_LY = 25;

/** Background stars, galactic frame: the catalogue stars, plus every story system with a catalogue position inside
 * the starfield radius that is not on the map yet, so an unknown system looks exactly like any other unlabelled star
 * (no gap where a future destination sits, and nothing new appears when it is named). */
export function backgroundStars(view: ProgressView, state: Pick<MapState, 'places'>): Vec3[] {
  const out = (view.model.data.stars ?? []).map((s) => toGalactic(s));
  const onMap = new Set(state.places.map((p) => p.id));
  for (const s of view.model.data.systems ?? []) {
    if (!s.pos || onMap.has(s.id)) continue;
    const g = toGalactic(s.pos);
    if (distanceLy(g) <= BACKGROUND_RADIUS_LY) out.push(g);
  }
  return out;
}


export interface MapPlace {
  id: string;
  /** Galactic frame, parsecs from Sol; null for places with no position (listed beside the map instead). */
  pos: Vec3 | null;
  kind: SystemRecord['kind'] | 'unknown';
  local: boolean;
  bobs: string[];
  others: string[];
  lost: string[];
  narrator: boolean;
  /** Someone here is on SCUT by this date. */
  scut: boolean;
  /** The books do not place it: its position is a best guess. */
  guess: PlaceGuess | null;
  /** Colonies, outposts and held territory here on this date, as far as the reader knows. */
  presence: MapPresence[];
}

export interface MapPresence {
  group: string;
  /** The group's display name. */
  groupLabel: string;
  /** Its short adjective form on the map ("Human", "Deltan"). */
  groupShort: string;
  human: boolean;
  kind: PresenceRecord['kind'];
  /** Name of the colony or base, when it has one. */
  name: string | null;
}

export interface MapVoyage {
  who: string;
  isOther: boolean;
  from: string | null;
  to: string | null;
  /** Year he left; when no departure record is revealed this is a stand-in (his creation), and departKnown is false. */
  departed: number;
  /** A revealed departure record gives the year (an inferred one counts, with departInferred set). */
  departKnown: boolean;
  /** The departure was inferred from a chapter heading, so its date is approximate. */
  departInferred: boolean;
  /** Year of the revealed arrival, if any. Never from a hidden record. */
  arrives: number | null;
  /** Elapsed fraction of the journey on the map date; null when the arrival or the destination is not revealed (no
   * dot is drawn). */
  fraction: number | null;
  /** When fraction is null: an estimate from the usual speed of the journeys revealed so far (null: no basis). Used
   * only for where a caller on his way calls in from, marked as an estimate. */
  estimate: number | null;
  /** On SCUT on the map date (a Bob whose SCUT is revealed). */
  scut: boolean;
}

export interface MapHop {
  who: string;
  isOther: boolean;
  from: string | null;
  to: string;
  year: number;
  via: Exclude<Via, 'voyage'>;
}

export interface GhostTrail {
  who: string;
  isOther: boolean;
  /** Where he is on the map date: a place, or a voyage (from → to). */
  from: { place: string | null; voyage: { from: string | null; to: string | null; fraction: number | null } | null };
  /** Where he is at NOW. */
  to: { place: string | null; voyage: { from: string | null; to: string | null } | null; status: 'active' | 'lost' | 'missing' };
  /** How the last move before NOW was made. */
  via: Via;
  /** Story year of that move (arrival, departure or loss). */
  year: number;
}

/** Someone taking part in a chapter from another system: a link from where he is to where the chapter is set. */
export interface MapCall {
  who: string;
  isOther: boolean;
  /** Where he is; null: on a voyage (from his position along it). */
  from: string | null;
  to: string;
  /** The narrator of the current chapter; otherwise someone else in its cast. */
  pov: boolean;
  via: RemoteVia | null;
}

export interface MapState {
  time: number;
  /** The narrator's place on the map date, when he is at one. */
  focus: string | null;
  places: MapPlace[];
  voyages: MapVoyage[];
  /** For each Bob whose current place was reached by a wormhole hop or transmission: that last hop. */
  hops: MapHop[];
  /** SCUT links between places, a minimum spanning tree over places with someone on SCUT. */
  scutLinks: [string, string][];
  /** Flashback chapters only: what the reader already knows happens between the map date and NOW. */
  ghosts: GhostTrail[];
  /** Calling in: the narrator's link to where the chapter is set, and links for the chapter just read. */
  calls: MapCall[];
}

const EPS = 0.01;

function yearOf(model: Model, e: { year: number | null; reveal: Reveal }): number | null {
  return typeof e.year === 'number' ? e.year : revealYear(model, e.reveal);
}

/** Position of another replicant at time t from his revealed moves: like locAt for Bobs. */
export function otherAt(view: ProgressView, id: string, t: number) {
  let loc: string | null = null;
  let transit: { from: string | null; to: string | null; departed: number } | null = null;
  let seen = false;
  for (const m of view.otherMoves) {
    if (m.bob !== id) continue;
    const y = yearOf(view.model, m);
    if (y == null || y > t + EPS) continue;
    seen = true;
    if (m.kind === 'depart') {
      transit = { from: m.from ?? loc, to: m.to ?? null, departed: y };
      if (m.from) loc = m.from;
    } else {
      transit = null;
      loc = m.to ?? loc;
    }
  }
  // Last revealed fate up to t wins, except that "missing" never overrides a loss (as for Bobs).
  let status: 'active' | 'lost' | 'missing' = 'active';
  for (const f of view.otherFates) {
    if (f.bob !== id) continue;
    const y = yearOf(view.model, f);
    const s = fateStatus(f);
    if (y == null || y > t + EPS || (s === 'missing' && status === 'lost')) continue;
    status = s === 'alive' ? 'active' : s;
  }
  return seen || status !== 'active' ? { loc, transit: status === 'active' ? transit : null, status } : null;
}

function movesOf(view: ProgressView, id: string, isOther: boolean): MoveRecord[] {
  return isOther ? view.otherMoves.filter((m) => m.bob === id) : view.info.get(id)!.moves;
}

/** The revealed arrival that ends a journey begun at `departed` (none if not revealed): its year and place. The
 * place also names the destination when the departure didn't. */
function arrivalAfter(view: ProgressView, moves: MoveRecord[], departed: number): { year: number; to: string | null } | null {
  for (const m of moves) {
    const y = yearOf(view.model, m);
    if (y == null || y < departed - EPS) continue;
    if (m.kind === 'arrive' && y > departed + EPS) return { year: y, to: m.to ?? null };
    if (m.kind === 'depart' && y > departed + EPS) return null;
  }
  return null;
}

/** The median speed (ly a year) of the journeys the reader has seen completed: a revealed departure and the revealed
 * arrival after it, by voyage (not a wormhole or a transmission), between two placed systems. Null with none. */
export function typicalSpeed(view: ProgressView, pos: Map<string, Vec3>): number | null {
  const speeds: number[] = [];
  for (const id of view.ids) {
    const moves = view.info.get(id)!.moves;
    for (let i = 0; i < moves.length; i++) {
      const d = moves[i];
      if (d.kind !== 'depart' || !d.from || !d.to || d.via === 'wormhole' || d.via === 'transmitted' || d.inferred) continue;
      const y0 = yearOf(view.model, d);
      const arr = moves.slice(i + 1).find((m) => m.kind === 'arrive' && m.to === d.to);
      const y1 = arr ? yearOf(view.model, arr) : null;
      const a = pos.get(d.from);
      const b = pos.get(d.to);
      if (y0 == null || y1 == null || y1 - y0 < 0.5 || !a || !b) continue;
      speeds.push(distanceLy(a, b) / (y1 - y0));
    }
  }
  if (!speeds.length) return null;
  speeds.sort((x, y) => x - y);
  return speeds[Math.floor(speeds.length / 2)];
}

function fractionOf(t: number, departed: number, arrives: number | null): number | null {
  return arrives != null && arrives > departed ? Math.min(1, Math.max(0, (t - departed) / (arrives - departed))) : null;
}

/** The move that brought him to where he is at time t, if it was a wormhole hop or a transmission. */
function lastHop(view: ProgressView, moves: MoveRecord[], t: number): { m: MoveRecord; y: number } | null {
  let last: { m: MoveRecord; y: number } | null = null;
  for (const m of moves) {
    const y = yearOf(view.model, m);
    if (y == null || y > t + EPS) continue;
    last = { m, y };
  }
  return last && last.m.kind === 'arrive' && last.m.via && last.m.via !== 'voyage' ? last : null;
}

/** Where he was just before a hop whose record gives no origin (most wormhole arrivals don't): his place then. */
function hopOrigin(view: ProgressView, id: string, isOther: boolean, y: number): string | null {
  const before = y - 0.02;
  if (isOther) {
    const s = otherAt(view, id, before);
    return s && !s.transit ? s.loc : s?.transit?.from ?? null;
  }
  const s = locAt(view, id, before);
  return s && !s.notYet ? s.loc : null;
}

function minimumSpanningTree(ids: string[], pos: Map<string, Vec3>): [string, string][] {
  const placed = ids.filter((i) => pos.has(i));
  if (placed.length < 2) return [];
  const inTree = new Set([placed[0]]);
  const edges: [string, string][] = [];
  while (inTree.size < placed.length) {
    let best: [string, string, number] | null = null;
    for (const a of inTree)
      for (const b of placed) {
        if (inTree.has(b)) continue;
        const d = distanceLy(pos.get(a)!, pos.get(b)!);
        if (!best || d < best[2]) best = [a, b, d];
      }
    if (!best) break;
    inTree.add(best[1]);
    edges.push([best[0], best[1]]);
  }
  return edges;
}

export function mapState(view: ProgressView, t: number): MapState {
  const model = view.model;
  const pos = placePositions(model);
  const known = knownPlaces(view);
  const recs = new Map((model.data.systems ?? []).map((s) => [s.id, s]));
  const places = new Map<string, MapPlace>();
  const placeOf = (id: string): MapPlace => {
    let p = places.get(id);
    if (!p) {
      const ps = pos.get(id) ?? null;
      p = {
        id, pos: ps, kind: recs.get(id)?.kind ?? 'unknown', local: ps ? distanceLy(ps) <= LOCAL_RADIUS_LY : true,
        bobs: [], others: [], lost: [], narrator: false, scut: false, presence: [], guess: placeGuess(model, id),
      };
      places.set(id, p);
    }
    return p;
  };
  for (const k of known) placeOf(k);

  const voyages: MapVoyage[] = [];
  const hops: MapHop[] = [];
  const onScut = (id: string) => {
    const s = view.info.get(id)?.scut;
    const y = s ? (s.how === 'born' ? view.info.get(id)!.born : yearOf(model, s)) : null;
    return y != null && y <= t + EPS;
  };

  for (const id of view.ids) {
    const s = locAt(view, id, t);
    if (!s || s.notYet) continue;
    const I = view.info.get(id)!;
    if (s.status === 'lost') {
      if (s.loc) placeOf(s.loc).lost.push(id);
      continue;
    }
    if (s.status === 'missing') continue;
    if (s.transit) {
      const dep = [...I.moves].reverse().find((m) => m.kind === 'depart' && (yearOf(model, m) ?? Infinity) <= t + EPS);
      const departed = dep ? yearOf(model, dep)! : I.born;
      const arr = arrivalAfter(view, I.moves, departed);
      const to = s.transit.to ?? arr?.to ?? null;
      voyages.push({ who: id, isOther: false, from: s.loc, to, departed, departKnown: !!dep, departInferred: !!dep?.inferred, arrives: arr?.year ?? null, fraction: to ? fractionOf(t, departed, arr?.year ?? null) : null, estimate: null, scut: onScut(id) });
      continue;
    }
    if (!s.loc) continue;
    const p = placeOf(s.loc);
    p.bobs.push(id);
    if (id === view.chapter.narrator) p.narrator = true;
    if (onScut(id)) p.scut = true;
    const hop = lastHop(view, I.moves, t);
    if (hop) hops.push({ who: id, isOther: false, from: hop.m.from ?? hopOrigin(view, id, false, hop.y), to: hop.m.to!, year: hop.y, via: hop.m.via as MapHop['via'] });
  }

  for (const o of view.others) {
    const s = otherAt(view, o.id, t);
    if (!s || s.status !== 'active') continue;
    if (s.transit) {
      const arr = arrivalAfter(view, movesOf(view, o.id, true), s.transit.departed);
      const to = s.transit.to ?? arr?.to ?? null;
      voyages.push({
        who: o.id, isOther: true, from: s.transit.from, to, departed: s.transit.departed, departKnown: true, departInferred: false, arrives: arr?.year ?? null,
        fraction: to ? fractionOf(t, s.transit.departed, arr?.year ?? null) : null, estimate: null, scut: false,
      });
    } else if (s.loc) {
      placeOf(s.loc).others.push(o.id);
      const hop = lastHop(view, movesOf(view, o.id, true), t);
      if (hop) hops.push({ who: o.id, isOther: true, from: hop.m.from ?? hopOrigin(view, o.id, true, hop.y), to: hop.m.to!, year: hop.y, via: hop.m.via as MapHop['via'] });
    }
  }

  // Where a traveller with no revealed arrival probably is: elapsed time at the usual speed of revealed journeys.
  const speed = typicalSpeed(view, pos);
  for (const v of voyages) {
    if (v.fraction != null || !v.to || !v.from || !v.departKnown || speed == null) continue;
    const a = pos.get(v.from);
    const b = pos.get(v.to);
    const d = a && b ? distanceLy(a, b) : 0;
    if (d > 0.1) v.estimate = Math.min(0.97, Math.max(0.03, ((t - v.departed) * speed) / d));
  }

  // Colonies, outposts and territory: revealed (with their group), begun by the map date and not known to have ended.
  const groupById = new Map((model.data.groups ?? []).map((g) => [g.id, g]));
  for (const pr of model.data.presence ?? []) {
    const g = groupById.get(pr.group);
    if (!g || rank(g.reveal) > view.P || rank(pr.reveal) > view.P) continue;
    const began = typeof pr.year === 'number' ? pr.year : revealYear(model, pr.reveal);
    if (began != null && began > t + EPS) continue;
    if (pr.ended && rank(pr.ended.reveal) <= view.P) {
      const ended = typeof pr.ended.year === 'number' ? pr.ended.year : revealYear(model, pr.ended.reveal);
      if (ended == null || ended <= t + EPS) continue;
    }
    placeOf(pr.system).presence.push({ group: g.id, groupLabel: g.label, groupShort: g.short || g.label, human: g.human, kind: pr.kind, name: pr.label ?? null });
  }

  const list = [...places.values()].sort((a, b) => Number(b.narrator) - Number(a.narrator) || b.bobs.length - a.bobs.length || a.id.localeCompare(b.id));
  const scutLinks = minimumSpanningTree(list.filter((p) => p.scut).map((p) => p.id), pos);
  const focus = list.find((p) => p.narrator)?.id ?? null;
  const flashback = view.chapter.flashbackYear != null && Math.abs(t - (view.chapter.time ?? t)) < EPS;
  return { time: t, focus, places: list, voyages, hops, scutLinks, ghosts: flashback ? ghostTrails(view, t) : [], calls: mapCalls(view, t, places, voyages) };
}

/** Calling-in links on the map date: each from a place where the caller is drawn to a known place. */
function mapCalls(view: ProgressView, t: number, places: Map<string, MapPlace>, voyages: MapVoyage[]): MapCall[] {
  const out: MapCall[] = [];
  const atPlace = (id: string, place: string, isOther: boolean) => {
    const pl = places.get(place);
    return !!pl && (isOther ? pl.others : pl.bobs).includes(id);
  };
  // Travelling with a known position on the map date: the call comes from where he is drawn on his way (from: null).
  const onVoyage = (id: string) => voyages.some((v) => v.who === id && (v.fraction ?? v.estimate) != null);
  const fromOf = (id: string, place: string | null, isOther: boolean): string | null | undefined =>
    place && atPlace(id, place, isOther) ? place : onVoyage(id) ? null : undefined;
  const to = view.chapter.setting === 'system' ? view.chapter.system : null;
  if (!to || !places.has(to)) return out;
  const r = view.chapter.remote;
  const narrator = view.chapter.narrator;
  if (r && narrator) {
    const from = fromOf(narrator, r.from, false);
    if (from !== undefined) out.push({ who: narrator, isOther: false, from, to, pov: true, via: r.via });
  }
  // The rest of the cast who call in, from a place where the map has them or from their voyage.
  for (const c of view.chapter.cast) {
    if (!c.remote) continue;
    const from = fromOf(c.id, c.from, c.isOther);
    if (from !== undefined) out.push({ who: c.id, isOther: c.isOther, from, to, pov: false, via: c.via === 'present' ? null : c.via });
  }
  return out;
}

/** One colony, home system, outpost or territory as words: the world's name when the books give one, then the group
 * and the kind ("Earth · Human home", "Others outpost"). */
export function presenceText(pr: MapPresence): string {
  const what = `${pr.groupShort} ${pr.kind}`;
  return pr.name && pr.name !== pr.groupShort ? `${pr.name} · ${what}` : what;
}

/** How a map layer is shown: only what the chapter is about, everything, or nothing. */
export type LayerMode = 'chapter' | 'show' | 'hide';

/** The SCUT network layer: its links, its links and volume, or nothing. */
export type ScutMode = 'show' | 'volume' | 'hide';

/** What the Systems map shows, layer by layer. */
export interface MapLayers {
  /** Bobs at systems (and their losses). */
  bobs: LayerMode;
  /** People who are not Bobs (other replicants and AIs). */
  others: LayerMode;
  /** Journeys under way. */
  journeys: LayerMode;
  /** Completed legs of travel history. */
  history: LayerMode;
  /** Names beside the colour dots under each system (hidden: the dots only). */
  names: LayerMode;
  /** Known systems nobody is at on the map date. */
  empty: LayerMode;
  /** Colonies, outposts and territory. */
  presence: LayerMode;
  /** The SCUT network: show its links (every system on it stays on the map), its volume as well, or neither. */
  scut: ScutMode;
}

export const LAYER_KEYS = ['bobs', 'others', 'journeys', 'history', 'names', 'empty', 'presence', 'scut'] as const;

export const DEFAULT_LAYERS: MapLayers = { bobs: 'chapter', others: 'chapter', journeys: 'chapter', history: 'chapter', names: 'show', empty: 'chapter', presence: 'show', scut: 'show' };

/** Saved layer settings, with anything unknown (an older format) replaced by the default. */
export function readLayers(saved: unknown): MapLayers {
  const out = { ...DEFAULT_LAYERS };
  if (!saved || typeof saved !== 'object') return out;
  for (const k of LAYER_KEYS) {
    const v = (saved as Record<string, unknown>)[k];
    if (k === 'scut') {
      if (v === 'show' || v === 'volume' || v === 'hide') out.scut = v;
    } else if (v === 'chapter' || v === 'show' || v === 'hide') out[k] = v;
  }
  return out;
}

/** The people the chapter is about: the narrator and the rest of its cast, everyone at the place it is set on the map
 * date, the Bobs new in the chapter just read, and everyone who moved or met a fate in it. */
export function chapterPeople(view: ProgressView, state: MapState): Set<string> {
  const out = new Set<string>();
  const narrator = view.chapter.narrator;
  if (narrator) out.add(narrator);
  const setting = new Set([state.focus, view.chapter.system].filter((x): x is string => !!x));
  for (const pl of state.places) if (setting.has(pl.id)) for (const id of [...pl.bobs, ...pl.others]) out.add(id);
  for (const id of view.newHere.bobs) out.add(id);
  for (const c of state.calls) out.add(c.who);
  for (const c of view.chapter.cast) out.add(c.id);
  for (const m of view.newHere.moves) out.add(m.bob);
  for (const f of view.newHere.fates) out.add(f.bob);
  return out;
}

/** The places the chapter is about: where it is set, and every place named by a move in the chapter just read. */
export function chapterPlaces(view: ProgressView, state: MapState): Set<string> {
  const out = new Set([state.focus, view.chapter.system].filter((x): x is string => !!x));
  for (const m of view.newHere.moves) for (const id of [m.from, m.to, m.at]) if (id) out.add(id);
  for (const c of state.calls) for (const p of [c.from, c.to]) if (p) out.add(p);
  return out;
}

/** The map state with the hidden layers taken out. Only removes: it never adds a place, a person or a journey (the SCUT
 * layer on only stops removing the systems on the network). Names
 * and travel history are drawing choices (see the map scene); everything else is applied here. */
export function filterMapState(view: ProgressView, state: MapState, layers: MapLayers): MapState {
  const people = chapterPeople(view, state);
  const chapterAt = chapterPlaces(view, state);
  const pass = (mode: LayerMode, inChapter: boolean) => mode === 'show' || (mode === 'chapter' && inChapter);
  const keepWho = (id: string, isOther: boolean) => pass(isOther ? layers.others : layers.bobs, people.has(id));
  // SCUT network on: every system on it stays (its people follow their own layers).
  const net = layers.scut !== 'hide';
  const voyages = state.voyages.filter((v) => keepWho(v.who, v.isOther) && pass(layers.journeys, people.has(v.who)));
  // Places that must stay: where the chapter is set, and both ends of every journey still drawn.
  const needed = new Set([state.focus, view.chapter.system].filter((x): x is string => !!x));
  for (const v of voyages) for (const id of [v.from, v.to]) if (id) needed.add(id);
  const calls = state.calls.filter((c) => c.pov || keepWho(c.who, c.isOther));
  for (const c of calls) for (const p of [c.from, c.to]) if (p) needed.add(p);
  if (net) for (const pl of state.places) if (pl.scut) needed.add(pl.id);
  const places: MapPlace[] = [];
  for (const pl of state.places) {
    const bobs = pl.bobs.filter((id) => keepWho(id, false));
    const others = pl.others.filter((id) => keepWho(id, true));
    const lost = pl.lost.filter((id) => pass(layers.bobs, people.has(id)));
    const occupied = bobs.length + others.length + lost.length > 0;
    const inChapter = chapterAt.has(pl.id) || occupied;
    const presence = pass(layers.presence, inChapter) ? pl.presence : [];
    const keep = needed.has(pl.id) || occupied || presence.length > 0 || pass(layers.empty, chapterAt.has(pl.id));
    if (!keep) continue;
    places.push({ ...pl, bobs, others, lost, presence });
  }
  const placeIds = new Set(places.map((pl) => pl.id));
  const who = new Set(places.flatMap((pl) => [...pl.bobs, ...pl.others]));
  return {
    ...state,
    places,
    voyages,
    hops: state.hops.filter((hp) => who.has(hp.who)),
    scutLinks: layers.scut === 'hide' ? [] : state.scutLinks.filter(([a, b]) => placeIds.has(a) && placeIds.has(b)),
    ghosts: state.ghosts.filter((g) => keepWho(g.who, g.isOther)),
    calls: calls.filter((c) => who.has(c.who) || (c.from === null && voyages.some((v) => v.who === c.who))),
  };
}

/** Between the map date and NOW: who moves, and where to. Only revealed records, never past NOW. */
export function ghostTrails(view: ProgressView, t: number): GhostTrail[] {
  const now = view.latest;
  if (now == null || now <= t + EPS) return [];
  const out: GhostTrail[] = [];
  const describe = (who: string, isOther: boolean) => {
    const moves = movesOf(view, who, isOther);
    const at = (y: number) => {
      if (isOther) {
        const s = otherAt(view, who, y);
        return s ? { loc: s.transit ? null : s.loc, transit: s.transit ? { from: s.transit.from, to: s.transit.to } : null, status: s.status } : null;
      }
      const s = locAt(view, who, y);
      if (!s || s.notYet) return null;
      return { loc: s.transit ? null : s.loc, transit: s.transit ? { from: s.loc, to: s.transit.to } : null, status: s.status };
    };
    const a = at(t);
    const b = at(now);
    if (!a || !b) return;
    const same = a.loc === b.loc && a.status === b.status && (a.transit?.to ?? null) === (b.transit?.to ?? null) && !!a.transit === !!b.transit;
    if (same) return;
    const between = moves.filter((m) => {
      const y = yearOf(view.model, m);
      return y != null && y > t + EPS && y <= now + EPS;
    });
    const last = between[between.length - 1];
    let year = last ? yearOf(view.model, last)! : now;
    if (b.status !== 'active') {
      const fates = isOther ? view.otherFates.filter((f) => f.bob === who) : view.info.get(who)!.fates;
      const f = [...fates].reverse().find((x) => fateStatus(x) === b.status && (yearOf(view.model, x) ?? Infinity) <= now + EPS);
      if (f) year = yearOf(view.model, f) ?? year;
    }
    let fraction: number | null = null;
    if (a.transit) {
      const dep = [...moves].reverse().find((m) => m.kind === 'depart' && (yearOf(view.model, m) ?? Infinity) <= t + EPS);
      const departed = dep ? yearOf(view.model, dep)! : t;
      const arr = arrivalAfter(view, moves, departed);
      fraction = fractionOf(t, departed, arr?.year ?? null);
      if (a.transit && !a.transit.to && arr?.to) a.transit.to = arr.to;
    }
    out.push({
      who, isOther,
      from: { place: a.loc, voyage: a.transit ? { ...a.transit, fraction } : null },
      to: { place: b.loc, voyage: b.transit, status: b.status === 'missing' ? 'missing' : b.status === 'lost' ? 'lost' : 'active' },
      via: last?.via ?? 'voyage',
      year,
    });
  };
  for (const id of view.ids) describe(id, false);
  for (const o of view.others) describe(o.id, true);
  return out;
}

// --- Camera -------------------------------------------------------------------------------------------------

export interface Camera {
  /** Rotation about the galactic pole, radians. */
  yaw: number;
  /** Tilt of the view from straight down, radians: 0 looks straight down, π/2 along the plane, MAX_TILT (π) straight
   * up from below. The reader changes it with a vertical one-finger drag; DEFAULT_TILT is where
   * recentre puts it. */
  tilt: number;
  /** Screen points per parsec. */
  scale: number;
  /** Galactic-frame point at the centre of the screen: the point the camera orbits, its height included. The map's
   * floor is the horizontal plane through it (the viewport globe's equator). */
  center: Vec3;
  /** Screen centre in points. */
  cx: number;
  cy: number;
}

export const DEFAULT_TILT = (65 * Math.PI) / 180;
/** The default turn: towards the galactic centre (galactic +x up the screen, away from the viewer), with the camera
 * moved 25 degrees clockwise round the pivot as seen from galactic north. */
export const DEFAULT_YAW = Math.PI / 2 + (25 * Math.PI) / 180;
/** The steepest tilt the reader can reach: straight up from below the plane (the view may go all
 * the way round; recentre brings it back). The projection is a rotation, so every tilt is well defined. */
export const MAX_TILT = Math.PI;

/** A tilt kept between straight down (0) and straight up from below (MAX_TILT). */
export function clampTilt(tilt: number): number {
  return Math.min(MAX_TILT, Math.max(0, Number.isFinite(tilt) ? tilt : DEFAULT_TILT));
}

/** Screen position of a galactic-frame point, and its depth (larger = nearer the viewer) for draw order. */
export function project(p: Vec3, cam: Camera): { x: number; y: number; depth: number } {
  const dx = p.x - cam.center.x;
  const dy = p.y - cam.center.y;
  const dz = p.z - cam.center.z;
  const c = Math.cos(cam.yaw);
  const s = Math.sin(cam.yaw);
  const rx = dx * c - dy * s;
  const ry = dx * s + dy * c;
  // Tilt about the screen's horizontal axis. tilt 0 looks straight down (map north up the screen); tilt 90° looks
  // along the plane (height up the screen). Depth grows towards the viewer.
  const ct = Math.cos(cam.tilt);
  const st = Math.sin(cam.tilt);
  const up = ry * ct + dz * st;
  const depth = dz * ct - ry * st;
  return { x: cam.cx + rx * cam.scale, y: cam.cy - up * cam.scale, depth };
}

/** The map's reference plane (the floor): horizontal (parallel to the galactic plane) through the camera centre, the
 * point the view orbits, so it is the viewport globe's equator and heights read as above or below the centre of view
 * (by default the chapter's system). `plane` is a point on it (normally `cam.center`) or just its galactic z; 0 is the
 * galactic plane itself. */
export type PlaneRef = Vec3 | number;

function planeZ(plane: PlaneRef): number {
  return typeof plane === 'number' ? plane : plane.z;
}

/** The point on the reference plane straight above or below p: the foot of its drop line. */
export function planeFoot(p: Vec3, plane: PlaneRef = 0): Vec3 {
  return { x: p.x, y: p.y, z: planeZ(plane) };
}

/** Height of p above the reference plane, parsecs (negative: below it). */
export function heightAbove(p: Vec3, plane: PlaneRef = 0): number {
  return p.z - planeZ(plane);
}

/** A camera that fits the given galactic-frame points into a w × h box with padding. */
export function fitCamera(points: Vec3[], w: number, h: number, yaw = 0, tilt = DEFAULT_TILT, pad = 48): Camera {
  if (!points.length) return { yaw, tilt, scale: 10, center: { x: 0, y: 0, z: 0 }, cx: w / 2, cy: h / 2 };
  // The centre sits at the middle of the points' heights, so the floor (the plane through it) runs through them.
  const center = {
    x: (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2,
    y: (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2,
    z: (Math.min(...points.map((p) => p.z)) + Math.max(...points.map((p) => p.z))) / 2,
  };
  const probe: Camera = { yaw, tilt, scale: 1, center, cx: 0, cy: 0 };
  const pr = points.map((p) => project(p, probe));
  const minX = Math.min(...pr.map((q) => q.x));
  const maxX = Math.max(...pr.map((q) => q.x));
  const minY = Math.min(...pr.map((q) => q.y));
  const maxY = Math.max(...pr.map((q) => q.y));
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  // Height lifts points up the screen, so the projected cloud is not centred on the x/y box: move the centre (on
  // the plane) by the projected midpoint, undoing the yaw and the tilt's foreshortening of y.
  const mx = (minX + maxX) / 2;
  const mUp = -(minY + maxY) / 2 / (Math.abs(Math.cos(tilt)) < 1e-6 ? 1e-6 : Math.cos(tilt));
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  center.x += c * mx + s * mUp;
  center.y += -s * mx + c * mUp;
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  return { yaw, tilt, scale: Number.isFinite(scale) && scale > 0 ? scale : 10, center, cx: w / 2, cy: h / 2 };
}

/** Statuses of another replicant at time t: where he is, or that he is lost (with the year), from revealed records
 * only. Lost replicants never draw on the map; lists name them as lost, not "whereabouts not given". */
export function otherStatus(
  view: ProgressView,
  id: string,
  t: number,
): { status: 'active' | 'lost' | 'missing' | 'unknown'; place: string | null; year: number | null } {
  const s = otherAt(view, id, t);
  if (!s) return { status: 'unknown', place: null, year: null };
  if (s.status === 'active') return { status: s.transit || !s.loc ? 'unknown' : 'active', place: s.transit ? null : s.loc, year: null };
  let year: number | null = null;
  for (const f of view.otherFates) {
    if (f.bob !== id || fateStatus(f) !== s.status) continue;
    const y = yearOf(view.model, f);
    if (y != null && y <= t + EPS) year = y;
  }
  return { status: s.status, place: s.loc, year };
}

// --- Travel history (routes and lineage) -------------------------------------------------------------------

/** One completed journey: from a place to another, by voyage, wormhole or transmission. */
export interface RouteLeg {
  from: string | null;
  to: string | null;
  /** Null when no departure record is revealed. */
  departed: number | null;
  arrived: number | null;
  via: Via;
  /** No departure record (or only one inferred from a chapter heading): dates are approximate. */
  inferred: boolean;
}

export interface Route {
  who: string;
  isOther: boolean;
  /** Bobs only: where and when he was made, and by whom. year is null when the creation date is estimated. */
  made: { place: string | null; year: number | null; by: string | null } | null;
  /** Completed legs only, oldest first. A voyage still under way is not a leg. */
  legs: RouteLeg[];
  end: { status: 'active' | 'lost' | 'missing'; place: string | null; year: number | null };
}

const SAME_MOVE_YR = 0.05;

/** Travel history of one Bob (or another replicant) up to time t, from revealed records only. */
function routeOf(view: ProgressView, id: string, isOther: boolean, t: number, known: Set<string>): Route | null {
  const model = view.model;
  const k = (p: string | null | undefined) => (p && known.has(p) ? p : null);
  let made: Route['made'] = null;
  let start: string | null = null;
  if (!isOther) {
    const I = view.info.get(id);
    if (!I || I.born > t + 0.05) return null;
    start = k(I.bob.where);
    const parent = I.bob.parent && view.info.has(I.bob.parent) ? I.bob.parent : null;
    made = { place: start, year: I.bornEstimated ? null : I.born, by: I.madeBy ?? parent };
  }
  const all = movesOf(view, id, isOther)
    .map((m) => ({ m, y: yearOf(model, m) }))
    .filter((x): x is { m: MoveRecord; y: number } => x.y != null && x.y <= t + EPS);
  if (isOther && !all.length) {
    const st = otherStatus(view, id, t);
    if (st.status === 'unknown') return null;
  }
  // A move inferred from a chapter heading that repeats a revealed record is dropped; the record is kept.
  const moves = all.filter(
    (x) =>
      !x.m.inferred ||
      !all.some(
        (o) =>
          o !== x &&
          !o.m.inferred &&
          o.m.kind === x.m.kind &&
          (o.m.to ?? null) === (x.m.to ?? null) &&
          (!o.m.from || !x.m.from || o.m.from === x.m.from) &&
          Math.abs(o.y - x.y) <= SAME_MOVE_YR,
      ),
  );
  const legs: RouteLeg[] = [];
  let prev: string | null = start;
  let pending: { from: string | null; to: string | null; y: number; inferred: boolean } | null = null;
  for (const { m, y } of moves) {
    if (m.kind === 'depart') {
      const from = m.from ?? prev;
      pending = { from, to: m.to ?? null, y, inferred: !!m.inferred };
      if (m.from) prev = m.from;
      continue;
    }
    const from = pending ? pending.from : m.from ?? prev;
    const to = m.to ?? pending?.to ?? null;
    legs.push({ from: k(from), to: k(to), departed: pending?.y ?? null, arrived: y, via: m.via ?? 'voyage', inferred: !pending || pending.inferred });
    prev = to ?? prev;
    pending = null;
  }
  let end: Route['end'];
  if (isOther) {
    const st = otherStatus(view, id, t);
    end = { status: st.status === 'unknown' ? 'active' : st.status, place: k(st.place), year: st.year ?? legs[legs.length - 1]?.arrived ?? null };
  } else {
    const s = locAt(view, id, t);
    const status = s && !s.notYet ? s.status : 'active';
    const inTransit = !!(s && !s.notYet && s.transit);
    end = {
      status,
      place: inTransit && status === 'active' ? null : k(s && !s.notYet ? s.loc : null),
      year: status === 'lost' && s && !s.notYet ? s.lostAt : legs[legs.length - 1]?.arrived ?? made?.year ?? null,
    };
  }
  return { who: id, isOther, made, legs, end };
}

/** Every Bob's (and other replicant's) travel history up to time t: where he was made, then each completed leg.
 * Only revealed records (heading-inferred moves included) and known places; never anything past t. */
export function routes(view: ProgressView, t: number): Map<string, Route> {
  const known = knownPlaces(view);
  const out = new Map<string, Route>();
  for (const id of view.ids) {
    const r = routeOf(view, id, false, t, known);
    if (r) out.set(id, r);
  }
  for (const o of view.others) {
    const r = routeOf(view, o.id, true, t, known);
    if (r) out.set(o.id, r);
  }
  return out;
}

/** His travel lineage: the ancestors he was copied from, root first, him last. Each ancestor's legs stop at the
 * child's creation (his later travels are not part of this story). The chain stops silently where it can't be
 * followed: a parent not revealed, or one who was not at the place the child was made on that date. */
export function lineage(view: ProgressView, id: string, t: number): { who: string; made: Route['made']; legs: RouteLeg[] }[] {
  const known = knownPlaces(view);
  const me = routeOf(view, id, false, t, known);
  if (!me) return [];
  const out = [{ who: id, made: me.made, legs: me.legs }];
  let child = id;
  for (let guard = 0; guard < 100; guard++) {
    const C = view.info.get(child)!;
    const parent = C.bob.parent;
    const place = C.bob.where ?? null;
    if (!parent || !view.info.has(parent) || !place) break;
    const s = locAt(view, parent, C.born);
    if (!s || s.notYet || s.status !== 'active' || s.transit || s.loc !== place) break;
    const r = routeOf(view, parent, false, Math.min(t, C.born), known);
    if (!r) break;
    out.unshift({ who: parent, made: r.made, legs: r.legs });
    child = parent;
  }
  return out;
}

/** Voyages that share a route and left within a year of each other, drawn as one line with one label. */
export interface VoyageGroup {
  key: string;
  from: string | null;
  to: string | null;
  isOther: boolean;
  members: MapVoyage[];
  /** Earliest departure in the group. */
  departed: number;
  departKnown: boolean;
  departInferred: boolean;
  arrives: number | null;
  fraction: number | null;
}

export function groupVoyages(voyages: MapVoyage[]): VoyageGroup[] {
  const groups: VoyageGroup[] = [];
  for (const v of voyages) {
    const g = groups.find(
      (x) =>
        x.from === v.from &&
        x.to === v.to &&
        x.isOther === v.isOther &&
        x.departKnown === v.departKnown &&
        Math.abs(x.members[0].departed - v.departed) <= 1 &&
        // One label and one dot for the group: only travellers with the same revealed arrival (or none) share it.
        sameArrival(x.arrives, v.arrives),
    );
    if (g) {
      g.members.push(v);
      if (v.departed < g.departed) g.departed = v.departed;
      g.departInferred ||= v.departInferred;
    } else {
      groups.push({
        key: `${v.isOther ? 'o' : 'b'}|${v.from ?? ''}|${v.to ?? ''}|${v.who}`,
        from: v.from, to: v.to, isOther: v.isOther, members: [v], departed: v.departed, departKnown: v.departKnown,
        departInferred: v.departInferred, arrives: v.arrives, fraction: v.fraction,
      });
    }
  }
  return groups.sort((a, b) => b.members.length - a.members.length);
}

function sameArrival(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) <= 0.1;
}

/** A span of story time in words, rounded down: "just left" (under a month), "5 months", "1 yr", "14 yrs". */
export function spanText(years: number): string {
  if (!(years >= 1 / 12)) return 'just left';
  if (years < 1) {
    const m = Math.floor(years * 12);
    return `${m} ${m === 1 ? 'month' : 'months'}`;
  }
  const y = Math.floor(years);
  return `${y} ${y === 1 ? 'yr' : 'yrs'}`;
}

/** How long ago something happened, relative to the map date: "just now" (under a month), "5 months ago",
 * "14 yrs ago". */
export function agoText(years: number): string {
  const s = spanText(years);
  return s === 'just left' ? 'just now' : `${s} ago`;
}

/** How long a voyage has been going on the map date, relative to it, and how long is left when the arrival is
 * revealed. out is null when no departure year is known (no duration is ever guessed). */
export function voyageText(v: Pick<MapVoyage, 'departed' | 'departKnown' | 'departInferred' | 'arrives'>, t: number): { out: string | null; toGo: string | null; about: boolean } {
  const about = v.departInferred;
  let out: string | null = null;
  if (v.departKnown) {
    const span = spanText(t - v.departed);
    out = span === 'just left' ? 'just left' : `en route for ${about ? 'about ' : ''}${span}`;
  }
  let toGo: string | null = null;
  if (v.arrives != null) {
    const left = v.arrives - t;
    toGo = left < 1 ? 'under 1 yr to go' : `${Math.ceil(left - 1e-6)} yrs to go`;
  }
  return { out, toGo, about };
}

/** Light years, rounded, as words: "19 ly". */
export function lyText(pc: number): string {
  return `${Math.round(pc * LY_PER_PC)} ly`;
}

/** The default camera scale around a pivot: big enough to show the nearest few places (at least 25 ly, at most out
 * to the furthest), never closer than 8 ly. The same at every yaw, so nothing slides off while turning. */
export function pivotFit(
  pivot: Vec3,
  points: Vec3[],
  w: number,
  h: number,
  tilt: number,
  opts: { minPc?: number; nearPc?: number; nth?: number } = {},
): { scale: number; radiusPc: number } {
  const minPc = opts.minPc ?? 8 / LY_PER_PC;
  const nearPc = opts.nearPc ?? 25 / LY_PER_PC;
  const nth = opts.nth ?? 4;
  const d = points.map((p) => Math.hypot(p.x - pivot.x, p.y - pivot.y)).filter((x) => x > 1e-6).sort((a, b) => a - b);
  const far = d.length ? d[d.length - 1] : 0;
  const nthD = d.length ? d[Math.min(nth, d.length) - 1] : 0;
  const R = 1.1 * Math.max(minPc, Math.min(far, Math.max(nearPc, nthD)));
  const H = points.reduce((m, p) => (Math.hypot(p.x - pivot.x, p.y - pivot.y) <= R + 1e-6 ? Math.max(m, Math.abs(p.z - pivot.z)) : m), 0);
  const sx = (w / 2 - 24) / R;
  // Seen from below the plane (tilt past 90°) the floor's depth on the screen is the same as from above.
  const sy = (h / 2 - 24) / (R * Math.abs(Math.cos(tilt)) + H * Math.sin(tilt));
  const scale = Math.max(1e-6, Math.min(sx, sy));
  return { scale, radiusPc: R };
}

/** The chapter at a glance, for the map's header card: whose chapter, where he is, and how many people are with
 * him, at other systems and en route on the map date. Built from the map state only. */
export interface MapSummary {
  narrator: string | null;
  /** Where the narrator is: at a place, travelling, lost, missing; 'none' when the narrator is not a Bob. */
  where: 'place' | 'transit' | 'lost' | 'missing' | 'unknown' | 'none';
  /** His place (or, when the narrator is not a Bob, the chapter's system). */
  place: string | null;
  /** Transit: where to (null when not given). */
  to: string | null;
  /** Transit: how long he has been travelling, relative ("en route for 9 yrs"); null when the departure is not known. */
  transit: string | null;
  /** People at his place, not counting him. */
  here: number;
  /** Other systems with someone in them (placed on the map or not). */
  systems: number;
  /** People travelling, not counting him. */
  enRoute: number;
  /** No known places at all yet. */
  empty: boolean;
}

export function mapSummary(view: ProgressView, state: MapState): MapSummary {
  const narrator = view.chapter.narrator;
  const t = state.time;
  let where: MapSummary['where'] = 'none';
  let place: string | null = null;
  let to: string | null = null;
  let transit: string | null = null;
  if (narrator) {
    const pl = state.places.find((p) => p.narrator);
    const voy = state.voyages.find((v) => v.who === narrator && !v.isOther);
    const s = locAt(view, narrator, t);
    if (pl) {
      where = 'place';
      place = pl.id;
    } else if (voy) {
      where = 'transit';
      to = voy.to;
      transit = voyageText(voy, t).out;
    } else if (s && !s.notYet && s.status !== 'active') where = s.status;
    else where = 'unknown';
  } else place = view.chapter.system;
  const at = place ? state.places.find((p) => p.id === place) : null;
  const here = at ? at.bobs.filter((b) => b !== narrator).length + at.others.length : 0;
  const systems = state.places.filter((p) => p.id !== place && p.bobs.length + p.others.length > 0).length;
  const enRoute = state.voyages.filter((v) => v.isOther || v.who !== narrator).length;
  return { narrator, where, place, to, transit, here, systems, enRoute, empty: state.places.length === 0 };
}

/** The SCUT network on a map date: every system with a Bob on SCUT there, and how far it reaches from the origin. */
export interface ScutNetwork {
  /** Member systems, with or without a position. */
  ids: string[];
  /** Members with a position (they shape the shaded area). */
  placed: string[];
  /** The place at the origin of the frame (Sol), from the data. */
  origin: string | null;
  /** Light years from the origin to the farthest placed member. */
  reachLy: number | null;
}

export function scutNetwork(state: MapState): ScutNetwork {
  const members = state.places.filter((p) => p.scut);
  const placed = members.filter((p) => p.pos);
  const atOrigin = state.places.filter((p) => p.pos && distanceLy(p.pos) < 1e-5);
  const origin = (atOrigin.find((p) => p.kind !== 'near') ?? atOrigin[0])?.id ?? null;
  const reachLy = origin && placed.length ? Math.max(...placed.map((p) => distanceLy(p.pos!))) : null;
  return { ids: members.map((p) => p.id), placed: placed.map((p) => p.id), origin, reachLy };
}

/** The layer's name: "Bobnet" once the books have used the word in what the reader has met; SCUT until then. */
export function scutLabel(view: ProgressView): string {
  const named = [...view.scut, ...view.milestones].some((r) => /bobnet/i.test(r.text ?? ''));
  return named ? 'Bobnet' : 'SCUT';
}

/** "Bobnet · 12 systems · 30 ly from Sol", shorter for a narrow map (short 1: no "from Sol"; 2: no reach). In a
 * flashback, the count at NOW follows when it differs. Null with no members. */
export function scutText(label: string, n: ScutNetwork, now: ScutNetwork | null, short: 0 | 1 | 2 = 0): string | null {
  if (!n.ids.length) return null;
  const parts = [label, `${n.ids.length} ${n.ids.length === 1 ? 'system' : 'systems'}`];
  if (short < 2 && n.reachLy != null && n.reachLy >= 0.5) parts.push(`${Math.round(n.reachLy)} ly${short === 0 && n.origin ? ` from ${n.origin}` : ''}`);
  if (now && now.ids.length !== n.ids.length) parts.push(`NOW ${now.ids.length}`);
  return parts.join(' · ');
}

/** The same for a screen reader (appended to the header card's label). */
export function scutSpoken(label: string, n: ScutNetwork, now: ScutNetwork | null): string {
  const later = now && now.ids.length !== n.ids.length ? `; ${now.ids.length} at NOW` : '';
  if (!n.ids.length) return ` ${label}: none on this date${later}.`;
  const count = `${n.ids.length} ${n.ids.length === 1 ? 'system' : 'systems'}`;
  const reach = n.reachLy != null && n.reachLy >= 0.5 && n.origin ? `, farthest ${Math.round(n.reachLy)} light years from ${n.origin}` : '';
  return ` ${label}: ${count}${reach}${later}.`;
}

/** SCUT's working range round each system on it, once the reader has learnt it (the latest revealed figure). */
export function scutRangeLy(view: ProgressView): number | null {
  const raw = view.model.data.settings?.scutRange;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  let best: ScutRange | null = null;
  for (const r of list) {
    if (typeof r?.ly !== 'number' || !(r.ly > 0) || rank(r.reveal) > view.P) continue;
    if (!best || rank(r.reveal) >= rank(best.reveal)) best = r;
  }
  return best?.ly ?? null;
}
