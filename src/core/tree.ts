// Tree rows: lineage outline from the root, then Bobs whose parent isn't known (or not yet revealed).
import { locAt, type ProgressView } from './view';

export type LocationFilter =
  | { kind: 'everyone' }
  | { kind: 'alive' }
  | { kind: 'system'; name: string }
  | { kind: 'transit' }
  | { kind: 'missing' }
  | { kind: 'lost' };

export type TreeRow =
  | { kind: 'header'; key: string; text: string; count: number; minor?: boolean }
  | {
      kind: 'bob';
      key: string;
      id: string;
      depth: number;
      /** Connector lines: for each level above the parent's, whether that branch carries on below this row. */
      rails: boolean[];
      /** Last child of his parent here (the elbow stops at this row). */
      last: boolean;
      /** Has children shown directly below (a line runs down from his marker). */
      openBelow: boolean;
      /** Number of Bobs hidden under this row when collapsed. */
      hidden: number;
      hasKids: boolean;
      /** Shown only to keep a filtered tree connected (dimmed). */
      ancestorOnly: boolean;
    }
  | {
      /** Siblings made together (same parent, same month), folded into one row in "In this chapter". */
      kind: 'group';
      key: string;
      parent: string;
      ids: string[];
      year: number;
      depth: number;
      rails: boolean[];
      last: boolean;
      expanded: boolean;
    };

/** Siblings made in the same month fold into one row in "In this chapter" from this many. */
export const BATCH_FOLD_AT = 3;

export function ancestors(view: ProgressView, id: string): string[] {
  const out: string[] = [];
  let cur = view.info.get(id);
  let guard = 0;
  while (cur && cur.bob.parent && view.info.has(cur.bob.parent) && guard++ < 200) {
    out.push(cur.bob.parent);
    cur = view.info.get(cur.bob.parent);
  }
  return out;
}

export function matchesFilter(view: ProgressView, id: string, f: LocationFilter): boolean {
  const I = view.info.get(id)!;
  switch (f.kind) {
    case 'everyone':
      return true;
    case 'alive':
      return I.status !== 'lost';
    case 'lost':
      return I.status === 'lost';
    case 'missing':
      return I.status === 'missing';
    case 'transit':
      return I.status === 'active' && !!I.inTransit;
    case 'system':
      return I.status === 'active' && !I.inTransit && I.loc === f.name;
  }
}

export interface TreeSection {
  key: 'chapter' | 'travel' | 'here' | 'rest' | 'all';
  title: string | null;
  members: Set<string>;
}

/** Wording for where the chapter is set: a heading for the narrator's place, and one for the Bobs at the system. */
export function settingLabels(view: ProgressView): { place: string | null; others: string | null } {
  const ch = view.chapter;
  const sys = ch.system;
  switch (ch.setting) {
    case 'system': {
      const n = ch.narrator && ch.time != null ? locAt(view, ch.narrator, ch.time) : null;
      // "Also in" when the narrator is there himself; "At" when he follows events there from elsewhere.
      const there = !!n && !n.notYet && !n.transit && n.loc === sys;
      return { place: `At ${sys}`, others: `${there ? 'Also in' : 'At'} ${sys}` };
    }
    case 'approach':
      return { place: `Approaching ${sys}`, others: `Approaching ${sys}` };
    case 'enroute':
      return { place: `En route to ${sys}`, others: `Destination: ${sys}` };
    case 'deep':
      return { place: 'In interstellar space', others: null };
    default:
      return { place: null, others: null };
  }
}

/**
 * A review for the start of a chapter: whose chapter it is ("In this chapter": the narrator), who travels with him,
 * who is at the system the chapter is set in (or heading for), then everyone else. Empty sections are left out.
 */
