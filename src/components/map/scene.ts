// The map scene: everything the renderer draws, as plain data in the galactic frame (parsecs). Built on the JS
// thread from a MapState and the travel history (so it holds nothing past the reveal gate or NOW) and handed to the
// drawing worklet, which projects it with the live camera on every frame. No Skia imports here: the web build loads
// Skia lazily. The vocabulary: the past lies on the floor, the present is in the air.
import {
  LY_PER_PC,
  agoText,
  chapterPeople,
  groupVoyages,
  lerp3,
  lineage,
  plural,
  presenceText,
  routes,
  voyageText,
  yearText,
  type LayerMode,
  type MapPresence,
  type MapState,
  type ProgressView,
  type Route,
  type RouteLeg,
  type Vec3,
  type VoyageGroup,
} from '@/core';
import type { Palette } from '@/theme/tokens';

import type { MapHit, MapLevel } from './types';

/** Galactic centre (Sagittarius A*), parsecs from Sol along +x. Schematic disc only; not a labelled place. */
export const GALACTIC_CENTRE: Vec3 = { x: 8178, y: 0, z: 0 };
/** Radius of the schematic Milky Way disc, parsecs (about 15 kpc). */
export const DISC_RADIUS_PC = 15000;
const SOL: Vec3 = { x: 0, y: 0, z: 0 };

/** Radius of the galaxy locator (a small Milky Way turning with the map), points. A tap on it recentres the map. */
export const COMPASS_R = 34;

/** Where the galaxy locator sits: above the distance scale bar, bottom left. Null when there is no scale bar. */
export function compassAt(scaleBar: { x: number; y: number } | null): { x: number; y: number } | null {
  'worklet';
  return scaleBar ? { x: scaleBar.x + COMPASS_R, y: scaleBar.y - 24 - COMPASS_R } : null;
}

/** The sky stars (see Scene.sky): 360 directions from a fixed seed, two thirds within about 12 degrees of the
 * galactic plane. */
const SKY: number[] = (() => {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const out: number[] = [];
  for (let i = 0; i < 360; i++) {
    const l = rnd() * Math.PI * 2;
    const inBand = i % 3 !== 0;
    const b = inBand ? (rnd() + rnd() + rnd() - 1.5) * 0.28 : Math.asin(rnd() * 2 - 1);
    out.push(Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b), 0.4 + rnd() * 0.6);
  }
  return out;
})();

/** Pips drawn under a place before the rest are summarised as "+N": one row. */
export const MAX_PIPS = 5;
export const PIP_ROW = 5;
/** Screen spacing of pips in a row, points. */
export const PIP_GAP = 10;
export const PIP_ROW_GAP = 9;
/** Pips sit lower under the narrator's puck, which is larger than a place dot. */
export const PUCK_PIP_SHIFT = 10;

/** Alpha of everything not in the selected Bob's lineage. */
export const DIM = 0.32;

export interface Pip {
  id: string;
  /** Identity colour for a Bob; null for another replicant (hollow ink). */
  colour: string | null;
  dim: boolean;
}

export type Font = 'label' | 'line2' | 'small';
export type Tone = 'ink' | 'ink2' | 'ink3';

/** Part of a label line. A person's run starts with his mark: a Bob's identity colour dot, or for another replicant
 * (mark null) a hollow ink square, never a colour. A run without `mark` is plain text ("+2"). */
export interface LabelRun {
  text: string;
  mark?: string | null;
  /** Whose mark and name this is: a tap on it opens him. */
  id?: string;
  /** Lineage mode: not in the selected Bob's line. */
  dim?: boolean;
}

export interface LabelLine {
  /** The whole line as plain text (also the fallback when it is drawn without runs). */
  text: string;
  font: Font;
  tone: Tone;
  /** Drawn run by run instead of `text`: the names line under a place, each name after his colour dot. */
  runs?: LabelRun[];
}

/** One marker on the map: a place, several places at the same point, or the collapsed Sol neighbourhood. */
export interface SceneNode {
  key: string;
  /** Place ids for hit testing; the first is the one a tap opens. Empty for the collapsed neighbourhood. */
  ids: string[];
  p: Vec3;
  /** The narrator is here: the puck replaces the dot and his pip. */
  puck: boolean;
  /** The chapter is set here but its narrator is not a Bob: the ink chapter ring. */
  chapterRing: boolean;
  pips: Pip[];
  more: number;
  /** Bobs lost here. */
  lost: number;
  /** People here (Bobs and other replicants), the narrator included. */
  count: number;
  dim: boolean;
  /** A known place with nobody in it: a small hollow ink dot. */
  empty: boolean;
  /** Collapsed neighbourhood marker (galaxy level): drawn as a ringed dot. */
  cluster: boolean;
  /** Name, for edge markers. */
  name: string;
  /** Keeps its drop line and foot at rest: the pivot or focus place, and the selected Bob's places (where he is and
   * every stop on his route). Every other place shows its drop line only while the reader turns, tilts or pans. */
  drop: boolean;
  /** Names on: the people here are in the label as colour dots and names, so the pip row is drawn only when the label
   * finds no room. */
  namesInLabel: boolean;
  /** Colonies, outposts and territory here (ink rings round the marker). */
  presence: MapPresence['kind'][];
}

