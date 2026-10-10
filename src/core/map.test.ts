// Systems map tests against the real data file: the galactic frame, what the map may name, and that voyages and
// ghost trails never use a record past the reveal gate.
import { describe, expect, it } from 'vitest';
import raw from '../data/tree-of-bob.json';
import {
  agoText,
  BACKGROUND_RADIUS_LY,
  backgroundStars,
  buildModel,
  clampTilt,
  DEFAULT_TILT,
  MAX_TILT,
  computeView,
  distanceLy,
  fitCamera,
  ghostTrails,
  groupVoyages,
  headingSetting,
  lineage,
  mapSummary,
  otherStatus,
  pivotFit,
  routes,
  spanText,
  voyageText,
  type MapVoyage,
  knownPlaces,
  LY_PER_PC,
  mapState,
  placePositions,
  planeFoot,
  heightAbove,
  project,
  rank,
  revealYear,
  systemIn,
  toGalactic,
  type MoveRecord,
  type ProgressView,
  type TreeData,
  type Vec3,
} from './index';

const data = raw as unknown as TreeData;
const model = buildModel(data);
const at = (book: number, chapter: number) => computeView(model, { book, chapter });
const sys = (id: string) => data.systems!.find((s) => s.id === id)!;
const mapDate = (v: ProgressView) => v.chapter.time ?? v.latest!;
/** Every 5th chapter of the series, plus the last. */
const sweep = model.chapters.filter((_, i) => i % 5 === 0 || i === model.chapters.length - 1);

describe('galactic frame', () => {
  it('puts Sagittarius A* towards the galactic centre, in the plane', () => {
    const g = toGalactic(sys('Sagittarius A*').pos!);
    expect(g.x / 1000).toBeCloseTo(8.3, 0);
    expect(Math.abs(g.y)).toBeLessThan(100);
    expect(Math.abs(g.z)).toBeLessThan(100);
  });
  it('keeps distances: Epsilon Eridani is about 10.5 ly from Sol', () => {
    const p = sys('Epsilon Eridani').pos!;
    expect(distanceLy(toGalactic(p))).toBeCloseTo(10.5, 0);
    expect(distanceLy(toGalactic(p))).toBeCloseTo(distanceLy(p), 6);
    expect(distanceLy({ x: 1, y: 0, z: 0 })).toBeCloseTo(LY_PER_PC, 6);
  });
});

describe('knownPlaces', () => {
  it('never names a place first named after the gate', () => {
    for (const ref of sweep) {
      const v = computeView(model, { book: ref.book.id, chapter: ref.chapter.n });
      // Built independently of knownPlaces: names in revealed records, and in headings up to the current chapter.
      const named = new Set<string>();
      for (const id of v.ids) if (v.info.get(id)!.bob.where) named.add(v.info.get(id)!.bob.where!);
      for (const m of [...data.moves])
        if (rank(m.reveal) <= v.P && (v.ids.includes(m.bob) || v.others.some((o) => o.id === m.bob))) {
          if (m.from) named.add(m.from);
          if (m.to) named.add(m.to);
        }
      for (const c of model.chapters.slice(0, v.index + 1)) {
        const s = headingSetting(model, c.chapter.place)?.system ?? systemIn(model, c.chapter.place);
        if (s) named.add(s);
      }
      for (const k of knownPlaces(v)) expect(named, `B${ref.book.id} Ch ${ref.chapter.n}: ${k}`).toContain(k);
    }
  });
});

describe('mapState at Book 2 ch 34', () => {
  const v = at(2, 34);
  const s = mapState(v, mapDate(v));
  it('focuses on the narrator at Epsilon Eridani', () => {
    expect(s.focus).toBe('Epsilon Eridani');
    expect(s.places[0].narrator).toBe(true);
  });
  it('places Howard, Bert and Ernie on the Sol → Omicron² Eridani voyage, about 81% of the way', () => {
    for (const who of ['Howard', 'Bert', 'Ernie']) {
      const y = s.voyages.find((x) => x.who === who)!;
      expect(y, who).toBeDefined();
      expect(y.from).toBe('Sol');
      expect(y.to).toBe('Omicron² Eridani');
      expect(y.fraction!).toBeCloseTo(0.81, 2);
    }
  });
  it('draws no position dot for Marvin, whose arrival is not revealed', () => {
    const m = s.voyages.find((x) => x.who === 'Marvin')!;
    expect(m).toBeDefined();
    expect(m.arrives).toBeNull();
    expect(m.fraction).toBeNull();
  });
  it('shows what is already known to happen by NOW as ghost trails', () => {
    expect(v.chapter.flashbackYear).not.toBeNull();
    const howard = s.ghosts.find((g) => g.who === 'Howard')!;
    expect(howard.to.place).toBe('Omicron² Eridani');
    const bashful = s.ghosts.find((g) => g.who === 'Bashful')!;
    expect(bashful.to.status).toBe('lost');
  });
});

