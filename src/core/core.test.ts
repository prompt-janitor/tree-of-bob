// Spoiler-gate tests against the real data file. Book 2 ch 7 (Riker, Jul 2171) is the
// reference position used in the design. A position is the chapter the reader is about to read: records
// are revealed up to the chapter before it, plus the chapter's own heading.
import { describe, expect, it } from 'vitest';
import app from '../../app.json';
import releases from '../data/releases.json';
import raw from '../data/tree-of-bob.json';
import {
  axisFor,
  buildLog,
  buildModel,
  chapterHeadingSpoken,
  chapterSpoken,
  computeView,
  DEFAULT_LAYERS,
  durationText,
  filterMapState,
  mapState,
  presenceText,
  readLayers,
  journey,
  knownPlaces,
  placesBySystem,
  settingLabels,
  positionsAt,
  search,
  stepProgress,
  treeRows,
  validateData,
  type TreeData,
  type TreeRow,
} from './index';

const data = raw as unknown as TreeData;

/** Tree rows split by section header: { 'In this chapter': [...ids], ... } (folded batches count their Bobs). */
function bySection(rows: TreeRow[]): Record<string, { id: string; dim: boolean }[]> {
  const out: Record<string, { id: string; dim: boolean }[]> = {};
  let cur = '';
  for (const r of rows) {
    if (r.kind === 'header') {
      if (!r.minor) cur = r.text;
      out[cur] ??= [];
    } else if (r.kind === 'bob') (out[cur] ??= []).push({ id: r.id, dim: r.ancestorOnly });
    else (out[cur] ??= []).push(...r.ids.map((id) => ({ id, dim: false })));
  }
  return out;
}
const model = buildModel(data);
const at = (book: number, chapter: number) => computeView(model, { book, chapter });

describe('data file', () => {
  it('validates without errors', () => {
    expect(validateData(data).errors).toEqual([]);
  });
});

describe('reveal gate at Book 2 ch 7', () => {
  const v = at(2, 7);
  it('shows exactly the Bobs revealed before this chapter', () => {
    expect(v.ids).toHaveLength(31);
    // Sam first appears in ch 7 itself, so he stays hidden until the reader moves on to ch 8.
    expect(v.ids).not.toContain('Sam');
    expect(at(2, 8).ids).toContain('Sam');
    expect(v.ids).not.toContain('Bashful');
  });
  it('knows NOW and the flashback', () => {
    expect(Math.floor(v.latest!)).toBe(2188);
    expect(Math.floor(v.chapter.flashbackYear!)).toBe(2171);
    expect(v.chapter.narrator).toBe('Riker');
    expect(v.chapter.system).toBe('Sol');
  });
  it('finds who was at Sol on the chapter date', () => {
    expect(v.chapter.here.sort()).toEqual(['Charles', 'Homer', 'Ralph']);
    expect(v.chapter.lostHere).toEqual(['Arthur']);
  });
  it('marks what was new in the chapter just finished', () => {
    const next = at(2, 8);
    expect(next.newHere.bobs).toEqual(['Sam']);
    expect(next.info.get('Sam')!.isNew).toBe(true);
  });
  it('assigns colours by the narrator rules', () => {
    expect(v.info.get('Riker')!.colourKey).toBe('Riker');
    expect(v.info.get('Howard')!.colourKey).toBe('Howard');
    expect(v.info.get('Charles')!.colourKey).toBe('Riker');
    expect(v.info.get('Hannibal')!.colourKey).toBe('Khan');
  });
  it('gives unique monograms', () => {
    const m = v.ids.map((id) => v.info.get(id)!.monogram);
    expect(new Set(m).size).toBe(m.length);
    expect(v.info.get('Homer')!.monogram).toBe('HO');
  });
  it('keeps the axis inside what has been read', () => {
    const axis = axisFor(v, 'all');
    expect(axis.x1).toBeLessThanOrEqual(v.latest! + 0.01);
  });
  it('places everyone at the latest date and at the chapter date', () => {
    const now = positionsAt(v, v.latest!);
    expect(now.lost).toHaveLength(9);
    const then = positionsAt(v, v.chapter.time!);
    expect(then.notYet).toContain('Khan');
    expect(then.systems[0].name).toBe('Sol');
  });
  it('reviews the chapter: the narrator, who else is in his system, then everyone else', () => {
    const sec = bySection(treeRows(v, new Set(), { kind: 'everyone' }));
    expect(Object.keys(sec)).toEqual(['In this chapter', 'Also in Sol', 'Everyone else']);
    // Each Bob comes with his parent, dimmed when the parent belongs to another section.
    expect(sec['In this chapter']).toEqual([{ id: 'Bob', dim: true }, { id: 'Riker', dim: false }]);
    expect(sec['Also in Sol'].filter((r) => !r.dim).map((r) => r.id).sort()).toEqual(['Charles', 'Homer', 'Ralph']);
    expect(sec['Also in Sol'].filter((r) => r.dim).map((r) => r.id)).toEqual(['Riker']);
    const all = new Set(Object.values(sec).flat().filter((r) => !r.dim).map((r) => r.id));
    expect(all.size).toBe(31);
  });
  it('gives each tree row the lines that join it to its parent', () => {
    const rows = treeRows(v, new Set(), { kind: 'everyone' }).flatMap((r) => (r.kind === 'bob' ? [r] : []));
    for (const r of rows) expect(r.rails).toHaveLength(Math.max(0, r.depth - 1));
    const riker = rows.find((r) => r.key === 'here:Riker')!;
    expect(riker.openBelow).toBe(true);
    const ralph = rows.find((r) => r.id === 'Ralph')!;
    expect(ralph.last).toBe(true);
  });
  it('filters the tree by system and keeps it connected', () => {
    const filtered = treeRows(v, new Set(), { kind: 'system', name: 'Sol' });
    const ids = filtered.flatMap((r) => (r.kind === 'bob' ? [r.id] : []));
    expect(ids).toEqual(expect.arrayContaining(['Bob', 'Riker', 'Homer', 'Charles', 'Ralph']));
    expect(ids).not.toContain('Bill');
  });
  it('names planets only from chapters read and moves revealed', () => {
    const places = placesBySystem(v);
    expect(places.get('Omicron² Eridani')).toEqual(['Vulcan']);
    expect(placesBySystem(at(2, 34)).get('Omicron² Eridani')).toEqual(['Vulcan', 'Romulus']);
    expect(placesBySystem(at(1, 1)).size).toBe(0);
  });
  it('searches only revealed names', () => {
    expect(search(v, 'ho').map((h) => (h.kind === 'bob' ? h.id : ''))).toEqual(expect.arrayContaining(['Homer', 'Howard']));
    expect(search(v, 'bashful')).toEqual([]);
  });
  it('builds a log with current-chapter events flagged', () => {
    const log = buildLog(v);
    expect(log.filter((e) => e.isCurrent).length).toBeGreaterThan(0);
    expect(log.every((e) => e.reveal.book * 10000 + e.reveal.chapter <= v.P)).toBe(true);
  });
});