export interface SceneVoyage {
  key: string;
  /** Everyone in the group. */
  ids: string[];
  /** Whose dot each of `dots` is. */
  dotIds: string[];
  /** Colour dots at the position (up to three), Bobs only; the narrator's dot is replaced by the puck. */
  dots: string[];
  /** Travellers beyond the dots, "+N". */
  more: number;
  /** First member's colour; null for other replicants (outlined ink). */
  colour: string | null;
  a: Vec3;
  /** Null: destination not given (a short stub with an arrowhead at the origin). */
  b: Vec3 | null;
  fraction: number | null;
  dim: boolean;
  strong: boolean;
  /** Stub direction on the screen, radians (stable per group so stubs from one place fan out). */
  stubAngle: number;
  /** The narrator travels in this group: his puck is drawn on the line. */
  puck: boolean;
}

export interface SceneHop {
  who: string;
  colour: string | null;
  transmitted: boolean;
  /** Null: origin not on this level (only the arrival gate is drawn). */
  a: Vec3 | null;
  b: Vec3;
  dim: boolean;
}

export interface SceneGhost {
  who: string;
  colour: string | null;
  a: Vec3;
  b: Vec3;
  dim: boolean;
}

/** A completed leg of someone's travel history: a faint solid line, star to star or on the floor (lineage mode). */
export interface SceneTrack {
  who: string;
  /** Null: another replicant (outlined ink). */
  colour: string | null;
  /** End points: the stars themselves. b null: the far end has no position, so a short open stub leaves a. */
  a: Vec3;
  b: Vec3 | null;
  /** Lineage mode: drawn on the floor, the horizontal plane through the camera centre (the globe's equator), under
   * the stars it joins. The height comes from the live camera, so the track stays on the shaded disc while the
   * reader taps, moves or turns the map. */
  flat: boolean;
  /** The stub runs from b back towards a when only b is placed. */
  reversed: boolean;
  stubAngle: number;
  via: 'voyage' | 'wormhole' | 'transmitted';
  alpha: number;
  width: number;
  /** Side-by-side offset for legs several people share. */
  lane: number;
  lanes: number;
}

/** Where a Bob was made: a small diamond on the floor (lineage mode) or round the star itself (default). */
export interface SceneDiamond {
  who: string;
  p: Vec3;
  /** On the floor (the plane through the camera centre) under p, not at p itself. */
  flat: boolean;
  colour: string | null;
  alpha: number;
  /** Half-diagonal, points. */
  size: number;
}

export interface SceneLabel {
  /** Anchor point; the screen offset (dx, dy) is added after projection. */
  p: Vec3;
  /** Second point: the anchor is the midpoint of p and q on screen (voyage lines). */
  q: Vec3 | null;
  dx: number;
  dy: number;
  lines: LabelLine[];
  /** Shorter text tried when `lines` does not fit anywhere. */
  fallback?: LabelLine[];
  /** Gap between the anchor and the text when placed beside it. */
  gap: number;
  /** Offset below the anchor when placed under it. */
  below: number;
  /** Centre under the anchor first (floor labels) instead of beside it. */
  centred: boolean;
  /** Floor label: anchored on the floor (the plane through the camera centre) under p. */
  flat?: boolean;
  alpha: number;
  /** Hidden when zoomed out far below the fit. */
  hideWhenFar: boolean;
  /** Always drawn, even over other labels (the focus place). */
  force?: boolean;
  /** Node index for label obstacles (-1 for none). */
  node: number;
}

export interface ScenePuck {
  colour: string;
  p: Vec3;
  /** Voyage with no position: the puck sits 14 pt from the origin towards `toward` (or along stubAngle) with an
   * arrowhead, claiming no position. */
  arrow: boolean;
  toward: Vec3 | null;
  stubAngle: number;
}

export interface SceneTheme {
  bg: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  dark: boolean;
}

export interface Scene {
  level: MapLevel;
  /** Local level: faint sky stars as unit directions with a brightness, flattened [x, y, z, b, ...] (galactic frame).
   * Fixed, made up (not catalogue stars), denser along the galactic plane. Empty on the galaxy level. */
  sky: number[];
  /** Background stars, flattened [x, y, z, ...] (local level only). */
  stars: number[];
  /** Galaxy level: the schematic Milky Way disc on the galactic plane (a world object). Null on the local level.
   * The floor itself is not in the scene: it is the viewport globe's equator, the horizontal plane through the camera
   * centre, so it comes from the live camera (see drawScene). */
  disc: { c: Vec3; r: number } | null;
  nodes: SceneNode[];
  voyages: SceneVoyage[];
  hops: SceneHop[];
  ghosts: SceneGhost[];
  scut: [Vec3, Vec3][];
  tracks: SceneTrack[];
  diamonds: SceneDiamond[];
  labels: SceneLabel[];
  puck: ScenePuck | null;
  /** Default pivot: the narrator's place or position, else the chapter's system, else Sol, else the origin. */
  pivot: Vec3;
  /** Identifies the default pivot, so a chapter change that keeps it keeps the camera. */
  pivotKey: string;
  /** Places the default camera fits around the pivot. */
  fit: Vec3[];
  /** Where each person is drawn now (place, position dot or line), for callout anchors. */
  whereNow: Record<string, Vec3>;
  /** Voyage groups by key, with their anchor (position or midpoint). */
  voyageAnchor: Record<string, Vec3>;
  theme: SceneTheme;
}