describe('mapState spoiler gate', () => {
  it('never computes a voyage fraction from an arrival past the gate', () => {
    for (const ref of model.chapters) {
      const v = computeView(model, { book: ref.book.id, chapter: ref.chapter.n });
      const heading = rank({ book: ref.book.id, chapter: ref.chapter.n });
      for (const t of [mapDate(v), v.latest!]) {
        for (const y of mapState(v, t).voyages) {
          if (y.arrives == null) continue;
          // Revealed arrivals, or ones inferred from a read heading (kept in the Bob's own moves, never the Log).
          const pool: MoveRecord[] = y.isOther ? v.otherMoves : [...v.moves, ...v.info.get(y.who)!.moves.filter((m) => m.inferred && rank(m.reveal) <= heading)];
          const arrival = pool.find((m) => m.bob === y.who && m.kind === 'arrive' && Math.abs((m.year ?? revealYear(model, m.reveal) ?? 0) - y.arrives!) < 0.02);
          expect(arrival, `B${ref.book.id} Ch ${ref.chapter.n}: ${y.who} arriving ${y.arrives}`).toBeDefined();
        }
      }
    }
  });
  it('keeps far places off the map until they are named', () => {
    const v = at(4, 1);
    expect(knownPlaces(v).has('Sagittarius A*')).toBe(false);
    expect(mapState(v, mapDate(v)).places.map((p) => p.id)).not.toContain('Sagittarius A*');
    expect(mapState(v, v.latest!).places.map((p) => p.id)).not.toContain('Sagittarius A*');
  });
  it('lists only known places, for every 5th chapter', () => {
    for (const ref of sweep) {
      const v = computeView(model, { book: ref.book.id, chapter: ref.chapter.n });
      const known = knownPlaces(v);
      for (const p of mapState(v, mapDate(v)).places) expect(known, `B${ref.book.id} Ch ${ref.chapter.n}: ${p.id}`).toContain(p.id);
    }
  });
});

describe('placePositions', () => {
  const pos = placePositions(model);
  it('puts the two antimatter names on the same point, at Sagittarius A*', () => {
    const a = pos.get('Central Antimatter Works (7 ly from Sagittarius A*)')!;
    const b = pos.get('Antimatter Fountain (7 ly from galactic core)')!;
    expect(a).toBeDefined();
    expect(b).toEqual(a);
    expect(a).toEqual(pos.get('Sagittarius A*'));
  });
  it('leaves a place far from its anchor, in an unknown direction, unplaced', () => {
    expect(pos.has('Skippyland')).toBe(false);
  });
});