export function treeSections(view: ProgressView, shown: string[]): TreeSection[] {
  const ch = view.chapter;
  const set = new Set(shown);
  const narrator = ch.narrator && set.has(ch.narrator) ? [ch.narrator] : [];
  const travelling = ch.travelling.filter((id) => set.has(id));
  const here = ch.here.filter((id) => set.has(id) && !travelling.includes(id));
  const placed = new Set([...narrator, ...travelling, ...here]);
  const rest = shown.filter((id) => !placed.has(id));
  if (!placed.size) return [{ key: 'all', title: null, members: set }];
  const labels = settingLabels(view);
  const out: TreeSection[] = [];
  if (narrator.length) out.push({ key: 'chapter', title: 'In this chapter', members: new Set(narrator) });
  if (travelling.length) out.push({ key: 'travel', title: `Travelling with ${ch.narrator}`, members: new Set(travelling) });
  if (here.length) out.push({ key: 'here', title: labels.others ?? `At ${ch.system}`, members: new Set(here) });
  if (rest.length) out.push({ key: 'rest', title: 'Everyone else', members: new Set(rest) });
  return out;
}

/**
 * Lineage outline in sections (see treeSections). The first two show each Bob with his parent (dimmed when he
 * belongs elsewhere), and "Also in" folds siblings made in the same month into one row; everyone else keeps full
 * lineage, unfolded. `toggled` holds row keys the reader has flipped: a Bob row collapses, a folded batch opens.
 */
export function treeRows(view: ProgressView, toggled: Set<string>, filter: LocationFilter, selected: string | null = null): TreeRow[] {
  const shown = view.ids.filter((id) => matchesFilter(view, id, filter));
  const rows: TreeRow[] = [];
  for (const sec of treeSections(view, shown)) {
    if (sec.title) rows.push({ kind: 'header', key: `__${sec.key}`, text: sec.title, count: sec.members.size });
    const focused = sec.key === 'chapter' || sec.key === 'travel' || sec.key === 'here';
    rows.push(...sectionRows(view, toggled, sec.key, sec.members, { parentsOnly: focused, fold: sec.key === 'here', selected }));
  }
  return rows;
}

function sectionRows(
  view: ProgressView,
  toggled: Set<string>,
  key: string,
  members: Set<string>,
  opts: { parentsOnly: boolean; fold: boolean; selected: string | null },
): TreeRow[] {
  const root = view.model.root;
  const parentOf = (id: string) => {
    const p = view.info.get(id)!.bob.parent;
    return p && view.info.has(p) ? p : null;
  };
  const keep = new Set<string>();
  for (const id of members) {
    keep.add(id);
    if (opts.parentsOnly) {
      const p = parentOf(id);
      if (p) keep.add(p);
    } else ancestors(view, id).forEach((a) => keep.add(a));
  }
  const countDesc = (id: string): number => view.info.get(id)!.kids.reduce((n, k) => (keep.has(k) ? n + 1 + countDesc(k) : n), 0);
  const keptKids = (id: string) => view.info.get(id)!.kids.filter((k) => keep.has(k));

  // Children of one parent as shown: single Bobs, or batches made in the same month folded into one entry.
  type Entry = { id: string } | { batch: string[]; year: number; groupKey: string };
  const entriesOf = (id: string): Entry[] => {
    const kids = keptKids(id);
    if (!opts.fold) return kids.map((k) => ({ id: k }));
    const byMonth = new Map<number, string[]>();
    for (const k of kids) {
      if (keptKids(k).length || k === view.chapter.narrator || k === opts.selected) continue;
      const m = Math.round(view.info.get(k)!.born * 12);
      byMonth.set(m, [...(byMonth.get(m) ?? []), k]);
    }
    const out: Entry[] = [];
    const done = new Set<string>();
    for (const k of kids) {
      if (done.has(k)) continue;
      const batch = byMonth.get(Math.round(view.info.get(k)!.born * 12));
      const groupKey = `${key}:batch:${id}:${k}`;
      if (batch && batch.length >= BATCH_FOLD_AT && batch.includes(k)) {
        batch.forEach((b) => done.add(b));
        out.push({ batch, year: view.info.get(k)!.born, groupKey });
      } else out.push({ id: k });
    }
    return out;
  };

  const rows: TreeRow[] = [];
  const walk = (id: string, depth: number, rails: boolean[], last: boolean) => {
    const kids = keptKids(id);
    const rowKey = `${key}:${id}`;
    const isCollapsed = toggled.has(rowKey) && kids.length > 0;
    rows.push({
      kind: 'bob', key: rowKey, id, depth, rails, last, openBelow: !isCollapsed && kids.length > 0,
      hidden: isCollapsed ? countDesc(id) : 0, hasKids: kids.length > 0, ancestorOnly: !members.has(id),
    });
    if (isCollapsed) return;
    // Children of a root-level row hang off its own marker, so they carry no rails above it.
    const childRails = depth === 0 ? [] : [...rails, !last];
    const entries = entriesOf(id);
    entries.forEach((e, i) => {
      const isLast = i === entries.length - 1;
      if ('id' in e) return walk(e.id, depth + 1, childRails, isLast);
      const expanded = toggled.has(e.groupKey);
      rows.push({ kind: 'group', key: e.groupKey, parent: id, ids: e.batch, year: e.year, depth: depth + 1, rails: childRails, last: isLast && !expanded, expanded });
      if (expanded) e.batch.forEach((b, j) => walk(b, depth + 1, childRails, isLast && j === e.batch.length - 1));
    });
  };

  const tops = [...keep].filter((id) => !parentOf(id) || !keep.has(parentOf(id)!));
  if (keep.has(root)) walk(root, 0, [], true);
  const byBirth = (a: string, b: string) => view.info.get(a)!.born - view.info.get(b)!.born;
  // In "In this chapter" a Bob whose parent isn't shown simply starts his own line.
  const shownParentless = tops.filter((id) => id !== root && (opts.parentsOnly ? !!parentOf(id) : false)).sort(byBirth);
  shownParentless.forEach((id) => walk(id, 0, [], true));
  const orphans = tops.filter((id) => id !== root && !parentOf(id)).sort(byBirth);
  if (orphans.length) {
    rows.push({ kind: 'header', key: `__${key}:orphans`, text: 'Parent not known', count: orphans.filter((o) => members.has(o)).length, minor: true });
    orphans.forEach((id) => walk(id, 0, [], true));
  }
  return rows;
}

