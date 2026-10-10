// Map scene tests against the real data file: where callouts and the pivot point, and the labels that say how people
// got where they are.
import { describe, expect, it } from 'vitest';

import raw from '@/data/tree-of-bob.json';
import { buildModel, computeView, LY_PER_PC, mapState, type ProgressView, type TreeData } from '@/core';
import type { Palette } from '@/theme/tokens';

import { buildScene, lyLabel, scaleBarFor, viewportDiameter } from './scene';

const palette = { bg: '#fff', ink: '#000', ink2: '#444', ink3: '#888', line: '#ccc', scheme: 'light' } as unknown as Palette;
const model = buildModel(raw as unknown as TreeData);
const at = (book: number, chapter: number) => computeView(model, { book, chapter });
const scene = (v: ProgressView, level: 'local' | 'galaxy' = 'local') =>
  buildScene({ view: v, state: mapState(v, v.chapter.time ?? v.latest ?? v.maxYear), level, selectedBob: null, callout: null, colourOf: () => '#888888', palette });

describe('buildScene', () => {
  it('B5 ch 16: the narrator on a voyage with no position is anchored where his puck is', () => {
    const s = scene(at(5, 16));
    const v = s.voyages.find((x) => x.puck)!;
    expect(v.fraction).toBeNull();
    expect(s.voyageAnchor[v.key]).toEqual(s.pivot);
    expect(s.whereNow[at(5, 16).chapter.narrator!]).toEqual(s.puck!.p);
  });
  it('B2 ch 6: no "came from here" label line (the faint history line carries it)', () => {
    const s = scene(at(2, 6));
    for (const l of s.labels) for (const y of l.lines) expect(y.text).not.toMatch(/came from here/);
  });
  it('B2 ch 34: names on, each person under a place is a run with his colour dot (another replicant: null), the narrator keeps POV', () => {
    const v = at(2, 34);
    const st = mapState(v, v.chapter.time!);
    const colourOf = (id: string) => (id === v.chapter.narrator ? '#ff0000' : '#00ff00');
    const s = buildScene({ view: v, state: st, level: 'local', selectedBob: null, callout: null, colourOf, palette });
    const runs = s.labels.flatMap((l) => l.lines.flatMap((y) => y.runs ?? []));
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) {
      if (r.id == null) expect(r.text).toMatch(/^\+\d+$/);
      else if (v.info.has(r.id)) expect(r.mark).toBe(r.id === v.chapter.narrator ? '#ff0000' : '#00ff00');
      else expect(r.mark).toBeNull();
    }
    expect(runs.some((r) => r.id === v.chapter.narrator && r.text === `${v.chapter.narrator} POV`)).toBe(true);
    for (const n of s.nodes) if (!n.cluster && n.count > 0) expect(n.namesInLabel).toBe(true);
  });
  it('B2 ch 34: names off, no names line and no runs; the pip rows stay', () => {
    const v = at(2, 34);
    const s = buildScene({ view: v, state: mapState(v, v.chapter.time!), level: 'local', selectedBob: null, callout: null, colourOf: () => '#888888', palette, names: 'hide' });
    expect(s.labels.some((l) => l.lines.some((y) => y.runs))).toBe(false);
    expect(s.nodes.some((n) => n.namesInLabel)).toBe(false);
    expect(s.nodes.some((n) => n.pips.length > 0)).toBe(true);
  });
  it('B6 ch 16: no "just left ago"; a voyage under way reads "en route for"', () => {
    const s = scene(at(6, 16));
    for (const l of s.labels) for (const y of l.lines) {
      expect(y.text).not.toMatch(/just left ago/);
      expect(y.text).not.toMatch(/en route \d/);
    }
  });
  it('B2 ch 34: every voyage group has a label with a short form', () => {
    const s = scene(at(2, 34));
    const vl = s.labels.filter((l) => l.q || l.fallback);
    expect(vl.length).toBeGreaterThan(0);
    for (const l of vl) expect(l.fallback?.length).toBeGreaterThan(0);
    expect(vl.flatMap((l) => l.lines.map((y) => y.text)).join(' ')).toMatch(/Sam/);
  });
  it('B2 ch 60: a Bob narrator with no recorded place gets the chapter ring on the chapter\'s system', () => {
    const v = at(2, 60);
    const s = scene(v);
    expect(s.nodes.find((n) => n.chapterRing)?.ids).toContain(v.chapter.system);
  });
  it('B2 ch 34: at rest only the narrator\'s place keeps its drop line; selecting a Bob keeps his route\'s', () => {
    const v = at(2, 34);
    const s = scene(v);
    const kept = s.nodes.filter((n) => n.drop);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(s.nodes.length);
    for (const n of kept) expect(n.puck || n.chapterRing || n.ids.includes(v.chapter.system ?? '')).toBe(true);
    const bob = [...v.info.keys()].find((id) => id !== v.chapter.narrator && mapState(v, v.chapter.time!).places.some((p) => p.bobs.includes(id) && p.pos))!;
    const sel = buildScene({ view: v, state: mapState(v, v.chapter.time!), level: 'local', selectedBob: bob, callout: null, colourOf: () => '#888888', palette });
    expect(sel.nodes.some((n) => n.drop && n.pips.some((p) => p.id === bob))).toBe(true);
  });
  it('B2 ch 34: a selected Bob\'s route is flagged to lie on the floor (the plane through the camera centre), fainter than any voyage', () => {
    const v = at(2, 34);
    const st = mapState(v, v.chapter.time!);
    const bob = [...v.info.keys()].find((id) => buildScene({ view: v, state: st, level: 'local', selectedBob: id, callout: null, colourOf: () => '#888888', palette }).tracks.length > 1)!;
    const s = buildScene({ view: v, state: st, level: 'local', selectedBob: bob, callout: null, colourOf: () => '#888888', palette });
    const stars = s.nodes.map((n) => n.p);
    const isStar = (p: { x: number; y: number; z: number }) => stars.some((q) => q.x === p.x && q.y === p.y && q.z === p.z);
    for (const tr of s.tracks) {
      // The scene keeps the stars' own positions; the drawing lays flat tracks on the live floor.
      expect(tr.flat).toBe(true);
      expect(isStar(tr.a)).toBe(true);
      if (tr.b) expect(isStar(tr.b)).toBe(true);
      expect(tr.alpha).toBeLessThanOrEqual(0.6);
    }
    for (const d of s.diamonds) expect(d.flat).toBe(true);
    const plain = scene(v);
    for (const tr of plain.tracks) {
      expect(tr.flat).toBe(false);
      expect(tr.alpha).toBeLessThanOrEqual(0.4);
    }
  });
  it('B5 ch 16: the narrator\'s voyage group is drawn in his colour', () => {
    const v = at(5, 16);
    const colourOf = (id: string) => (id === v.chapter.narrator ? '#ff0000' : '#888888');
    const s = buildScene({ view: v, state: mapState(v, v.chapter.time!), level: 'local', selectedBob: null, callout: null, colourOf, palette });
    const mine = s.voyages.filter((g) => g.puck);
    expect(mine.length).toBe(1);
    expect(mine[0].colour).toBe('#ff0000');
  });
  it('galaxy level: the schematic disc lies on the galactic plane', () => {
    const s = scene(at(5, 16), 'galaxy');
    expect(s.disc).not.toBeNull();
    expect(s.disc!.c.z).toBe(0);
    expect(scene(at(5, 16)).disc).toBeNull();
  });
});