describe('journey at Book 2 ch 7', () => {
  const v = at(2, 7);
  it('draws Riker as stations and a transit leg, with SCUT inside the Sol stay', () => {
    const j = journey(v, 'Riker');
    expect(j.map((x) => x.kind)).toEqual(['stay', 'transit', 'stay']);
    const [ee, leg, sol] = j;
    expect(ee.kind === 'stay' && ee.place).toBe('Epsilon Eridani');
    expect(leg.kind === 'transit' && leg.dest).toBe('Sol');
    if (sol.kind !== 'stay') throw new Error('expected a stay');
    expect(sol.ongoing).toBe(true);
    expect(Math.floor(sol.scut!.year)).toBe(2162);
    expect(sol.company.find((c) => c.id === 'Homer')!.whole).toBe(true);
    const arthur = sol.company.find((c) => c.id === 'Arthur')!;
    expect(arthur.whole).toBe(false);
    expect(Math.floor(arthur.to)).toBe(2166);
  });
  it('ends the line where a Bob is lost', () => {
    const j = journey(v, 'Arthur');
    expect(j[j.length - 1]).toMatchObject({ kind: 'end', status: 'lost' });
  });
  it('shows a Bob created on SCUT and still in transit', () => {
    const j = journey(at(2, 8), 'Sam');
    expect(j[0]).toMatchObject({ kind: 'stay', origin: true, scut: { how: 'born' } });
    expect(j[j.length - 1]).toMatchObject({ kind: 'transit', ongoing: true });
  });
  it('never goes past NOW or names an unrevealed Bob', () => {
    for (const id of v.ids) {
      for (const x of journey(v, id)) {
        if (x.kind === 'stay' || x.kind === 'transit') expect(x.to).toBeLessThanOrEqual(v.latest! + 0.01);
        if (x.kind === 'stay') for (const c of x.company) expect(v.ids).toContain(c.id);
      }
    }
    expect(journey(v, 'Bashful')).toEqual([]);
  });
});

describe('tree at Book 2 ch 32', () => {
  const v = at(2, 32);
  const rows = treeRows(v, new Set(), { kind: 'everyone' });
  const restAt = rows.findIndex((r) => r.kind === 'header' && r.text === 'Everyone else');
  it('keeps "In this chapter" to the narrator, and puts the rest of his system and the cast there next', () => {
    const sec = bySection(rows);
    expect(sec['In this chapter'].filter((r) => !r.dim).map((r) => r.id)).toEqual(['Bill']);
    const here = sec['Also in Epsilon Eridani'];
    const calling = v.chapter.cast.filter((c) => c.remote).map((c) => c.id);
    const present = v.chapter.cast.filter((c) => !c.remote && !c.isOther).map((c) => c.id);
    const expected = [...new Set([...v.chapter.here, ...present])].filter((id) => !calling.includes(id));
    expect(here.filter((r) => !r.dim).map((r) => r.id).sort()).toEqual(expected.sort());
    expect(here.map((r) => r.id).includes('Linus')).toBe(present.includes('Linus'));
  });
  it('folds a batch of copies made together into one row, and opens it on request', () => {
    const group = rows.slice(0, restAt).find((r) => r.kind === 'group');
    if (!group || group.kind !== 'group') throw new Error('expected a folded batch');
    expect(group.ids).toHaveLength(8);
    expect(group.parent).toBe('Bill');
    const open = treeRows(v, new Set([group.key]), { kind: 'everyone' });
    const openIds = open.flatMap((r) => (r.kind === 'bob' ? [r.id] : []));
    for (const id of group.ids) expect(openIds).toContain(id);
  });
  it('keeps everyone else unfolded, and collapses one section without the other', () => {
    expect(rows.slice(restAt).some((r) => r.kind === 'group')).toBe(false);
    const collapsed = treeRows(v, new Set(['rest:Bill']), { kind: 'everyone' });
    const bill = collapsed.filter((r) => r.kind === 'bob' && r.id === 'Bill');
    expect(bill.map((r) => (r.kind === 'bob' ? r.hidden > 0 : null))).toEqual([false, false, true]);
  });
});