describe('camera', () => {
  const pts: Vec3[] = [
    { x: 0, y: 0, z: 0 },
    { x: 3, y: -1, z: 0.5 },
    { x: -2, y: 4, z: -1 },
    { x: 1, y: 2, z: 2 },
  ];
  it('projects the centre to the screen centre', () => {
    const cam = fitCamera(pts, 400, 300);
    const c = project(cam.center, cam);
    expect(c.x).toBeCloseTo(200, 6);
    expect(c.y).toBeCloseTo(150, 6);
  });
  it('fits every point inside the box with padding, at any rotation', () => {
    for (const yaw of [0, 0.7, 2, 4]) {
      const cam = fitCamera(pts, 400, 300, yaw, undefined, 40);
      for (const p of pts) {
        const q = project(p, cam);
        expect(q.x).toBeGreaterThanOrEqual(40 - 1e-6);
        expect(q.x).toBeLessThanOrEqual(360 + 1e-6);
        expect(q.y).toBeGreaterThanOrEqual(40 - 1e-6);
        expect(q.y).toBeLessThanOrEqual(260 + 1e-6);
      }
    }
  });
  it('looks straight down at tilt 0 with north up the screen', () => {
    const cam = fitCamera(pts, 400, 300, 0, 0);
    const a = project({ x: 0, y: 1, z: 0 }, cam);
    const b = project({ x: 0, y: 0, z: 0 }, cam);
    expect(a.y).toBeLessThan(b.y);
    expect(a.x).toBeCloseTo(b.x, 6);
  });
  it('centres the projected cloud in the box when heights are lopsided', () => {
    const tall: Vec3[] = [
      { x: -10, y: -10, z: 0 },
      { x: 10, y: 10, z: 0 },
      { x: 0, y: 0, z: 30 },
    ];
    for (const yaw of [0, 1.1]) {
      const cam = fitCamera(tall, 400, 800, yaw, undefined, 40);
      const q = tall.map((p) => project(p, cam));
      const ys = q.map((r) => r.y);
      const xs = q.map((r) => r.x);
      expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(400, 4);
      expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(200, 4);
      // The limiting side is filled edge to edge.
      expect(Math.max(Math.max(...xs) - Math.min(...xs) - 320, Math.max(...ys) - Math.min(...ys) - 720)).toBeCloseTo(0, 4);
    }
  });
  it('keeps the reader\'s tilt between straight down and straight up from below', () => {
    expect(clampTilt(-1)).toBe(0);
    expect(clampTilt(4)).toBe(MAX_TILT);
    expect(clampTilt(2)).toBe(2);
    expect(clampTilt(DEFAULT_TILT)).toBe(DEFAULT_TILT);
    expect(clampTilt(Number.NaN)).toBe(DEFAULT_TILT);
    expect(MAX_TILT).toBeCloseTo(Math.PI, 6);
  });
  it('seen from below, a star above the plane is further from the viewer than its foot, and the view is not mirrored', () => {
    const cam = { yaw: 0.4, tilt: 2.4, scale: 10, center: { x: 0, y: 0, z: 0 }, cx: 0, cy: 0 };
    expect(project({ x: 1, y: 1, z: 2 }, cam).depth).toBeLessThan(project({ x: 1, y: 1, z: 0 }, cam).depth);
    // Straight up from below: x keeps its screen direction and y flips, a half turn about the screen's horizontal
    // axis (a rotation, so turning still reads as turning).
    const up = { ...cam, yaw: 0, tilt: Math.PI };
    expect(project({ x: 1, y: 0, z: 0 }, up).x).toBeCloseTo(10, 6);
    expect(project({ x: 0, y: 1, z: 0 }, up).y).toBeCloseTo(10, 6);
    expect(project({ x: 0, y: 0, z: 1 }, up).depth).toBeCloseTo(-1, 6);
  });
  it('fits the same scale from below as from above', () => {
    const pts = [{ x: 3, y: 1, z: 1 }, { x: -2, y: 4, z: -1 }, { x: 1, y: -3, z: 0.5 }];
    const a = pivotFit({ x: 0, y: 0, z: 0 }, pts, 400, 800, 0.9);
    const b = pivotFit({ x: 0, y: 0, z: 0 }, pts, 400, 800, Math.PI - 0.9);
    expect(b.scale).toBeCloseTo(a.scale, 6);
  });
  it('shows height at every tilt the reader can reach, and turns the floor towards edge-on as the tilt grows', () => {
    const base = { yaw: 0.4, scale: 10, center: { x: 0, y: 0, z: 0 }, cx: 0, cy: 0 };
    let lastSpan = Infinity;
    for (const tilt of [0, 0.5, DEFAULT_TILT, (85 * Math.PI) / 180]) {
      const cam = { ...base, tilt };
      // A star above the plane is nearer the viewer than its foot.
      expect(project({ x: 1, y: 1, z: 2 }, cam).depth).toBeGreaterThan(project({ x: 1, y: 1, z: 0 }, cam).depth);
      // The floor's depth along the screen shrinks as the view tilts towards the plane.
      const span = Math.abs(project({ x: 0, y: 5, z: 0 }, { ...cam, yaw: 0 }).y - project({ x: 0, y: -5, z: 0 }, { ...cam, yaw: 0 }).y);
      expect(span).toBeLessThan(lastSpan);
      lastSpan = span;
    }
  });
  it('puts the foot of a drop line on the reference plane through a given point', () => {
    expect(planeFoot({ x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 2, z: 0 });
    const chapter = { x: 5, y: -1, z: 1.5 };
    expect(planeFoot({ x: 1, y: 2, z: 3 }, chapter)).toEqual({ x: 1, y: 2, z: 1.5 });
    expect(planeFoot({ x: 1, y: 2, z: 3 }, -2)).toEqual({ x: 1, y: 2, z: -2 });
    expect(heightAbove({ x: 1, y: 2, z: 3 }, chapter)).toBeCloseTo(1.5, 9);
    expect(heightAbove({ x: 0, y: 0, z: 0.5 }, chapter)).toBeCloseTo(-1, 9);
    // The chapter's own system sits on the plane: no height, no drop line.
    expect(heightAbove(chapter, chapter)).toBe(0);
  });
  it('the floor through the camera centre, at any height, is the globe\'s equator: feet lie on its ellipse', () => {
    // A camera orbiting a point well above the galactic plane: the floor is the horizontal plane through that point.
    for (const tilt of [0, 0.5, DEFAULT_TILT, Math.PI / 2, 2.3, MAX_TILT]) {
      for (const yaw of [0, 0.9, 3.5]) {
        const cam = { yaw, tilt, scale: 12, center: { x: 4, y: -3, z: 2.75 }, cx: 200, cy: 300 };
        // The centre's own foot is the centre: it projects to the screen centre with no height.
        expect(heightAbove(cam.center, cam.center)).toBe(0);
        const c = project(planeFoot(cam.center, cam.center), cam);
        expect(c.x).toBeCloseTo(200, 9);
        expect(c.y).toBeCloseTo(300, 9);
        // Any star's foot r parsecs from the centre lands on the ellipse of radius r * scale across the screen,
        // squashed by |cos tilt| up it: the equator of a globe of that radius, centred on the screen centre.
        for (const [p, r] of [[{ x: 7, y: 1, z: -5 }, 5], [{ x: 4, y: -1, z: 9 }, 2], [{ x: -1, y: -3, z: 2.75 }, 5]] as const) {
          const f = project(planeFoot(p, cam.center), cam);
          const u = (f.x - 200) / (r * 12);
          const ct = Math.abs(Math.cos(tilt));
          if (ct > 1e-6) expect(u * u + ((f.y - 300) / (r * 12 * ct)) ** 2).toBeCloseTo(1, 9);
          else expect(f.y).toBeCloseTo(300, 9);
          expect(heightAbove(p, cam.center)).toBeCloseTo(p.z - 2.75, 9);
        }
      }
    }
  });
  it('fits with the centre at the middle of the points\' heights', () => {
    expect(fitCamera(pts, 400, 300).center.z).toBeCloseTo(0.5, 9);
  });
  it('falls back to a default camera with no points', () => {
    const cam = fitCamera([], 400, 300);
    expect(cam.cx).toBe(200);
    expect(cam.scale).toBeGreaterThan(0);
  });
});

describe('ghost trails of other replicants', () => {
  it('dates a lost replicant by his revealed fate, not by NOW', () => {
    const v = at(2, 4);
    const fate = v.otherFates.find((f) => f.bob === 'Medeiros (82 Eridani)' && f.status !== 'alive')!;
    expect(fate).toBeTruthy();
    const g = ghostTrails(v, mapDate(v)).find((x) => x.who === 'Medeiros (82 Eridani)')!;
    expect(g.to.status).toBe('lost');
    expect(g.year).toBeCloseTo(fate.year!, 2);
    expect(g.year).toBeLessThan(v.latest! - 1);
  });
});

describe('background stars', () => {
  const key = (p: Vec3) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
  const near = data.systems!.filter((s) => s.pos && distanceLy(toGalactic(s.pos)) <= BACKGROUND_RADIUS_LY);
  it('draw every story system inside the starfield before it is named', () => {
    const v = at(1, 1);
    const st = mapState(v, mapDate(v));
    const stars = new Set(backgroundStars(v, st).map(key));
    const named = new Set(st.places.map((p) => p.id));
    expect(near.length).toBeGreaterThan(5);
    for (const s of near) if (!named.has(s.id)) expect(stars.has(key(toGalactic(s.pos!)))).toBe(true);
  });
  it('keep the same dots as places become known: a star becomes a marker, nothing appears or vanishes', () => {
    const dots = (v: ProgressView) => {
      const st = mapState(v, mapDate(v));
      const out = new Set(backgroundStars(v, st).map(key));
      const pos = placePositions(model);
      for (const pl of st.places) {
        const p = pos.get(pl.id);
        if (p && distanceLy(p) <= BACKGROUND_RADIUS_LY && sys(pl.id)?.pos) out.add(key(p));
      }
      return out;
    };
    const first = dots(at(1, 1));
    for (const [b, c] of [[1, 21], [2, 34], [5, 70]] as const) expect(dots(at(b, c))).toEqual(first);
  });
  it('never add a story system beyond the starfield radius', () => {
    const v = at(1, 1);
    const st = mapState(v, mapDate(v));
    for (const p of backgroundStars(v, st)) expect(distanceLy(p)).toBeLessThanOrEqual(BACKGROUND_RADIUS_LY + 1e-6);
  });
});

describe('routes: travel history', () => {
  const v6 = at(2, 6);
  const r6 = routes(v6, mapDate(v6));
  it('Mulder at B2 ch 6: made at Epsilon Eridani, one leg to Eta Cassiopeiae with no departure given', () => {
    const m = r6.get('Mulder')!;
    expect(m.made).toEqual({ place: 'Epsilon Eridani', year: null, by: 'Bill' });
    expect(m.legs).toHaveLength(1);
    expect(m.legs[0]).toMatchObject({ from: 'Epsilon Eridani', to: 'Eta Cassiopeiae', departed: null, inferred: true });
    expect(m.legs[0].arrived).toBeCloseTo(2170.8, 2);
    expect(m.end).toMatchObject({ status: 'active', place: 'Eta Cassiopeiae' });
  });
  it('Bob at B2 ch 6: Sol → Epsilon Eridani → Delta Eridani, the heading-inferred duplicate departure merged', () => {
    const b = r6.get('Bob')!;
    expect(b.made?.place).toBe('Sol');
    expect(b.made?.year).toBeCloseTo(2133.48, 2);
    expect(b.legs.map((l) => [l.from, l.to])).toEqual([
      ['Sol', 'Epsilon Eridani'],
      ['Epsilon Eridani', 'Delta Eridani'],
    ]);
    expect(b.legs[0].departed).toBeCloseTo(2133.63, 2);
    expect(b.legs.every((l) => !l.inferred)).toBe(true);
  });
  it('Mario at B2 ch 6: the voyage to Zeta Tucanae under way is not a leg', () => {
    const m = r6.get('Mario')!;
    expect(m.legs.map((l) => l.to)).toEqual(['Beta Hydri']);
    expect(m.end.place).toBeNull();
  });
  it('Henry Roberts (not a Bob) at B2 ch 34: Sol → Epsilon Indi → Epsilon Eridani', () => {
    const v = at(2, 34);
    const h = routes(v, mapDate(v)).get('Henry Roberts')!;
    expect(h.isOther).toBe(true);
    expect(h.made).toBeNull();
    expect(h.legs.map((l) => [l.from, l.to])).toEqual([
      ['Sol', 'Epsilon Indi'],
      ['Epsilon Indi', 'Epsilon Eridani'],
    ]);
  });
  it('has no route for Mulder before he is revealed (B2 ch 3)', () => {
    const v = at(2, 3);
    expect(routes(v, mapDate(v)).has('Mulder')).toBe(false);
  });
  it('marks a lost other replicant as lost, with the year (Medeiros)', () => {
    const v = at(2, 6);
    const m = routes(v, mapDate(v)).get('Medeiros')!;
    expect(m.end.status).toBe('lost');
    expect(m.end.year).toBeCloseTo(2144.708, 2);
    const st = otherStatus(v, 'Medeiros', mapDate(v));
    expect(st.status).toBe('lost');
    expect(st.year).toBeCloseTo(2144.708, 2);
  });
  it('never uses a record or a place past the reveal gate, and stepping back removes legs', () => {
    for (const ref of sweep) {
      const v = computeView(model, { book: ref.book.id, chapter: ref.chapter.n });
      const heading = rank({ book: ref.book.id, chapter: ref.chapter.n });
      const known = knownPlaces(v);
      const t = mapDate(v);
      for (const [who, r] of routes(v, t)) {
        const where = `B${ref.book.id} Ch ${ref.chapter.n}: ${who}`;
        if (r.made?.place) expect(known, where).toContain(r.made.place);
        const pool: MoveRecord[] = r.isOther ? v.otherMoves : v.info.get(who)!.moves;
        for (const l of r.legs) {
          if (l.from) expect(known, where).toContain(l.from);
          if (l.to) expect(known, where).toContain(l.to);
          expect(l.arrived!, where).toBeLessThanOrEqual(t + 0.011);
          const rec = pool.find((m) => m.kind === 'arrive' && Math.abs((m.year ?? revealYear(model, m.reveal) ?? 0) - l.arrived!) < 0.02);
          expect(rec, where).toBeDefined();
          expect(rank(rec!.reveal), where).toBeLessThanOrEqual(rec!.inferred ? heading : v.P);
        }
      }
    }
    const later = at(2, 34);
    const earlier = at(2, 6);
    const linus = (v: ProgressView) => routes(v, mapDate(v)).get('Linus')!.legs.map((l) => l.to);
    expect(linus(later)).toEqual(['Epsilon Indi', 'Epsilon Eridani']);
    expect(linus(earlier)).toEqual(['Epsilon Indi']);
  });
  it('lineage of Mulder at B2 ch 6: Bob (Sol → Epsilon Eridani), Bill (no legs), Mulder', () => {
    const l = lineage(v6, 'Mulder', mapDate(v6));
    expect(l.map((x) => x.who)).toEqual(['Bob', 'Bill', 'Mulder']);
    // Bob's legs stop where Bill was made: his later trip to Delta Eridani is not part of Mulder's story.
    expect(l[0].legs.map((x) => [x.from, x.to])).toEqual([['Sol', 'Epsilon Eridani']]);
    expect(l[1].legs).toEqual([]);
    expect(l[1].made?.place).toBe('Epsilon Eridani');
    expect(l[2].legs).toHaveLength(1);
  });
  it('lineage stops at a copy made somewhere his parent was not', () => {
    // Every chain step must have the parent at the child's creation place on that date.
    for (const ref of sweep) {
      const v = computeView(model, { book: ref.book.id, chapter: ref.chapter.n });
      for (const id of v.ids.slice(0, 40)) {
        const l = lineage(v, id, mapDate(v));
        for (let i = 1; i < l.length; i++) {
          const child = v.info.get(l[i].who)!;
          expect(child.bob.parent).toBe(l[i - 1].who);
          const last = l[i - 1].legs[l[i - 1].legs.length - 1];
          expect(last ? last.to : l[i - 1].made?.place).toBe(child.bob.where);
        }
      }
    }
  });
});

describe('voyage words', () => {
  const base: MapVoyage = { who: 'X', isOther: false, from: 'A', to: 'B', departed: 2160, departKnown: true, departInferred: false, arrives: null, fraction: null };
  it('spanText rounds down', () => {
    expect(spanText(0.05)).toBe('just left');
    expect(spanText(0.5)).toBe('6 months');
    expect(spanText(1 / 12 + 0.001)).toBe('1 month');
    expect(spanText(1.9)).toBe('1 yr');
    expect(spanText(14.99)).toBe('14 yrs');
  });
  it('voyageText is relative to the map date', () => {
    expect(voyageText(base, 2171.4)).toEqual({ out: 'en route for 11 yrs', toGo: null, about: false });
    expect(voyageText({ ...base, arrives: 2174.2 }, 2171.4).toGo).toBe('3 yrs to go');
    expect(voyageText({ ...base, arrives: 2171.9 }, 2171.4).toGo).toBe('under 1 yr to go');
    expect(voyageText({ ...base, departInferred: true }, 2171.4)).toMatchObject({ out: 'en route for about 11 yrs', about: true });
    expect(voyageText({ ...base, departKnown: false }, 2171.4).out).toBeNull();
    expect(voyageText({ ...base, departed: 2171.38 }, 2171.4).out).toBe('just left');
    expect(voyageText({ ...base, departed: 2171.0 }, 2171.4).out).toBe('en route for 4 months');
  });
  it('groups voyages on the same route that left within a year', () => {
    const g = groupVoyages([
      { ...base, who: 'a' },
      { ...base, who: 'b', departed: 2160.8 },
      { ...base, who: 'c', departed: 2163 },
      { ...base, who: 'd', to: 'C' },
    ]);
    expect(g.map((x) => x.members.map((m) => m.who))).toEqual([['a', 'b'], ['c'], ['d']]);
  });
  it('B2 ch 34: the 11 voyages become 5 groups; Sam, arriving later, gets his own', () => {
    const v = at(2, 34);
    const s = mapState(v, mapDate(v));
    expect(s.voyages).toHaveLength(11);
    const groups = groupVoyages(s.voyages);
    expect(groups.map((g) => g.members.map((m) => m.who).join(','))).toEqual([
      'Bashful,Dopey,Sleepy,Hungry',
      'Howard,Bert,Ernie',
      'Pete,Victor',
      'Marvin',
      'Sam',
    ]);
    for (const g of groups) for (const m of g.members) expect(m.arrives).toBe(g.arrives);
  });
  it('never groups a revealed arrival with an unrevealed one, or two different arrivals', () => {
    const g = groupVoyages([
      { ...base, who: 'a', arrives: 2170 },
      { ...base, who: 'b', arrives: null },
      { ...base, who: 'c', arrives: 2170.05 },
      { ...base, who: 'd', arrives: 2171 },
    ]);
    expect(g.map((x) => x.members.map((m) => m.who))).toEqual([['a', 'c'], ['b'], ['d']]);
    expect(g[1].arrives).toBeNull();
  });
  it('agoText', () => {
    expect(agoText(0.02)).toBe('just now');
    expect(agoText(0.5)).toBe('6 months ago');
    expect(agoText(14.2)).toBe('14 yrs ago');
  });
  it('B6 ch 16: a leg that left this month reads "just now"', () => {
    const v = at(6, 16);
    const t = mapDate(v);
    const last = routes(v, t).get('Calvin')!.legs.at(-1)!;
    expect(agoText(t - last.departed!)).toBe('just now');
  });
});

describe('pivotFit', () => {
  it('clamps a single place to the 8 ly minimum', () => {
    const p = { x: 1, y: 2, z: 0 };
    const f = pivotFit(p, [p], 400, 600, 0.96);
    expect(f.radiusPc * LY_PER_PC).toBeCloseTo(8 * 1.1, 4);
    expect(f.scale).toBeCloseTo((400 / 2 - 24) / f.radiusPc, 4);
  });
  it('reaches the 4th-nearest place, at least 25 ly, at most the furthest', () => {
    const ly = (x: number) => ({ x: x / LY_PER_PC, y: 0, z: 0 });
    const O = ly(0);
    expect(pivotFit(O, [ly(5), ly(10), ly(12)], 400, 600, 0.96).radiusPc * LY_PER_PC).toBeCloseTo(13.2, 4);
    expect(pivotFit(O, [ly(5), ly(10), ly(12), ly(40)], 400, 600, 0.96).radiusPc * LY_PER_PC).toBeCloseTo(44, 4);
    expect(pivotFit(O, [ly(5), ly(10), ly(12), ly(14), ly(60)], 400, 600, 0.96).radiusPc * LY_PER_PC).toBeCloseTo(27.5, 4);
  });
});

describe('mapSummary (header card)', () => {
  it('B2 ch 60: an active narrator with no recorded place is "unknown", not missing; the chapter names its system', () => {
    const v = at(2, 60);
    const s = mapSummary(v, mapState(v, mapDate(v)));
    expect(s.where).toBe('unknown');
    expect(v.chapter.system).toBe('Gamma Pavonis');
  });
  it('B2 ch 6: Mulder at Eta Cassiopeiae', () => {
    const v = at(2, 6);
    const st = mapState(v, mapDate(v));
    const s = mapSummary(v, st);
    expect(s).toMatchObject({ narrator: 'Mulder', where: 'place', place: 'Eta Cassiopeiae' });
    const here = st.places.find((p) => p.id === 'Eta Cassiopeiae')!;
    expect(s.here).toBe(here.bobs.length - 1 + here.others.length);
    expect(s.enRoute).toBe(st.voyages.length);
  });
  it('B1 ch 2: no systems named yet, narrator not a Bob', () => {
    const v = at(1, 2);
    const s = mapSummary(v, mapState(v, mapDate(v)));
    expect(s.where).toBe('none');
    expect(s.empty).toBe(true);
    expect(s.here + s.systems + s.enRoute).toBe(0);
  });
  it('counts only people the map state holds, for every 5th chapter', () => {
    for (const ref of sweep) {
      const v = computeView(model, { book: ref.book.id, chapter: ref.chapter.n });
      const st = mapState(v, mapDate(v));
      const s = mapSummary(v, st);
      const people = st.places.reduce((n, p) => n + p.bobs.length + p.others.length, 0) + st.voyages.length;
      expect(s.here + s.enRoute + (s.where === 'place' || s.where === 'transit' ? 1 : 0)).toBeLessThanOrEqual(people);
      expect(s.systems).toBeLessThanOrEqual(st.places.length);
    }
  });
});