function hashAngle(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) / 4294967296) * Math.PI * 2;
}

const same = (a: Vec3, b: Vec3) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) < 1e-3;

/** Names for a list on one line: "Howard, Bert +2". */
export function namesText(names: string[], max: number): string {
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} +${names.length - max}`;
}

/** The label of a voyage group: who, how long, how long to go. */
export function voyageGroupLine(g: VoyageGroup, t: number, narrator: string | null): string {
  const who = g.members.map((m) => m.who);
  const pov = narrator && who.includes(narrator);
  const names = pov ? [narrator!, ...who.filter((w) => w !== narrator)] : who;
  const head = `${pov ? 'POV ' : ''}${namesText(names, 2)}`;
  const vt = voyageText(g, t);
  if (!g.to) {
    const left = g.from ? `left ${g.from}` : 'left';
    return `${head} · ${g.departKnown ? `${left} ${agoText(t - g.departed)}` : 'destination not given'}`;
  }
  return [head, vt.out, vt.toGo].filter(Boolean).join(' · ');
}

/** The short form of a voyage group's label, with no names: "4 · 4 yrs to go", "Marvin · en route for 3 yrs". */
export function voyageGroupShort(g: VoyageGroup, t: number): string {
  const vt = voyageText(g, t);
  const who = g.members.length === 1 ? g.members[0].who : String(g.members.length);
  const when = vt.toGo ?? vt.out ?? (g.to ? null : g.departKnown ? `left ${agoText(t - g.departed)}` : null);
  return when ? `${who} · ${when}` : who;
}

export interface SceneInput {
  view: ProgressView;
  state: MapState;
  level: MapLevel;
  /** Selected Bob (lineage mode). */
  selectedBob: string | null;
  /** The open callout, if any: its place's or voyage's people get their tracks drawn stronger. */
  callout: MapHit | null;
  colourOf: (id: string) => string;
  palette: Palette;
  /** show (default): each place's label lists who is there, each name after his colour dot, instead of the pip row.
   * chapter: names only at places where someone the chapter is about is. hide: the pip row only. */
  names?: LayerMode;
  /** chapter (default): the travel history of the people at the focus place. show: everyone's on the map. hide: none.
   * Lineage mode always draws its routes. */
  history?: LayerMode;
  /** The whole map state before layers were hidden: the default camera frames its places, so hiding a layer never
   * changes the zoom. Defaults to `state`. */
  fitState?: MapState;
}

export function buildScene({ view, state, level, selectedBob, callout, colourOf, palette: pal, names = 'show', history = 'chapter', fitState }: SceneInput): Scene {
  const galaxy = level === 'galaxy';
  const t = state.time;
  const narrator = view.chapter.narrator;
  const placeById = new Map(state.places.map((pl) => [pl.id, pl]));
  // Where a place is drawn on this level: local places collapse to Sol on the galaxy level; far places are not on
  // the local level. Only known places (state.places) are ever drawn.
  const at = (id: string | null | undefined): Vec3 | null => {
    if (!id) return null;
    const pl = placeById.get(id);
    const ps = pl?.pos ?? null;
    if (!pl || !ps) return null;
    if (galaxy) return pl.local ? SOL : ps;
    return pl.local ? ps : null;
  };
  const sel = selectedBob;
  const isOther = (id: string) => !view.info.has(id);
  const colour = (who: string) => (isOther(who) ? null : colourOf(who));
  const hist = routes(view, t);
  const inChapter = names === 'chapter' ? chapterPeople(view, state) : null;
  const groups = groupVoyages(state.voyages);

  // Lineage mode: the selected Bob and the ancestors he was copied from, with their routes up to each copy.
  const line = sel && view.info.has(sel) ? lineage(view, sel, t) : sel ? [{ who: sel, made: null, legs: hist.get(sel)?.legs ?? [] }] : [];
  const inLine = new Set(line.map((x) => x.who));
  const routePlaces = new Set<string>();
  for (const e of line) {
    if (e.made?.place) routePlaces.add(e.made.place);
    for (const l of e.legs) {
      if (l.from) routePlaces.add(l.from);
      if (l.to) routePlaces.add(l.to);
    }
  }
  const dimOf = (who: string) => sel != null && !inLine.has(who);

  // The focus place: the open place callout's, else the narrator's (or the chapter's, when he isn't a Bob).
  const narratorPlace = state.focus;
  const calloutPlace = callout?.kind === 'place' ? callout.id : null;
  const focusPlace = calloutPlace ?? narratorPlace ?? (narrator ? null : view.chapter.system);
  const calloutGroup = callout?.kind === 'voyage' ? groups.find((g) => g.key === callout.id) ?? null : null;

  // --- Markers: places grouped by position.
  const nodes: SceneNode[] = [];
  let cluster: SceneNode | null = null;
  const lineFor = new Map<SceneNode, { people: Pip[]; pov: boolean; presence: MapPresence[] }>();
  for (const pl of state.places) {
    if (!pl.pos) continue;
    if (!galaxy && !pl.local) continue;
    const bobs = [...pl.bobs].sort((a, b) => Number(b === narrator) - Number(a === narrator));
    const pov = !!narrator && bobs[0] === narrator;
    const pips: Pip[] = [
      ...bobs.filter((id) => id !== narrator).map((id) => ({ id, colour: colourOf(id), dim: dimOf(id) })),
      ...pl.others.map((id) => ({ id, colour: null, dim: dimOf(id) })),
    ];
    const count = pl.bobs.length + pl.others.length;
    if (galaxy && pl.local) {
      cluster ??= {
        key: 'sol-neighbourhood', ids: [], p: SOL, puck: false, chapterRing: false, pips: [], more: 0, lost: 0, count: 0,
        dim: false, empty: false, cluster: true, name: 'Sol neighbourhood', drop: false, namesInLabel: false, presence: [],
      };
      cluster.puck ||= pov;
      cluster.count += count;
      continue;
    }
    // Everyone here for the names line, the narrator first.
    const people: Pip[] = [
      ...bobs.map((id) => ({ id, colour: colourOf(id), dim: dimOf(id) })),
      ...pl.others.map((id) => ({ id, colour: null, dim: dimOf(id) })),
    ];
    const hit = nodes.find((n) => same(n.p, pl.pos!));
    if (hit) {
      hit.ids.push(pl.id);
      hit.name = `${hit.name} / ${pl.id}`;
      hit.puck ||= pov;
      hit.pips.push(...pips);
      hit.lost += pl.lost.length;
      hit.count += count;
      hit.presence.push(...pl.presence.map((x) => x.kind));
      hit.empty = hit.count === 0 && hit.lost === 0 && hit.presence.length === 0;
      const lf = lineFor.get(hit)!;
      lf.people.push(...people);
      lf.pov ||= pov;
      lf.presence.push(...pl.presence);
    } else {
      const n: SceneNode = {
        key: pl.id, ids: [pl.id], p: pl.pos, puck: pov, chapterRing: false, pips, more: 0, lost: pl.lost.length, count,
        dim: false, empty: count === 0 && pl.lost.length === 0 && pl.presence.length === 0, cluster: false, name: pl.id, drop: false, namesInLabel: false,
        presence: pl.presence.map((x) => x.kind),
      };
      nodes.push(n);
      lineFor.set(n, { people, pov, presence: [...pl.presence] });
    }
  }
  for (const n of nodes) {
    // The narrator's (or focus) place opens first when several share a point.
    const first = n.ids.findIndex((id) => id === focusPlace || placeById.get(id)?.narrator);
    if (first > 0) n.ids.unshift(...n.ids.splice(first, 1));
    if (!narrator && view.chapter.system && n.ids.includes(view.chapter.system)) n.chapterRing = true;
    if (sel) n.dim = !n.pips.some((x) => inLine.has(x.id)) && !n.ids.some((id) => routePlaces.has(id) || id === focusPlace) && !n.puck;
    n.more = Math.max(0, n.pips.length - MAX_PIPS);
    n.pips = n.pips.slice(0, MAX_PIPS);
  }
  if (cluster) nodes.unshift(cluster);

  // --- Voyages: one solid line with chevrons per group.
  const voyages: SceneVoyage[] = [];
  const voyageAnchor: Record<string, Vec3> = {};
  const whereNow: Record<string, Vec3> = {};
  const labelledDest = new Set<string>();
  const voyageLabels: SceneLabel[] = [];
  let puck: ScenePuck | null = null;
  for (const g of groups) {
    const a = at(g.from);
    const b = g.to ? at(g.to) : null;
    if (!a) continue;
    if (g.to && !b) continue;
    if (galaxy && !b && same(a, SOL)) continue;
    if (b && same(a, b)) continue;
    const who = g.members.map((m) => m.who);
    const hasNarrator = !!narrator && who.includes(narrator);
    const hasSel = !!sel && who.some((w) => inLine.has(w));
    const bobs = g.isOther ? [] : who.filter((w) => w !== narrator);
    const dotted = b && g.fraction != null;
    const sv: SceneVoyage = {
      key: g.key,
      ids: who,
      dotIds: dotted ? bobs.slice(0, 3) : [],
      dots: dotted ? bobs.slice(0, 3).map((w) => colourOf(w)) : [],
      more: dotted ? Math.max(0, bobs.length - 3) : 0,
      colour: g.isOther ? null : colourOf(hasNarrator ? narrator! : who[0]),
      a, b,
      fraction: dotted ? g.fraction : null,
      dim: sel != null && !hasSel,
      strong: hasSel || (sel == null && hasNarrator),
      stubAngle: hashAngle(g.key),
      puck: hasNarrator,
    };
    voyages.push(sv);
    // Where the travellers are drawn: at their position when it is known, else at the origin (the line claims no
    // position, and the narrator's puck sits there). Callouts and the pivot use the same point.
    const anchor = b && sv.fraction != null ? lerp3(a, b, sv.fraction) : a;
    voyageAnchor[g.key] = anchor;
    for (const w of who) whereNow[w] = anchor;
    if (hasNarrator) {
      puck = { colour: colourOf(narrator!), p: anchor, arrow: sv.fraction == null, toward: b, stubAngle: sv.stubAngle };
    }
    // Label: who and how long; the destination on a second line for the narrator's, the selected Bob's and the
    // focus place's groups.
    const touchesFocus = !!focusPlace && (g.from === focusPlace || g.to === focusPlace);
    const lines: LabelLine[] = [{ text: voyageGroupLine(g, t, narrator), font: 'small', tone: 'ink2' }];
    const fallback: LabelLine[] = [{ text: voyageGroupShort(g, t), font: 'small', tone: 'ink2' }];
    const withDest = !!g.to && (hasNarrator || hasSel || touchesFocus || calloutGroup?.key === g.key);
    // Groups on the same line (same route, different arrivals) share one label block, one line each.
    const shared = b ? voyageLabels.find((x) => x.q && same(x.p, a) && same(x.q, b)) : undefined;
    if (shared && sv.dim === (shared.alpha === 0)) {
      const destAt = shared.lines.findIndex((l) => l.text.startsWith('→ '));
      shared.lines.splice(destAt < 0 ? shared.lines.length : destAt, 0, lines[0]);
      shared.fallback = [...(shared.fallback ?? []), ...fallback];
      if (withDest && destAt < 0) shared.lines.push({ text: `→ ${g.to}`, font: 'small', tone: 'ink2' });
      shared.hideWhenFar &&= !hasNarrator && !hasSel;
    } else {
      if (withDest) lines.push({ text: `→ ${g.to}`, font: 'small', tone: 'ink2' });
      voyageLabels.push({
        p: a, q: b,
        dx: b ? 0 : Math.cos(sv.stubAngle) * 30,
        dy: b ? 0 : Math.sin(sv.stubAngle) * 30,
        lines, fallback, gap: 6, below: 6, centred: false,
        alpha: sv.dim ? 0 : 1,
        hideWhenFar: !hasNarrator && !hasSel,
        node: -1,
      });
    }
    if (withDest) labelledDest.add(g.to!);
  }

  // --- Where each person is now (callout anchors), and the narrator's puck at his place.
  for (const n of nodes) {
    for (const pip of n.pips) whereNow[pip.id] ??= n.p;
  }
  for (const pl of state.places) {
    const p = at(pl.id);
    if (!p) continue;
    for (const id of [...pl.bobs, ...pl.others]) whereNow[id] ??= p;
  }
  const narratorNode = nodes.find((n) => n.puck) ?? null;
  if (narrator && narratorNode) puck = { colour: colourOf(narrator), p: narratorNode.p, arrow: false, toward: null, stubAngle: 0 };

  // --- Wormhole hops and transmissions: arcs in the air.
  const hops: SceneHop[] = [];
  for (const h of state.hops) {
    const b = at(h.to);
    if (!b) continue;
    let a = at(h.from);
    if (a && same(a, b)) a = null;
    hops.push({ who: h.who, colour: colour(h.who), transmitted: h.via === 'transmitted', a, b, dim: dimOf(h.who) });
  }

  // --- Ghost trails (flashback chapters): what is already known to happen by NOW.
  const ghosts: SceneGhost[] = [];
  for (const g of state.ghosts) {
    let a: Vec3 | null = null;
    if (g.from.place) a = at(g.from.place);
    else if (g.from.voyage) {
      const f = at(g.from.voyage.from);
      const to = at(g.from.voyage.to);
      a = f && to && g.from.voyage.fraction != null ? lerp3(f, to, g.from.voyage.fraction) : f;
    }
    const b = g.to.place ? at(g.to.place) : g.to.voyage ? at(g.to.voyage.from) : null;
    if (!a || !b || same(a, b)) continue;
    ghosts.push({ who: g.who, colour: colour(g.who), a, b, dim: dimOf(g.who) });
    whereNow[g.who] ??= b;
  }

  // --- SCUT links (hidden in lineage mode).
  const scut: [Vec3, Vec3][] = [];
  if (!sel) {
    for (const [x, y] of state.scutLinks) {
      const a = at(x);
      const b = at(y);
      if (a && b && !same(a, b)) scut.push([a, b]);
    }
  }

  const floorLabels: SceneLabel[] = [];
  let lastStop: Vec3 | null = null;
  // --- Default pivot and the places the camera fits.
  let pivot: Vec3 = SOL;
  let pivotKey = 'origin';
  const fit = fitState
    ? fitState.places.flatMap((pl) => (pl.pos && (galaxy || pl.local) ? [galaxy && pl.local ? SOL : pl.pos] : []))
    : nodes.map((n) => n.p);
  if (puck) {
    pivot = puck.p;
    pivotKey = narratorNode ? `place:${narratorNode.key}` : `voyage:${narrator}`;
  } else {
    // Narrator lost, missing, at a place with no position, or not a Bob: his last mapped stop, else the chapter's
    // system, else Sol.
    const r = narrator ? hist.get(narrator) : null;
    const stops = r ? [r.made?.place ?? null, ...r.legs.flatMap((l) => [l.from, l.to])].filter((x): x is string => !!x) : [];
    const lastMapped = [...stops].reverse().find((s) => at(s));
    const cs = at(view.chapter.system);
    if (r && r.end.status === 'active' && lastMapped && !(r.end.place && at(r.end.place))) {
      pivot = at(lastMapped)!;
      pivotKey = `place:${lastMapped}`;
      if (r.end.place && !at(r.end.place)) {
        lastStop = pivot;
      }
    } else if (r && lastMapped && r.end.status !== 'active') {
      pivot = at(r.end.place) ?? at(lastMapped)!;
      pivotKey = `place:${r.end.place ?? lastMapped}`;
    } else if (cs) {
      pivot = cs;
      pivotKey = `place:${view.chapter.system}`;
      // A Bob narrator with no recorded place: the chapter heading still says where it is set.
      const cn = nodes.find((n) => n.ids.includes(view.chapter.system!));
      if (cn) cn.chapterRing = true;
    } else if (at('Sol')) {
      pivot = at('Sol')!;
      pivotKey = 'place:Sol';
    } else if (galaxy && cluster) {
      pivot = SOL;
      pivotKey = 'cluster';
    }
  }
  // Floor labels and lineage tracks keep the star's own position and are flagged `flat`: the drawing puts them on the
  // floor, the horizontal plane through the live camera centre (the viewport globe's equator).
  if (lastStop) {
    floorLabels.push({ p: lastStop, q: null, dx: 0, dy: 22, lines: [{ text: 'last mapped stop', font: 'small', tone: 'ink3' }], gap: 0, below: 0, centred: true, flat: true, alpha: 1, hideWhenFar: false, node: -1 });
  }

  // --- Travel history on the floor.
  const tracks: SceneTrack[] = [];
  const diamonds: SceneDiamond[] = [];
  // Lineage mode lays the whole route on the floor (the past lies on the floor, under the stars it visited). The
  // default view draws only the routes of the people at the focus place, from star to star, so each leg visibly
  // leaves and reaches the systems it names.
  // Travel history is the past: a thin, faint dashed line in his colour (well below a voyage's strength), no chevrons.
  const addLegs = (who: string, legs: RouteLeg[], alpha: number, width: number, col: string | null, flat: boolean) => {
    for (const l of legs) {
      const pa = at(l.from);
      const pb = at(l.to);
      if (!pa && !pb) continue;
      if (pa && pb && same(pa, pb)) continue;
      tracks.push({
        who, colour: col,
        a: (pa ?? pb)!, b: pa && pb ? pb : null, reversed: !pa, flat,
        stubAngle: hashAngle(`${who}|${l.from}|${l.to}`),
        via: l.via, alpha, width, lane: 0, lanes: 1,
      });
    }
  };
  const addDiamond = (who: string, r: { made: Route['made']; legs: RouteLeg[] } | undefined, alpha: number, flat: boolean) => {
    if (!r) return;
    const other = isOther(who);
    const origin = other ? r.legs[0]?.from ?? null : r.made?.place ?? null;
    const p = at(origin);
    if (p) diamonds.push({ who, p, flat, colour: other ? null : colourOf(who), alpha, size: flat ? 4.5 : 8 });
  };
  const peopleAt = (place: string | null) => {
    const pl = place ? placeById.get(place) : null;
    return pl ? [...pl.bobs, ...pl.others] : [];
  };
  if (sel) {
    line.forEach((e, i) => {
      const me = i === line.length - 1;
      addLegs(e.who, e.legs, me ? 0.55 : 0.4, me ? 1.5 : 1.25, colour(e.who), true);
      addDiamond(e.who, e, me ? 1 : 0.7, true);
    });
    // Stop labels on the floor: where he was made, and how long he stayed at each stop.
    const me = line[line.length - 1];
    const stops: { place: string | null; text: string }[] = [];
    for (const e of line) {
      if (e.made?.place) stops.push({ place: e.made.place, text: `${e.who === sel ? '' : `${e.who} `}made${e.made.year != null ? ` ${yearText(e.made.year)}` : ''}` });
    }
    const away = state.voyages.find((v) => v.who === sel && v.departKnown);
    me.legs.forEach((l, i) => {
      if (!l.to || l.arrived == null) return;
      const next = me.legs[i + 1];
      const left = next ? next.departed ?? next.arrived : away && away.from === l.to ? away.departed : null;
      stops.push({ place: l.to, text: left != null ? `${yearText(l.arrived)}–${yearText(left)}` : `since ${yearText(l.arrived)}` });
    });
    for (const s of stops) {
      const p = at(s.place);
      if (!p) continue;
      floorLabels.push({ p, q: null, dx: 0, dy: 8, lines: [{ text: s.text, font: 'small', tone: 'ink2' }], gap: 0, below: 0, centred: true, flat: true, alpha: 1, hideWhenFar: false, node: -1 });
    }
  } else if (history !== 'hide') {
    const stronger = !!calloutPlace || !!calloutGroup;
    const everyone = [...state.places.flatMap((pl) => [...pl.bobs, ...pl.others]), ...state.voyages.map((v) => v.who)];
    const who = calloutGroup ? calloutGroup.members.map((m) => m.who) : history === 'show' && !calloutPlace ? everyone : peopleAt(focusPlace);
    for (const id of who) {
      const r = hist.get(id);
      if (!r) continue;
      addLegs(id, r.legs, stronger ? 0.38 : 0.3, 1.25, colour(id), false);
      if (!calloutGroup) addDiamond(id, r, stronger ? 0.6 : 0.45, false);
    }
  }
  // Shared legs draw side by side.
  const laneKey = (tr: SceneTrack) => {
    if (!tr.b) return `${tr.a.x.toFixed(3)},${tr.a.y.toFixed(3)}|stub|${tr.who}`;
    const k1 = `${tr.a.x.toFixed(3)},${tr.a.y.toFixed(3)}`;
    const k2 = `${tr.b.x.toFixed(3)},${tr.b.y.toFixed(3)}`;
    return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
  };
  const byLane = new Map<string, SceneTrack[]>();
  for (const tr of tracks) {
    const k = laneKey(tr);
    byLane.set(k, [...(byLane.get(k) ?? []), tr]);
  }
  for (const list of byLane.values()) {
    const n = Math.min(4, list.length);
    list.forEach((tr, i) => {
      tr.lane = Math.min(i, 3);
      tr.lanes = n;
    });
  }

  // --- Drop lines at rest: only the pivot or focus place, a voyage callout's two ends, and the selected Bob's places
  // (where he is now and every stop on his route, his ancestors' included). The rest appear while the camera moves.
  const pivotPlace = pivotKey.startsWith('place:') ? pivotKey.slice(6) : null;
  const keep = new Set<string>([...routePlaces]);
  for (const id of [focusPlace, pivotPlace, calloutGroup?.from, calloutGroup?.to]) if (id) keep.add(id);
  for (const n of nodes) {
    if (n.cluster) continue;
    n.drop = n.puck || n.chapterRing || n.ids.some((id) => keep.has(id)) || (!!sel && (n.pips.some((x) => x.id === sel) || (sel === narrator && n.puck)));
  }

  if (galaxy) {
    const { x, y } = GALACTIC_CENTRE;
    const r = DISC_RADIUS_PC;
    fit.push({ x: x - r, y, z: 0 }, { x: x + r, y, z: 0 }, { x, y: y - r, z: 0 }, { x, y: y + r, z: 0 });
  }

  // --- Labels, in priority order: the focus place, the selected Bob's stops, busy places, voyage groups, voyage
  // destinations, empty places.
  const labels: { prio: number; l: SceneLabel }[] = [];
  nodes.forEach((n, i) => {
    const lf = lineFor.get(n);
    const isFocus = n.ids.includes(focusPlace ?? '\u0000') || n.puck;
    const lines: LabelLine[] = [];
    if (n.cluster) {
      lines.push({ text: 'Sol neighbourhood', font: 'label', tone: 'ink' });
      lines.push({ text: n.count ? plural(n.count, 'person', 'people') : 'nobody', font: 'line2', tone: 'ink2' });
    } else if (n.empty) {
      lines.push({ text: n.ids.join(' / '), font: 'small', tone: 'ink3' });
    } else {
      for (const id of n.ids) lines.push({ text: id, font: 'label', tone: 'ink' });
      const people = lf?.people ?? [];
      const namesOn = names === 'show' || (names === 'chapter' && people.some((x) => inChapter!.has(x.id)));
      if (namesOn && people.length) {
        // Each name after his colour dot (another replicant: a hollow ink square); the narrator keeps POV. Up to three
        // at the focus place and two elsewhere (one when two would be long), then "+N".
        const runs: LabelRun[] = people.map((x, k) => ({ text: k === 0 && lf?.pov ? `${x.id} POV` : x.id, mark: x.colour, id: x.id, dim: x.dim }));
        let max = isFocus ? 3 : 2;
        if (!isFocus && runs.slice(0, 2).reduce((w, r) => w + r.text.length + 3, 0) > 26) max = 1;
        const shown = runs.slice(0, max);
        if (runs.length > max) shown.push({ text: `+${runs.length - max}` });
        lines.push({ text: shown.map((r) => r.text).join(' · '), font: 'line2', tone: 'ink2', runs: shown });
        n.namesInLabel = true;
      }
    }
    for (const text of new Set((lf?.presence ?? []).map(presenceText))) lines.push({ text, font: 'small', tone: 'ink3' });
    if (n.chapterRing) lines.push({ text: 'Chapter set here', font: 'line2', tone: 'ink2' });
    const onRoute = n.ids.some((id) => routePlaces.has(id));
    const prio = isFocus
      ? 0
      : sel && onRoute
        ? 1
        : n.count > 0 || n.lost > 0
          ? 2 + 1 / (1 + n.count)
          : n.presence.length
            ? 4
            : n.ids.some((id) => labelledDest.has(id))
            ? 5
            : 6;
    // Under the pip row when it shows; names on, the label sits right under the marker (the pips draw only if it
    // finds no room).
    const below = n.pips.length && !n.namesInLabel ? 22 + (n.puck ? PUCK_PIP_SHIFT : 0) : n.puck ? 20 : 9;
    labels.push({
      prio,
      l: {
        p: n.p, q: null, dx: 0, dy: 0, lines, gap: n.puck || n.chapterRing ? 19 : n.empty ? 7 : 10, below, centred: false,
        alpha: n.dim ? 0.55 : 1, hideWhenFar: false, node: i, force: prio < 0.5,
      },
    });
  });
  for (const fl of floorLabels) labels.push({ prio: 1.5, l: fl });
  // Voyage labels answer "who is in transit, and where to": they rank above every place label but the focus.
  for (const vl of voyageLabels) if (vl.alpha > 0) labels.push({ prio: vl.hideWhenFar ? 1.8 : 0.5, l: vl });
  labels.sort((a, b) => a.prio - b.prio);

  // Only places the reader has met are drawn: no background stars (they made the map busy, and with none drawn no
  // gap can single out a place still to come).
  const stars: number[] = [];


  return {
    level,
    sky: galaxy ? [] : SKY,
    stars,
    disc: galaxy ? { c: GALACTIC_CENTRE, r: DISC_RADIUS_PC } : null,
    nodes,
    voyages,
    hops,
    ghosts,
    scut,
    tracks,
    diamonds,
    labels: labels.map((x) => x.l),
    puck,
    pivot,
    pivotKey,
    fit,
    whereNow,
    voyageAnchor,
    theme: { bg: pal.bg, ink: pal.ink, ink2: pal.ink2, ink3: pal.ink3, line: pal.line, dark: pal.scheme === 'dark' },
  };
}

/** A round distance as words: "10 ly", "5,000 ly". Thousands separated by commas, without Intl or regular
 * expressions (worklet-safe). */
export function lyLabel(ly: number): string {
  'worklet';
  const rounded = Math.round(ly * 100) / 100;
  let digits = String(rounded);
  if (rounded >= 1000) {
    const whole = String(Math.round(rounded));
    digits = '';
    for (let i = 0; i < whole.length; i++) digits += (i > 0 && (whole.length - i) % 3 === 0 ? ',' : '') + whole[i];
  }
  return `${digits} ly`;
}

/** The viewport globe's diameter as words, for the line under the scale bar: whole light years under 1,000
 * ("42 ly"), then two significant figures with thousands separators ("1,200 ly", "26,000 ly"). `globePt` is the
 * globe's radius in screen points and `scale` the zoom in points per parsec, so it depends on the zoom and the globe's
 * size only (never on turning or tilting). Empty when there is nothing to show. Worklet-safe. */
export function viewportDiameter(globePt: number, scale: number): string {
  'worklet';
  const ly = ((2 * globePt) / scale) * LY_PER_PC;
  if (!(ly > 0) || !Number.isFinite(ly)) return '';
  if (ly < 999.5) return lyLabel(Math.max(1, Math.round(ly)));
  const mag = Math.pow(10, Math.floor(Math.log10(ly)) - 1);
  return lyLabel(Math.round(ly / mag) * mag);
}

/** Round lengths the distance scale bar may show, light years: 1, 2, 5, 10, 20, 50, ... */
const NICE = [1, 2, 5];

/** The bar a shown length may keep while zooming (points): it changes only once the bar leaves this band. */
export const SCALE_BAR_KEEP = { min: 40, max: 130 };

/** The distance scale bar for a zoom (`scale` in screen points per parsec): the largest round length in light years
 * whose bar is at most `maxPt` long. With steps of at most 2.5× the bar is always longer than maxPt / 2.5 (48 pt for
 * the default 120). It depends on the zoom only, so turning and tilting never change it. `prev`, the length shown
 * before, is kept while its bar stays within SCALE_BAR_KEEP, so a pinch that hovers near a step never makes the bar
 * flip between two lengths. */
export function scaleBarFor(scale: number, maxPt = 120, prev = 0): { ly: number; pt: number; label: string } {
  'worklet';
  const ptPerLy = scale / LY_PER_PC;
  if (!(ptPerLy > 0) || !Number.isFinite(ptPerLy)) return { ly: 0, pt: 0, label: '' };
  let best = 1;
  if (prev > 0 && prev * ptPerLy >= SCALE_BAR_KEEP.min && prev * ptPerLy <= SCALE_BAR_KEEP.max) best = prev;
  else {
    for (let e = -2; e <= 6; e++) {
      for (let i = 0; i < NICE.length; i++) {
        const ly = NICE[i] * Math.pow(10, e);
        if (ly * ptPerLy <= maxPt) best = ly;
      }
    }
    if (best * ptPerLy > maxPt) best = 0.01;
  }
  const rounded = Math.round(best * 100) / 100;
  return { ly: rounded, pt: rounded * ptPerLy, label: lyLabel(rounded) };
}

/** Screen offset of pip i (of n) under its marker: one centred row. Shared by drawing and hit testing. */
export function pipOffset(i: number, n: number, puck = false): { dx: number; dy: number } {
  'worklet';
  const row = Math.floor(i / PIP_ROW);
  const inRow = Math.min(PIP_ROW, n - row * PIP_ROW);
  const col = i - row * PIP_ROW;
  return { dx: (col - (inRow - 1) / 2) * PIP_GAP, dy: 13 + row * PIP_ROW_GAP + (puck ? PUCK_PIP_SHIFT : 0) };
}