/** Systems the location filter can offer: those with someone in them now, busiest first. */
export function filterSystems(view: ProgressView): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const id of view.ids) {
    const I = view.info.get(id)!;
    if (I.status === 'active' && !I.inTransit && I.loc) counts.set(I.loc, (counts.get(I.loc) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export interface SystemGroup {
  name: string;
  ids: string[];
  hasNarrator: boolean;
  onScut: boolean;
}

export interface Positions {
  time: number;
  systems: SystemGroup[];
  transit: { id: string; from: string | null; to: string | null }[];
  missing: string[];
  lost: string[];
  notYet: string[];
  unknown: string[];
}

/** Where everyone is at story time t (NOW or the chapter date). */
export function positionsAt(view: ProgressView, t: number): Positions {
  const sys = new Map<string, string[]>();
  const out: Positions = { time: t, systems: [], transit: [], missing: [], lost: [], notYet: [], unknown: [] };
  for (const id of view.ids) {
    const s = locAt(view, id, t);
    if (!s) continue;
    if (s.notYet) out.notYet.push(id);
    else if (s.status === 'lost') out.lost.push(id);
    else if (s.status === 'missing') out.missing.push(id);
    else if (s.transit) out.transit.push({ id, from: s.loc, to: s.transit.to });
    else if (s.loc) sys.set(s.loc, [...(sys.get(s.loc) ?? []), id]);
    else out.unknown.push(id);
  }
  const scutSystems = new Set<string>();
  for (const id of view.ids) {
    const sc = view.info.get(id)!.scut;
    const s = locAt(view, id, t);
    if (sc && s && !s.notYet && s.loc && typeof sc.year === 'number' && sc.year <= t) scutSystems.add(s.loc);
  }
  const narrator = view.chapter.narrator;
  out.systems = [...sys]
    .map(([name, ids]) => ({ name, ids, hasNarrator: !!narrator && ids.includes(narrator), onScut: scutSystems.has(name) }))
    .sort((a, b) => Number(b.hasNarrator) - Number(a.hasNarrator) || b.ids.length - a.ids.length || a.name.localeCompare(b.name));
  return out;
}