describe('chapter headings place the narrator', () => {
  it('puts Riker and Homer at Sol when starting B1 ch 21, before their arrival record is revealed', () => {
    const v = at(1, 21);
    expect(v.chapter.narrator).toBe('Riker');
    expect(v.info.get('Riker')!.now).toBe('Sol');
    // Homer left Epsilon Eridani with Riker (revealed in ch 20), so he arrives with him.
    expect(v.chapter.here).toEqual(['Homer']);
    const sec = bySection(treeRows(v, new Set(), { kind: 'everyone' }));
    expect(Object.keys(sec)).toEqual(['In this chapter', 'Also in Sol', 'Everyone else']);
  });
  it('keeps inferred arrivals out of the Log', () => {
    const v = at(1, 21);
    expect(v.moves.some((m) => m.inferred)).toBe(false);
    expect(buildLog(v).some((e) => e.kind === 'travel' && e.reveal.chapter === 21 && e.reveal.book === 1)).toBe(false);
  });
  it('brings companions on the same journey: Goku with Calvin at B1 ch 28', () => {
    expect(at(1, 28).chapter.here).toContain('Goku');
  });
  it('leaves narrators following another system over SCUT where they are', () => {
    const v = at(2, 72);
    expect(v.chapter.narrator).toBe('Bill');
    expect(v.info.get('Bill')!.loc).toBe('Epsilon Eridani');
  });
});

describe('journey company', () => {
  const v = at(1, 21);
  const j = journey(v, 'Riker');
  it('tells his own copy from Bobs who were already there or made by others', () => {
    const ee = j[0];
    if (ee.kind !== 'stay') throw new Error('expected a stay');
    const came = Object.fromEntries(ee.company.map((c) => [c.id, c.came]));
    // Bob made Riker together with Bill, Mario and Milo.
    expect(came).toMatchObject({ Bob: 'parent', Bill: 'sibling', Mario: 'sibling', Milo: 'sibling', Homer: 'copy', Garfield: 'made' });
    expect(ee.company.find((c) => c.id === 'Bob')!.went).toBe('left');
  });
  it('carries the travelling party through the journey into the next station', () => {
    const leg = j[1];
    expect(leg).toMatchObject({ kind: 'transit', dest: 'Sol', company: ['Homer'] });
    const sol = j[2];
    if (sol.kind !== 'stay') throw new Error('expected a stay');
    // Arriving on the chapter date (NOW) is a stay of no length; Homer is still with him.
    expect(sol.company.map((c) => [c.id, c.came])).toEqual([['Homer', 'with']]);
  });
});

describe('chapter settings from headings', () => {
  it('treats "Approaching X" as a chapter set in X', () => {
    const v = at(3, 70);
    expect(v.chapter.setting).toBe('approach');
    expect(v.info.get(v.chapter.narrator!)!.loc).toBe('Gliese 877');
    expect(settingLabels(v).others).toBe('Approaching Gliese 877');
    expect(v.chapter.here.length).toBeGreaterThan(0);
  });
  it('keeps "En route to X" in transit, with X as the destination', () => {
    const v = at(2, 54);
    expect(v.chapter.setting).toBe('enroute');
    expect(v.info.get('Hal')!.inTransit?.to).toBe('Gliese 54');
    expect(v.info.get('Hal')!.moves.some((m) => m.inferred && m.kind === 'arrive')).toBe(false);
    expect(Object.keys(bySection(treeRows(v, new Set(), { kind: 'everyone' })))).toContain('Destination: Gliese 54');
  });
  it('lists who travels with the narrator in interstellar space', () => {
    const v = at(3, 43);
    expect(v.chapter.setting).toBe('deep');
    expect(v.chapter.travelling).toEqual(['Daedalus']);
    expect(Object.keys(bySection(treeRows(v, new Set(), { kind: 'everyone' }))).filter((k) => k !== 'Calling in')).toEqual(['In this chapter', 'Travelling with Icarus', 'Everyone else']);
  });
  it('never titles a tree section from a missing system', () => {
    for (const ref of model.chapters) {
      const rows = treeRows(computeView(model, { book: ref.book.id, chapter: ref.chapter.n }), new Set(), { kind: 'everyone' });
      for (const r of rows) if (r.kind === 'header') expect(r.text, `B${ref.book.id} Ch ${ref.chapter.n}`).not.toMatch(/null|undefined/);
    }
  });
  it('moves a narrator into transit when the heading is a voyage and his records lag', () => {
    const v = at(1, 13);
    expect(v.chapter.setting).toBe('enroute');
    expect(v.info.get('Bob')!.inTransit?.to).toBe('Epsilon Eridani');
  });
});