describe('scaleBarFor', () => {
  it('picks a round length between 48 and 120 pt that depends on the zoom only', () => {
    for (const scale of [0.05, 0.3, 1, 4, 10, 33, 80, 250, 900]) {
      const b = scaleBarFor(scale);
      expect(b.pt).toBeGreaterThan(47.9);
      expect(b.pt).toBeLessThanOrEqual(120);
      expect(String(b.ly)).toMatch(/^(1|2|5)0*$|^0\.0?[125]$/);
    }
    // 1 pc = 3.26 ly: at 40 pt per parsec a 5 ly bar is 61 pt.
    expect(scaleBarFor(40)).toMatchObject({ ly: 5, label: '5 ly' });
    expect(scaleBarFor(0.01).label).toBe('20,000 ly');
    expect(lyLabel(30)).toBe('30 ly');
    expect(lyLabel(15000)).toBe('15,000 ly');
  });

  it('keeps the length shown before while its bar stays within 40–130 pt, so a pinch near a step never flips it', () => {
    // At 12 pt per light year a 10 ly bar is exactly 120 pt: just above that zoom the fresh choice drops to 5 ly.
    const step = 12 * LY_PER_PC;
    expect(scaleBarFor(step * 0.999).ly).toBe(10);
    expect(scaleBarFor(step * 1.001).ly).toBe(5);
    expect(scaleBarFor(step * 1.001, 120, 10).ly).toBe(10);
    expect(scaleBarFor(step * 0.999, 120, 5).ly).toBe(5);
    // Outside the band a new round length is chosen.
    expect(scaleBarFor(step * 1.2, 120, 10).ly).toBe(5);
    expect(scaleBarFor(step * 0.3, 120, 10).ly).toBe(20);
  });
});

describe('viewportDiameter', () => {
  // A globe of radius r points at `scale` points per parsec spans 2r / scale parsecs.
  const at = (ly: number, r = 150) => viewportDiameter(r, (2 * r * LY_PER_PC) / ly);
  it('gives whole light years under 1,000', () => {
    expect(at(42)).toBe('42 ly');
    expect(at(41.6)).toBe('42 ly');
    expect(at(3.2)).toBe('3 ly');
    expect(at(0.3)).toBe('1 ly');
    expect(at(999.4)).toBe('999 ly');
  });
  it('rounds to two figures with thousands separators from 1,000 up (galaxy level too)', () => {
    expect(at(999.6)).toBe('1,000 ly');
    expect(at(1234)).toBe('1,200 ly');
    expect(at(26345)).toBe('26,000 ly');
    expect(at(152000)).toBe('150,000 ly');
  });
  it('depends on the zoom and the globe size only, and is empty when there is no zoom', () => {
    // 2 × 100 pt at 10 pt per parsec is 20 pc, 65.2 ly; twice the globe at twice the zoom is the same.
    expect(viewportDiameter(100, 10)).toBe('65 ly');
    expect(viewportDiameter(200, 20)).toBe('65 ly');
    expect(viewportDiameter(100, 0)).toBe('');
    expect(viewportDiameter(100, Number.NaN)).toBe('');
  });
});