describe('format', () => {
  it('rounds durations to months or years', () => {
    expect(durationText(0.02)).toBeNull();
    expect(durationText(0.4)).toBe('~5 months');
    expect(durationText(1.2)).toBe('~1 year');
    expect(durationText(31.6)).toBe('~32 years');
  });
  it('speaks chapter labels in full, including Book 4 parts', () => {
    expect(chapterSpoken({ n: 34 })).toBe('Chapter 34');
    expect(chapterSpoken({ n: 40, label: 'Part 2 · Ch 7' })).toBe('Part 2, Chapter 7');
    const b = { id: 2, title: 'x', chapters: [] };
    expect(chapterHeadingSpoken(b, { n: 34, pov: 'Bill' })).toBe('Book 2, Chapter 34, narrated by Bill');
    expect(chapterHeadingSpoken(b, { n: 34 })).toBe('Book 2, Chapter 34');
  });
});

describe('chapter titles', () => {
  it('ships no chapter titles in the data file', () => {
    for (const b of data.books) for (const c of b.chapters) expect(c).not.toHaveProperty('title');
  });
  it('rejects a chapter title in the validator', () => {
    const bad = structuredClone(data);
    (bad.books[0].chapters[0] as unknown as Record<string, unknown>).title = 'Anything';
    expect(validateData(bad).errors.some((e) => /must not carry a "title"/.test(e))).toBe(true);
  });
});

describe('progress', () => {
  it('steps across book boundaries', () => {
    const last = model.chapters.filter((c) => c.book.id === 1).length;
    expect(stepProgress(model, { book: 1, chapter: last }, 1)).toEqual({ book: 2, chapter: 1 });
    expect(stepProgress(model, { book: 2, chapter: 1 }, -1)).toEqual({ book: 1, chapter: last });
  });
  it('steps past the last chapter to finished, and back', () => {
    const lastRef = model.chapters[model.chapters.length - 1];
    const last = { book: lastRef.book.id, chapter: lastRef.chapter.n };
    const done = stepProgress(model, last, 1);
    expect(done).toEqual({ ...last, finished: true });
    expect(stepProgress(model, done, 1)).toEqual(done);
    expect(stepProgress(model, done, -1)).toEqual(last);
  });
  it('reveals nothing from the chapter about to be read', () => {
    for (let i = 0; i < model.chapters.length; i += 5) {
      const c = model.chapters[i];
      const v = computeView(model, { book: c.book.id, chapter: c.chapter.n });
      const here = c.book.id * 10000 + c.chapter.n;
      for (const id of v.ids) expect(v.info.get(id)!.bob.reveal.book * 10000 + v.info.get(id)!.bob.reveal.chapter).toBeLessThan(here);
      for (const m of v.moves) expect(m.reveal.book * 10000 + m.reveal.chapter).toBeLessThan(here);
    }
  });
  it('only adds information going forward', () => {
    for (let i = 1; i < model.chapters.length; i += 7) {
      const a = model.chapters[i - 1], b = model.chapters[i];
      const va = computeView(model, { book: a.book.id, chapter: a.chapter.n });
      const vb = computeView(model, { book: b.book.id, chapter: b.chapter.n });
      for (const id of va.ids) expect(vb.ids).toContain(id);
    }
  });
});

describe('scale', () => {
  it('handles the start and the end of the series', () => {
    const first = at(1, 1);
    expect(first.ids.length).toBeLessThanOrEqual(1);
    const lastRef = model.chapters[model.chapters.length - 1];
    const end = computeView(model, { book: lastRef.book.id, chapter: lastRef.chapter.n, finished: true });
    expect(end.finished).toBe(true);
    expect(end.ids.length).toBe(data.bobs.length);
    expect(treeRows(end, new Set(), { kind: 'everyone' }).length).toBeGreaterThan(0);
  });
});

describe('journey hops and other replicants', () => {
  it('draws a wormhole hop as an instant row between stations', () => {
    // The hop to the Central Antimatter Works is revealed in B5 ch 60, so it shows once the reader reaches ch 61.
    const v = at(5, 61);
    const j = journey(v, 'Icarus');
    const hops = j.filter((x) => x.kind === 'hop');
    expect(hops.map((h) => h.kind === 'hop' && h.to)).toEqual(['Centaurvania', 'Roanoke', 'Central Antimatter Works (7 ly from Sagittarius A*)']);
    const k = j.findIndex((x) => x.kind === 'hop' && x.to === 'Roanoke');
    expect(j[k]).toMatchObject({ kind: 'hop', from: 'Centaurvania', via: 'wormhole', company: ['Daedalus'] });
    expect(j[k - 1]).toMatchObject({ kind: 'stay', place: 'Centaurvania' });
    expect(j[k + 1]).toMatchObject({ kind: 'stay', place: 'Roanoke' });
    // Not a years-long voyage: no transit leg leads into a wormhole arrival.
    expect(j.some((x) => x.kind === 'transit' && x.dest === 'Roanoke')).toBe(false);
    const roanoke = j[k + 1];
    if (roanoke.kind !== 'stay') throw new Error('expected a stay');
    expect(roanoke.company.find((c) => c.id === 'Daedalus')!.came).toBe('with');
  });
  it('keeps a hop hidden until its record is revealed', () => {
    const j = journey(at(5, 60), 'Icarus');
    expect(j.some((x) => x.kind === 'hop' && x.to?.startsWith('Central Antimatter Works'))).toBe(false);
  });
  it('shows a transmitted matrix as a hop', () => {
    const j = journey(at(4, 40), 'Hugh');
    expect(j.find((x) => x.kind === 'hop')).toMatchObject({ via: 'transmitted', to: 'Eta Leporis' });
  });
  it('lists another replicant in company, flagged and kept apart from the Bobs', () => {
    const v = at(2, 33);
    const j = journey(v, 'Linus');
    const ee = j[j.length - 1];
    if (ee.kind !== 'stay') throw new Error('expected a stay');
    expect(ee.place).toBe('Epsilon Eridani');
    expect(ee.others.find((c) => c.id === 'Henry Roberts')).toMatchObject({ isOther: true, came: 'with' });
    expect(ee.company.every((c) => !c.isOther && v.ids.includes(c.id))).toBe(true);
    const indi = j.find((x) => x.kind === 'stay' && x.place === 'Epsilon Indi');
    expect(indi && indi.kind === 'stay' && indi.others.map((c) => c.id)).toContain('Henry Roberts');
  });
  it('uses only revealed other replicants', () => {
    const v = at(1, 20);
    const shown = new Set(v.others.map((o) => o.id));
    for (const id of v.ids) {
      for (const x of journey(v, id)) {
        if (x.kind === 'stay') for (const c of x.others) expect(shown.has(c.id)).toBe(true);
        if (x.kind === 'transit' || x.kind === 'hop') for (const o of x.others) expect(shown.has(o)).toBe(true);
      }
    }
    // Henry Roberts is revealed in B1 ch 40.
    expect(journey(v, 'Linus').some((x) => x.kind === 'stay' && x.others.some((c) => c.id === 'Henry Roberts'))).toBe(false);
  });
});

describe('other replicants\' fates in journeys', () => {
  it('ends another replicant\'s stay at his revealed loss', () => {
    const v = computeView(model, { book: 2, chapter: 34 });
    const lost = v.otherFates.find((f) => f.bob === 'Medeiros' && f.status !== 'alive')!.year!;
    for (const id of ['Bill', 'Bob']) {
      for (const it of journey(v, id)) {
        if (it.kind !== 'stay' || it.place !== 'Epsilon Eridani') continue;
        for (const c of it.others.filter((o) => o.id === 'Medeiros')) {
          expect(c.to).toBeLessThanOrEqual(lost + 0.01);
          if (c.to < it.to - 0.01) expect(c.went).toBe('lost');
        }
        if (it.from > lost + 0.01) expect(it.others.some((o) => o.id === 'Medeiros')).toBe(false);
      }
    }
    // Bob met him there, and he was lost there.
    const first = journey(v, 'Bob').find((x) => x.kind === 'stay' && x.place === 'Epsilon Eridani');
    expect(first?.kind === 'stay' && first.others.find((o) => o.id === 'Medeiros')?.went).toBe('lost');
  });
});

describe('place names', () => {
  it('names no wormhole before a chapter heading does, or a chapter set there is read', () => {
    const first = model.chapters.findIndex((r) => /wormhole/i.test(`${r.chapter.place ?? ''} ${r.chapter.system ?? ''}`));
    expect(first).toBeGreaterThan(0);
    const last = /wormhole/i.test(model.chapters[first].chapter.place ?? '') ? first - 1 : first;
    for (let i = 0; i <= last; i++) {
      const r = model.chapters[i];
      const v = computeView(model, { book: r.book.id, chapter: r.chapter.n });
      for (const p of knownPlaces(v)) expect(p).not.toMatch(/wormhole/i);
    }
  });
  it('sets the Alien System chapters at the Alien System', () => {
    for (const n of [5, 8, 12]) expect(computeView(model, { book: 5, chapter: n }).chapter.setting).toBe('system');
  });
});

describe('map layers', () => {
  const model = buildModel(data);
  const sweep = model.chapters.filter((_, i) => i % 7 === 0);
  it('only ever removes: every place, person and journey kept is in the full map state', () => {
    const all = { bobs: 'show', others: 'show', journeys: 'show', history: 'show', names: 'show', empty: 'show', presence: 'show', scut: 'show' } as const;
    const variants = [DEFAULT_LAYERS, all, { ...all, empty: 'hide', others: 'hide', journeys: 'hide', presence: 'hide' } as const];
    for (const ref of sweep) {
      const v = computeView(model, { book: ref.book.id, chapter: ref.chapter.n });
      const full = mapState(v, v.chapter.time ?? v.latest ?? v.maxYear);
      const byId = new Map(full.places.map((p) => [p.id, p]));
      for (const layers of variants) {
        const f = filterMapState(v, full, layers);
        for (const p of f.places) {
          const q = byId.get(p.id);
          expect(q, p.id).toBeTruthy();
          for (const id of p.bobs) expect(q!.bobs).toContain(id);
          for (const id of p.others) expect(q!.others).toContain(id);
        }
        for (const vo of f.voyages) expect(full.voyages).toContain(vo);
      }
    }
  });
  it('keeps the narrator and where the chapter is set with the default layers', () => {
    for (const ref of sweep) {
      const v = computeView(model, { book: ref.book.id, chapter: ref.chapter.n });
      const full = mapState(v, v.chapter.time ?? v.latest ?? v.maxYear);
      const f = filterMapState(v, full, DEFAULT_LAYERS);
      if (full.focus) expect(f.places.map((p) => p.id)).toContain(full.focus);
      const n = v.chapter.narrator;
      const where = (st: typeof full) => st.places.some((p) => p.bobs.includes(n ?? '')) || st.voyages.some((x) => x.who === n);
      if (n && where(full)) expect(where(f)).toBe(true);
    }
  });
  it('hides other replicants and journeys when their layers are off', () => {
    for (const ref of sweep) {
      const v = computeView(model, { book: ref.book.id, chapter: ref.chapter.n });
      const f = filterMapState(v, mapState(v, v.chapter.time ?? v.latest ?? v.maxYear), { ...DEFAULT_LAYERS, bobs: 'show', others: 'hide', journeys: 'hide' });
      expect(f.voyages).toEqual([]);
      for (const p of f.places) expect(p.others).toEqual([]);
    }
  });
  it('reads older saved settings as the defaults', () => {
    expect(readLayers({ chapterOnly: true, history: false })).toEqual(DEFAULT_LAYERS);
    expect(readLayers({ ...DEFAULT_LAYERS, empty: 'show' }).empty).toBe('show');
    expect(readLayers(null)).toEqual(DEFAULT_LAYERS);
  });
});

describe('colonies and territory', () => {
  const sys = data.systems!.find((s) => s.kind === 'star' && s.id !== 'Sol')!.id;
  const test: TreeData = {
    ...data,
    groups: [{ id: 'test-group', label: 'Test group', human: true, reveal: { book: 2, chapter: 10 }, sources: ['test'], confidence: 'high' }],
    presence: [
      { system: sys, group: 'test-group', kind: 'colony', label: 'Test colony', year: null, reveal: { book: 2, chapter: 12 }, ended: { year: null, reveal: { book: 2, chapter: 30 } }, sources: ['test'], confidence: 'high' },
    ],
  };
  const model = buildModel(test);
  const at = (book: number, chapter: number) => {
    const v = computeView(model, { book, chapter });
    return mapState(v, v.chapter.time ?? v.latest ?? v.maxYear).places.find((p) => p.id === sys)?.presence ?? [];
  };
  it('validates', () => {
    expect(validateData(test).errors).toEqual([]);
  });
  it('appears only after the chapter that reveals it has been read', () => {
    expect(at(2, 12)).toEqual([]);
    expect(at(2, 13).map((p) => p.name)).toEqual(['Test colony']);
  });
  it('disappears once its end is revealed', () => {
    expect(at(2, 29).length).toBe(1);
    expect(at(2, 31)).toEqual([]);
  });
  it('rejects presence at an unknown system or for an unknown group', () => {
    const bad: TreeData = { ...test, presence: [{ ...test.presence![0], system: 'Nowhere', group: 'nobody' }] };
    expect(validateData(bad).errors.join(' ')).toMatch(/unknown group/);
    expect(validateData(bad).errors.join(' ')).toMatch(/unknown system/);
  });
});

describe('colony labels', () => {
  const base = { group: 'g', groupLabel: 'Group', human: true, kind: 'home' as const };
  it('names the world, then the group and the kind', () => {
    expect(presenceText({ ...base, groupShort: 'Human', name: 'Earth' })).toBe('Earth · Human home');
    expect(presenceText({ ...base, groupShort: 'Others', kind: 'outpost', name: null })).toBe('Others outpost');
    expect(presenceText({ ...base, groupShort: 'Quinlan', name: 'Quinlan' })).toBe('Quinlan home');
  });
  it('has at most one home system per system and per group in the data', () => {
    const homes = (data.presence ?? []).filter((p) => p.kind === 'home');
    expect(new Set(homes.map((p) => p.system)).size).toBe(homes.length);
    expect(new Set(homes.map((p) => p.group)).size).toBe(homes.length);
  });
});

describe('release notes', () => {
  it('have an entry for the current version, newest first, each with a note', () => {
    expect(releases[0].version).toBe(app.expo.version);
    for (const r of releases) expect(r.notes.length).toBeGreaterThan(0);
  });
});

describe('calling in', () => {
  const src = { confidence: 'high' as const, sources: ['test'] };
  const r = (chapter: number) => ({ book: 1, chapter });
  const fixture: TreeData = {
    settings: { root: 'Bob' },
    books: [{
      id: 1, title: 'Test', chapters: [
        { n: 1, pov: 'Bob', place: 'Sol', year: 2100 },
        { n: 2, pov: 'Bob', place: 'Epsilon Eridani', system: 'Epsilon Eridani', narratorFrom: 'Sol', narratorVia: 'vr', year: 2101,
          cast: [{ id: 'Riker', from: 'Sol', via: 'vr' }, { id: 'Bill', from: 'Epsilon Eridani', via: 'present' }, { id: 'Mulder', from: 'Sol', via: 'comms' }] },
        { n: 3, pov: 'Riker', place: 'Sol', year: 2102 },
        { n: 4, pov: 'Bob', place: 'Epsilon Eridani', narratorFrom: 'Delta Pavonis', year: 2103 },
        { n: 5, pov: 'Bob', place: 'Epsilon Eridani', year: 2104 },
        { n: 6, pov: 'Homer', place: 'Sol', narratorFrom: 'Epsilon Eridani', year: 2105 },
        { n: 7, pov: 'Bob', place: 'Vulcan', system: 'Epsilon Eridani', narratorFrom: null, year: 2106 },
      ],
    }],
    bobs: [
      { id: 'Bob', parent: null, born: 2099, where: 'Sol', reveal: r(1), ...src },
      { id: 'Riker', parent: 'Bob', born: 2099, where: 'Sol', reveal: r(1), ...src },
      { id: 'Homer', parent: 'Bob', born: 2099, where: 'Sol', reveal: r(1), ...src },
      { id: 'Bill', parent: 'Bob', born: 2099, where: 'Epsilon Eridani', reveal: r(1), ...src },
      { id: 'Mulder', parent: 'Bill', born: 2099, where: 'Sol', reveal: r(5), ...src },
    ],
    moves: [{ bob: 'Homer', kind: 'depart', year: 2100.5, from: 'Sol', to: 'Epsilon Eridani', reveal: r(1), ...src }],
    fates: [],
    systems: [
      { id: 'Sol', kind: 'star', pos: { x: 0, y: 0, z: 0 }, ...src },
      { id: 'Epsilon Eridani', kind: 'star', pos: { x: 1.9, y: 2.5, z: -0.6 }, ...src },
      { id: 'Delta Pavonis', kind: 'star', pos: { x: 1.1, y: -2.5, z: -5.1 }, ...src },
    ],
  };
  const m = buildModel(fixture);
  const v = (chapter: number, finished = false) => computeView(m, { book: 1, chapter, finished });

  it('validates the new fields, warning about a cast member met later', () => {
    const res = validateData(fixture);
    expect(res.errors).toEqual([]);
    expect(res.warnings.some((w) => w.includes('Mulder') && w.includes('before he is revealed'))).toBe(true);
    const bad = validateData({ ...fixture, books: [{ ...fixture.books[0], chapters: [{ n: 1, system: 'Nowhere', narratorVia: 'tv' as never, cast: [{ id: 'Nobody', via: 'mail' as never }] }] }] });
    expect(bad.errors.filter((e) => e.startsWith('Book 1 ch 1')).length).toBe(4);
  });

  it('shows where (a place already met) and how the narrator calls in, from the chapter data, before it is read', () => {
    expect(v(2).chapter.remote).toEqual({ from: 'Sol', via: 'vr' });
    expect(v(2).chapter.system).toBe('Epsilon Eridani');
    // Delta Pavonis is not a place the reader has met yet: not named.
    expect(v(4).chapter.remote).toEqual({ from: null, via: null });
  });

  it('calls in from a voyage when the map has the caller on his way, and not when his position is unknown', () => {
    const withCast = (moves: TreeData['moves']): TreeData => ({
      ...fixture,
      moves,
      books: [{ ...fixture.books[0], chapters: fixture.books[0].chapters.map((c) => (c.n === 2 ? { ...c, cast: [{ id: 'Homer', from: null, via: 'vr' as const }] } : c)) }],
    });
    const arrive = { bob: 'Homer', kind: 'arrive' as const, year: 2110, from: 'Sol', to: 'Epsilon Eridani', reveal: r(1), ...src };
    const known = computeView(buildModel(withCast([...fixture.moves, arrive])), { book: 1, chapter: 2 });
    expect(mapState(known, known.chapter.time!).calls.filter((c) => !c.pov)).toEqual([{ who: 'Homer', isOther: false, from: null, to: 'Epsilon Eridani', pov: false, via: 'vr' }]);
    const unknown = computeView(buildModel(withCast(fixture.moves)), { book: 1, chapter: 2 });
    expect(mapState(unknown, unknown.chapter.time!).calls.filter((c) => !c.pov)).toEqual([]);
  });

  it('estimates where a caller with no revealed arrival is from the usual speed, and calls in from there', () => {
    // Mulder (revealed at ch 5) made a revealed trip; Homer is on his way with no arrival.
    const trip = [
      { bob: 'Riker', kind: 'depart' as const, year: 2099.1, from: 'Sol', to: 'Delta Pavonis', reveal: r(1), ...src },
      { bob: 'Riker', kind: 'arrive' as const, year: 2099.6, from: 'Sol', to: 'Delta Pavonis', reveal: r(1), ...src },
      { bob: 'Riker', kind: 'depart' as const, year: 2099.7, from: 'Delta Pavonis', to: 'Sol', reveal: r(1), ...src },
      { bob: 'Riker', kind: 'arrive' as const, year: 2100.2, from: 'Delta Pavonis', to: 'Sol', reveal: r(1), ...src },
    ];
    const f2: TreeData = {
      ...fixture,
      moves: [...fixture.moves, ...trip],
      books: [{ ...fixture.books[0], chapters: fixture.books[0].chapters.map((c) => (c.n === 2 ? { ...c, cast: [{ id: 'Homer', from: null, via: 'vr' as const }] } : c)) }],
    };
    const v2 = computeView(buildModel(f2), { book: 1, chapter: 2 });
    const st = mapState(v2, v2.chapter.time!);
    const homer = st.voyages.find((x) => x.who === 'Homer')!;
    expect(homer.fraction).toBeNull();
    expect(homer.estimate).toBeGreaterThan(0.03);
    expect(homer.estimate).toBeLessThanOrEqual(0.97);
    expect(st.calls.some((c) => c.who === 'Homer' && c.from === null)).toBe(true);
  });

  it('counts a place at zero distance from the chapter\'s star as being there', () => {
    const f2: TreeData = {
      ...fixture,
      systems: [...fixture.systems!, { id: 'Ring', kind: 'near', near: 'Epsilon Eridani', offsetLy: 0, pos: null, ...src }],
      books: [{ ...fixture.books[0], chapters: fixture.books[0].chapters.map((c) => (c.n === 2 ? { ...c, narratorFrom: 'Ring', narratorVia: null, cast: [{ id: 'Riker', from: 'Ring' }, { id: 'Bill', from: 'Ring', via: 'android' as const }] } : c)) }],
    };
    const v2 = computeView(buildModel(f2), { book: 1, chapter: 2 });
    expect(v2.chapter.remote).toBeNull();
    expect(v2.chapter.cast).toEqual([
      { id: 'Riker', isOther: false, from: null, via: null, remote: false },
      { id: 'Bill', isOther: false, from: null, via: 'android', remote: true },
    ]);
  });

  it('falls back to his records when the data does not say, and to none when it says he is there', () => {
    expect(v(5).chapter.remote).toEqual({ from: 'Sol', via: null });
    const last = v(7, true);
    expect(last.chapter.system).toBe('Epsilon Eridani');
    expect(last.chapter.remote).toBeNull();
  });

  it('never infers a move from an unread chapter\'s calling-in data; once read, only to a destination already known', () => {
    expect(v(6).chapter.remote).toEqual({ from: 'Epsilon Eridani', via: null });
    expect(v(6).info.get('Homer')!.now).toBe('In transit');
    expect(v(7).info.get('Homer')!.now).toBe('Epsilon Eridani');
  });

  it('treats calling in from an unnamed place as remote, with no line and no inferred move', () => {
    const f2: TreeData = {
      ...fixture,
      books: [{ ...fixture.books[0], chapters: fixture.books[0].chapters.map((c) => (c.n === 6 || c.n === 7 ? { ...c, narratorFrom: null, narratorVia: 'vr' as const } : c)) }],
    };
    const m2 = buildModel(f2);
    const v7 = computeView(m2, { book: 1, chapter: 7 });
    expect(v7.info.get('Homer')!.now).toBe('In transit');
    expect(v7.chapter.remote).toEqual({ from: null, via: 'vr' });
    expect(mapState(v7, v7.chapter.time!).calls).toEqual([]);
  });

  it('sets an unread chapter by its heading alone, and by its data once read', () => {
    const f2: TreeData = { ...fixture, books: [{ ...fixture.books[0], chapters: fixture.books[0].chapters.map((c) => (c.n === 3 ? { ...c, system: 'Delta Pavonis' } : c)) }] };
    const m2 = buildModel(f2);
    const before = computeView(m2, { book: 1, chapter: 3 });
    expect(before.chapter.system).toBe('Sol');
    expect(knownPlaces(before).has('Delta Pavonis')).toBe(false);
    expect(mapState(before, before.chapter.time!).calls.some((c) => c.to === 'Delta Pavonis' || c.from === 'Delta Pavonis')).toBe(false);
    expect(knownPlaces(computeView(m2, { book: 1, chapter: 4 })).has('Delta Pavonis')).toBe(true);
  });

  it('lists the current chapter\'s cast, only people already met', () => {
    expect(v(2).chapter.cast).toEqual([
      { id: 'Riker', isOther: false, from: 'Sol', via: 'vr', remote: true },
      { id: 'Bill', isOther: false, from: null, via: 'present', remote: false },
    ]);
    expect(v(3).chapter.cast).toEqual([]);
  });

  it('draws the narrator\'s and the cast\'s links, keeps both ends under the default layers, and hides callers with the Bobs layer', () => {
    const view = v(2);
    const state = mapState(view, view.chapter.time!);
    expect(state.calls).toEqual([
      { who: 'Bob', isOther: false, from: 'Sol', to: 'Epsilon Eridani', pov: true, via: 'vr' },
      { who: 'Riker', isOther: false, from: 'Sol', to: 'Epsilon Eridani', pov: false, via: 'vr' },
    ]);
    const shown = filterMapState(view, state, { ...DEFAULT_LAYERS, empty: 'hide' });
    expect(shown.calls.length).toBe(2);
    expect(shown.places.map((p) => p.id).sort()).toEqual(['Epsilon Eridani', 'Sol']);
    expect(filterMapState(view, state, { ...DEFAULT_LAYERS, bobs: 'hide' }).calls).toEqual([]);
  });
});
