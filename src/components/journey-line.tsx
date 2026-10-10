// One Bob's journey drawn as a metro line: stations where he stayed, dashed legs in transit, joining SCUT and
// the end of the line. In network mode the other Bobs run alongside as their own thinner lines: a Bob already at a
// station comes in from above, one who arrives starts with a dot, and only the copies this Bob makes branch off his
// own line. A Bob who travels on with him keeps his line through the journey (dashed) into the next station.
// A wormhole hop or a transmission is instant: a thin connector through an ink gate mark, no duration. Other
// replicants (not Bobs) run alongside as outlined ink lines with square outlined chips, never in a Bob colour.
// Story order, not to scale.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { BobChip, OtherChip, Segmented, shortKind, Tag } from '@/components/bits';
import { Icon } from '@/components/icon';
import { T } from '@/components/text';
import { durationText, journey, monthYear, yearText, type Company, type JourneyItem, type ProgressView } from '@/core';
import { useLayout } from '@/hooks/use-layout';
import { useOpenBob } from '@/hooks/use-open-bob';
import { useApp } from '@/state/app';

const SHOWN = 8;
const RAIL = 28;
const MARK_Y = 11;
const PITCH = 7;
const EPS = 0.01;

/** solid: a stay; dashed: a voyage; hop: the thin connector of an instant jump. */
type Track = 'solid' | 'dashed' | 'hop' | 'none';
type Stay = Extract<JourneyItem, { kind: 'stay' }>;
type Transit = Extract<JourneyItem, { kind: 'transit' }>;
type Hop = Extract<JourneyItem, { kind: 'hop' }>;
export type JourneyMode = 'network' | 'single';

/** A chip with an optional note ("until 2145", "lost 2166"). */
interface Mate {
  id: string;
  note?: string;
  /** Another replicant, not a Bob. */
  isOther?: boolean;
}

/** What the line draws, one row per marker. A station opens with its own row (and the Bobs already there), then
 * one stop per group of copies he makes, Bobs who arrive or are made there, and SCUT, in date order. */
type LineRow = (
  | { kind: 'station'; stay: Stay; mates: Mate[]; arrivedWith: Mate[]; parent: Mate | null; siblings: Mate[] }
  | { kind: 'copy'; year: number; mates: Mate[] }
  | { kind: 'company'; label: string; mates: Mate[] }
  | { kind: 'scut'; year: number; how: string }
  | { kind: 'transit'; item: Transit }
  | { kind: 'hop'; item: Hop }
  | { kind: 'end'; item: Extract<JourneyItem, { kind: 'end' }> }
) & { at?: Stay; t0?: number; t1?: number };

/** A companion's line within one row. */
interface Lane {
  col: number;
  colour: string;
  dashed: boolean;
  /** Another replicant: drawn as an outlined ink line. */
  isOther: boolean;
  /** Set on the row where his line begins. */
  start: Company['came'] | null;
  /** Set on the row where his line ends before this Bob leaves. */
  end: Company['went'];
}

function wentNote(c: Company): string | undefined {
  if (c.went === 'lost') return `lost ${yearText(c.to)}`;
  if (c.went === 'left') return `until ${yearText(c.to)}`;
  return undefined;
}

function rowsFor(it: JourneyItem): LineRow[] {
  if (it.kind === 'transit') return [{ kind: 'transit', item: it }];
  if (it.kind === 'hop') return [{ kind: 'hop', item: it }];
  if (it.kind === 'end') return [{ kind: 'end', item: it }];
  if (it.kind === 'scut') return [{ kind: 'scut', year: it.year, how: it.how }];
  const here: Mate[] = [];
  const arrivedWith: Mate[] = [];
  const siblings: Mate[] = [];
  let parent: Mate | null = null;
  const groups = new Map<string, { year: number; row: LineRow }>();
  for (const c of [...it.company, ...it.others]) {
    if (c.came === 'parent') {
      parent = { id: c.id, note: wentNote(c) };
      continue;
    }
    if (c.came === 'here' || c.came === 'with' || c.came === 'sibling') {
      const list = c.came === 'with' ? arrivedWith : c.came === 'sibling' ? siblings : here;
      if (!list.some((m) => m.id === c.id)) list.push({ id: c.id, note: wentNote(c), isOther: c.isOther });
      continue;
    }
    const key = c.came === 'copy' ? `copy:${Math.round(c.from * 12)}` : `${c.came}:${companyLabel(c)}`;
    let g = groups.get(key);
    if (!g) {
      g = { year: c.from, row: c.came === 'copy' ? { kind: 'copy', year: c.from, mates: [] } : { kind: 'company', label: companyLabel(c), mates: [] } };
      groups.set(key, g);
    }
    const mates = (g.row as { mates: Mate[] }).mates;
    if (!mates.some((m) => m.id === c.id)) mates.push({ id: c.id, note: c.came === 'copy' ? wentNote(c) : undefined, isOther: c.isOther });
  }
  const stops: { year: number; row: LineRow }[] = [...groups.values()];
  if (it.scut) stops.push({ year: it.scut.year, row: { kind: 'scut', year: it.scut.year, how: it.scut.how } });
  stops.sort((a, b) => a.year - b.year);
  const rows: LineRow[] = [{ kind: 'station', stay: it, mates: here, arrivedWith, parent, siblings }, ...stops.map((s) => s.row)];
  // Each row of a station covers the story time up to the next row (or the end of the stay).
  const starts = [it.from, ...stops.map((s) => s.year)];
  return rows.map((r, i) => ({ ...r, at: it, t0: starts[i], t1: starts[i + 1] ?? it.to }));
}

/** Companion lines per row. A Bob's presence in consecutive rows is one line in one column, so a Bob who travels
 * on with this Bob keeps his line through the journey into the next station. */
function laneLayout(rows: LineRow[], colourOf: (id: string) => string, maxCols: number): { lanes: Lane[][]; cols: number } {
  type Mark = { dashed: boolean; isOther: boolean; start: Company['came'] | null; end: Company['went'] };
  const present: Map<string, Mark>[] = rows.map(() => new Map());
  const mark = (k: number, id: string, m: Partial<Mark>) => {
    const cur = present[k].get(id) ?? { dashed: false, isOther: false, start: null, end: null };
    present[k].set(id, { ...cur, ...m });
  };
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    if (r.kind === 'transit' || r.kind === 'hop') {
      // On a voyage his companions' lines are dashed like his; through an instant hop they stay solid.
      const dashed = r.kind === 'transit';
      for (const id of r.item.company) mark(i, id, { dashed });
      for (const id of r.item.others) mark(i, id, { dashed, isOther: true });
      i++;
      continue;
    }
    const stay = r.at;
    if (!stay) {
      i++;
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j].at === stay) j++;
    for (const c of [...stay.company, ...stay.others]) {
      // His line starts on the row that lists him (the station for Bobs already there or arriving with him), then
      // runs through every later row of the stay he is still there for.
      const listed = rows.findIndex((r, k) => k >= i && k < j && 'mates' in r && r.kind !== 'station' && r.mates.some((m) => m.id === c.id));
      const first = listed < 0 ? i : listed;
      const hit: number[] = [first];
      for (let k = first + 1; k < j; k++) if (rows[k].t0! < c.to - EPS) hit.push(k);
      hit.forEach((k) => mark(k, c.id, { isOther: c.isOther }));
      mark(hit[0], c.id, { start: c.came });
      if (c.went) mark(hit[hit.length - 1], c.id, { end: c.went });
    }
    i = j;
  }

  // Runs of consecutive rows per Bob, packed into as few columns as possible.
  const runs: { id: string; a: number; b: number }[] = [];
  const ids = new Set(present.flatMap((m) => [...m.keys()]));
  for (const id of ids) {
    let a = -1;
    for (let k = 0; k <= rows.length; k++) {
      const on = k < rows.length && present[k].has(id);
      if (on && a < 0) a = k;
      if (!on && a >= 0) {
        runs.push({ id, a, b: k - 1 });
        a = -1;
      }
    }
  }
  runs.sort((x, y) => x.a - y.a || x.b - y.b);
  const lanes: Lane[][] = rows.map(() => []);
  const busyUntil: number[] = [];
  let cols = 0;
  for (const run of runs) {
    // The parent at the station where this Bob is made runs in a gutter on the left of his line.
    const isParent = present[run.a].get(run.id)!.start === 'parent';
    let col = isParent ? -1 : busyUntil.findIndex((end) => end < run.a);
    if (col < 0 && !isParent) col = busyUntil.length;
    if (col >= maxCols) continue;
    if (!isParent) {
      busyUntil[col] = run.b;
      cols = Math.max(cols, col + 1);
    }
    for (let k = run.a; k <= run.b; k++) {
      const m = present[k].get(run.id)!;
      lanes[k].push({ col, colour: m.isOther ? '' : colourOf(run.id), dashed: m.dashed, isOther: m.isOther, start: k === run.a ? m.start ?? 'here' : null, end: k === run.b ? m.end : null });
    }
  }
  return { lanes, cols };
}

export function JourneyLine({ view, id, mode }: { view: ProgressView; id: string; mode: JourneyMode }) {
  const { colourOf } = useApp();
  const { compact } = useLayout();
  const open = useOpenBob();
  const [all, setAll] = useState(false);
  const items = journey(view, id);
  const colour = colourOf(id);
  const ongoing = items.some((it) => (it.kind === 'stay' || it.kind === 'transit') && it.ongoing);

  const start = all || items.length <= SHOWN ? 0 : items.length - SHOWN;
  const rows = items.slice(start).flatMap(rowsFor);
  const { lanes, cols } = mode === 'network' ? laneLayout(rows, colourOf, compact ? 8 : 12) : { lanes: rows.map((): Lane[] => []), cols: 0 };
  const ox = lanes.some((row) => row.some((l) => l.col < 0)) ? GUTTER : 0;
  const railW = ox + RAIL + (cols ? cols * PITCH + 4 : 0);
  const parentColour = view.info.get(id)?.bob.parent && view.info.has(view.info.get(id)!.bob.parent!) ? colourOf(view.info.get(id)!.bob.parent!) : null;

  // The track below each row continues the segment the row belongs to.
  const below: Track[] = [];
  let track: Track = 'solid';
  for (const r of rows) {
    if (r.kind === 'station') track = 'solid';
    else if (r.kind === 'transit') track = 'dashed';
    else if (r.kind === 'hop') track = 'hop';
    else if (r.kind === 'end') track = 'none';
    below.push(track);
  }
  const last = rows.length - 1;
  if (!ongoing && last >= 0 && rows[last].kind !== 'end') below[last] = 'none';

  return (
    <View>
      {start ? (
        <Pressable onPress={() => setAll(true)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', paddingLeft: railW + 10 }}>
          <T variant="secondary" weight="600">{`Show ${start} earlier`}</T>
        </Pressable>
      ) : null}
      {rows.map((r, i) => (
        <Row key={i} ox={ox} parentColour={parentColour} width={railW} above={r.kind === 'hop' ? (i === 0 && !start ? 'none' : 'hop') : i === 0 ? (start ? below[0] : 'none') : below[i - 1]} below={below[i]} colour={colour} lanes={lanes[i]}
          marker={<Marker r={r} colour={colour} />} tight={r.kind === 'company' || r.kind === 'copy' || r.kind === 'scut' || r.kind === 'hop'}>
          <Content r={r} onOpen={open} />
        </Row>
      ))}
      {ongoing ? (
        <Row ox={ox} parentColour={parentColour} width={railW} above={below[last]} below="none" colour={colour} lanes={[]} marker={<Tag text="NOW" />} tight>
          <View />
        </Row>
      ) : null}
    </View>
  );
}

/** Left gutter for the parent's line (only when there is one); his own line sits to its right. */
const GUTTER = 12;
const laneX = (col: number, ox: number) => (col < 0 ? 5 : ox + RAIL + 4 + col * PITCH);

function Row({ ox, parentColour, width, above, below, colour, lanes, marker, children, tight }: { ox: number; parentColour: string | null; width: number; above: Track; below: Track; colour: string; lanes: Lane[]; marker: React.ReactNode; children: React.ReactNode; tight?: boolean }) {
  const p = useApp().palette;
  const trunk = ox + RAIL / 2;
  const copies = lanes.filter((l) => l.start === 'copy');
  const reach = copies.length ? laneX(Math.max(...copies.map((l) => l.col)), ox) : 0;
  // Made together: a bar in the parent's colour from his line, through this Bob's station, to his siblings.
  const birth = lanes.filter((l) => l.start === 'parent' || l.start === 'sibling');
  const sibs = birth.filter((l) => l.start === 'sibling');
  const bar = birth.length
    ? { from: birth.some((l) => l.start === 'parent') ? 5 : trunk, to: sibs.length ? laneX(Math.max(...sibs.map((l) => l.col)), ox) : trunk }
    : null;
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Rail track={above} colour={colour} left={trunk} top={0} height={MARK_Y} />
        <Rail track={below} colour={colour} left={trunk} top={MARK_Y} />
        {lanes.map((l, k) => <LaneLine key={k} lane={l} ox={ox} />)}
        {bar ? <View style={{ position: 'absolute', left: bar.from, width: bar.to - bar.from, top: MARK_Y - 1.5, height: 3, borderRadius: 1.5, backgroundColor: parentColour ?? p.ink3 }} /> : null}
        {/* Only his own copies branch off his line. */}
        {copies.length ? <View style={{ position: 'absolute', left: trunk, width: reach - trunk, top: MARK_Y - 1, height: 2, backgroundColor: colour }} /> : null}
        {lanes.filter((l) => l.start && l.start !== 'here' && l.start !== 'with' && l.start !== 'parent').map((l, k) => (
          // Another replicant's line starts at a hollow ink square (his chip's shape); a Bob's at a dot.
          <View key={`s${k}`} style={l.isOther
            ? { position: 'absolute', left: laneX(l.col, ox) - 3.5, top: MARK_Y - 3.5, width: 7, height: 7, backgroundColor: p.bg, borderWidth: 1.5, borderColor: p.ink }
            : { position: 'absolute', left: laneX(l.col, ox) - 3.5, top: MARK_Y - 3.5, width: 7, height: 7, borderRadius: 3.5, backgroundColor: l.colour }} />
        ))}
        {lanes.filter((l) => l.end === 'left').map((l, k) => (
          <View key={`e${k}`} style={{ position: 'absolute', left: laneX(l.col, ox) - 3.5, bottom: 4, width: 7, height: 7, borderRadius: 3.5, backgroundColor: p.bg, borderWidth: 2, borderColor: l.isOther ? p.ink : l.colour }} />
        ))}
        {lanes.filter((l) => l.end === 'lost').map((l, k) => (
          <View key={`x${k}`} style={{ position: 'absolute', left: laneX(l.col, ox) - 5, bottom: 2 }}>
            <Icon name="lost" color={p.ink} size={10} strokeWidth={3} />
          </View>
        ))}
        <View style={{ marginLeft: ox, width: RAIL, height: MARK_Y * 2, justifyContent: 'center', alignItems: 'center' }}>{marker}</View>
      </View>
      <View style={{ flex: 1, paddingBottom: tight ? 10 : 18, gap: 6 }}>{children}</View>
    </View>
  );
}

function LaneLine({ lane, ox }: { lane: Lane; ox: number }) {
  const p = useApp().palette;
  // Lines of Bobs who were already there come in from above; the rest start at the row's marker.
  const top = lane.start && lane.start !== 'here' && lane.start !== 'with' && lane.start !== 'parent' ? MARK_Y : 0;
  const box = { position: 'absolute' as const, left: laneX(lane.col, ox) - 1.5, width: 3, top, bottom: lane.end ? 8 : 0 };
  if (lane.isOther) {
    // Another replicant: two thin ink strokes with nothing between them.
    const hollow = { ...box, left: box.left - 0.5, width: 4 };
    if (!lane.dashed) return <View style={{ ...hollow, borderLeftWidth: 1, borderRightWidth: 1, borderColor: p.ink2 }} />;
    return <Dashes style={hollow} colour={p.ink2} width={4} hollow />;
  }
  if (!lane.dashed) return <View style={{ ...box, borderRadius: 1.5, backgroundColor: lane.colour }} />;
  return <Dashes style={box} colour={lane.colour} width={3} />;
}

/** A vertical dashed line that fills its box. Built from short segments: one-sided dashed borders don't draw on
 * iOS, and SVG percentage heights don't resolve reliably there. Hollow dashes are outlined, for other replicants. */
function Dashes({ style, colour, width, hollow }: { style: object; colour: string; width: number; hollow?: boolean }) {
  return (
    <View style={[style, { overflow: 'hidden', alignItems: 'center' }]}>
      {Array.from({ length: 120 }, (_, k) => (
        <View key={k} style={hollow
          ? { width, height: 6, marginBottom: 4, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colour }
          : { width, height: 6, marginBottom: 4, borderRadius: 1, backgroundColor: colour }} />
      ))}
    </View>
  );
}

function Rail({ track, colour, left, top, height }: { track: Track; colour: string; left: number; top: number; height?: number }) {
  if (track === 'none') return null;
  const box = { position: 'absolute' as const, top, left: left - 2, width: 4, ...(height != null ? { height } : { bottom: 0 }) };
  if (track === 'solid') return <View style={{ ...box, backgroundColor: colour, borderRadius: 2 }} />;
  // An instant jump: a thin straight connector, clearly not the thick line of a stay or the dashes of a voyage.
  if (track === 'hop') return <View style={{ ...box, left: left - 0.75, width: 1.5, backgroundColor: colour }} />;
  return <Dashes style={box} colour={colour} width={4} />;
}

function Marker({ r, colour }: { r: LineRow; colour: string }) {
  const p = useApp().palette;
  switch (r.kind) {
    case 'station':
      return <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 4, borderColor: colour, backgroundColor: p.bg }} />;
    case 'copy':
      return <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colour, borderWidth: 2, borderColor: p.bg }} />;
    case 'company':
      return <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: p.ink, backgroundColor: p.bg }} />;
    case 'transit':
      return null;
    case 'hop':
      // The gate: two concentric ink rings (dotted outer ring for a transmission).
      return (
        <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: p.ink, borderStyle: r.item.via === 'transmitted' ? 'dotted' : 'solid', backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: p.ink }} />
        </View>
      );
    case 'scut':
      return <View style={{ width: 11, height: 11, backgroundColor: p.ink, transform: [{ rotate: '45deg' }] }} />;
    case 'end':
      return r.item.status === 'lost' ? (
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: p.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color={p.inv} size={12} strokeWidth={3} />
        </View>
      ) : (
        <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: p.ink, borderStyle: 'dashed', backgroundColor: p.bg }} />
      );
  }
}

function Chips({ mates, onOpen }: { mates: Mate[]; onOpen: (id: string) => void }) {
  const { view } = useApp();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {mates.map((m) => m.isOther
        ? <OtherChip key={`o:${m.id}`} id={m.id} kind={shortKind(view.others.find((o) => o.id === m.id)?.kind)} note={m.note} onPress={() => router.navigate('/others')} />
        : <BobChip key={m.id} id={m.id} note={m.note} onPress={() => onOpen(m.id)} />)}
    </View>
  );
}

function withDuration(text: string, years: number): string {
  const d = durationText(years);
  return d ? `${text} (${d})` : text;
}

function Content({ r, onOpen }: { r: LineRow; onOpen: (id: string) => void }) {
  const p = useApp().palette;
  switch (r.kind) {
    case 'station':
      return (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', minHeight: MARK_Y * 2 }}>
            <T variant="row" weight="600">{r.stay.place ?? 'Location not given'}</T>
            {r.stay.origin ? <Tag text="CREATED" solid={false} /> : null}
            {r.stay.estimated ? <Tag text="EST" solid={false} /> : null}
          </View>
          <T variant="data" tone="ink2" style={{ fontSize: 12 }}>{withDuration(stayDates(r.stay), r.stay.to - r.stay.from)}</T>
          {r.parent ? (
            <View style={{ gap: 4, paddingTop: 2 }}>
              <T variant="data" tone="ink3" style={{ fontSize: 11 }}>MADE BY</T>
              <Chips mates={[r.parent]} onOpen={onOpen} />
            </View>
          ) : null}
          {r.siblings.length ? (
            <View style={{ gap: 4, paddingTop: 2 }}>
              <T variant="data" tone="ink3" style={{ fontSize: 11 }}>MADE AT THE SAME TIME</T>
              <Chips mates={r.siblings} onOpen={onOpen} />
            </View>
          ) : null}
          {r.arrivedWith.length ? (
            <View style={{ gap: 4, paddingTop: 2 }}>
              <T variant="data" tone="ink3" style={{ fontSize: 11 }}>ARRIVES WITH HIM</T>
              <Chips mates={r.arrivedWith} onOpen={onOpen} />
            </View>
          ) : null}
          {r.mates.length ? (
            <View style={{ gap: 4, paddingTop: 2 }}>
              <T variant="data" tone="ink3" style={{ fontSize: 11 }}>{r.stay.origin ? 'ALSO HERE' : 'ALREADY HERE'}</T>
              <Chips mates={r.mates} onOpen={onOpen} />
            </View>
          ) : null}
        </>
      );
    case 'copy':
      return (
        <View style={{ gap: 4 }}>
          <View style={{ minHeight: MARK_Y * 2, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T variant="secondary" weight="600">{r.mates.length === 1 ? 'Makes a copy' : `Makes ${r.mates.length} copies`}</T>
            <T variant="data" tone="ink2" style={{ fontSize: 12 }}>{yearText(r.year)}</T>
          </View>
          <Chips mates={r.mates} onOpen={onOpen} />
        </View>
      );
    case 'company':
      return (
        <View style={{ gap: 4 }}>
          <View style={{ minHeight: MARK_Y * 2, justifyContent: 'center' }}>
            <T variant="data" tone="ink2" style={{ fontSize: 12 }}>{r.label}</T>
          </View>
          <Chips mates={r.mates} onOpen={onOpen} />
        </View>
      );
    case 'transit':
      return (
        <View style={{ minHeight: MARK_Y * 2, justifyContent: 'center', gap: 4, paddingBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="arrow" color={p.ink2} size={12} strokeWidth={2.4} />
            <T variant="secondary" tone="ink2">{`In transit to ${r.item.dest ?? 'an unknown destination'}`}</T>
          </View>
          <T variant="data" tone="ink3" style={{ fontSize: 12 }}>
            {withDuration(r.item.ongoing ? `since ${monthYear(r.item.from)}` : `${monthYear(r.item.from)} – ${monthYear(r.item.to)}`, r.item.to - r.item.from)}
          </T>
          {r.item.company.length || r.item.others.length ? (
            <View style={{ gap: 4 }}>
              <T variant="data" tone="ink3" style={{ fontSize: 11 }}>TRAVELLING WITH</T>
              <Chips mates={[...r.item.company.map((id) => ({ id })), ...r.item.others.map((id) => ({ id, isOther: true }))]} onOpen={onOpen} />
            </View>
          ) : null}
        </View>
      );
    case 'hop':
      // Instant, so no duration. Whoever hops with him shows at the next station ("Arrives with him").
      return (
        <View style={{ minHeight: MARK_Y * 2, justifyContent: 'center' }}>
          <T variant="secondary" weight="600">{hopText(r.item)}</T>
        </View>
      );
    case 'scut':
      return (
        <View style={{ minHeight: MARK_Y * 2, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T variant="secondary" weight="600">{r.how === 'born' ? 'Created already on SCUT' : 'Joins SCUT'}</T>
          <T variant="data" tone="ink2" style={{ fontSize: 12 }}>{yearText(r.year)}</T>
        </View>
      );
    case 'end':
      return (
        <View style={{ minHeight: MARK_Y * 2, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T variant="secondary" weight="600">{r.item.status === 'lost' ? 'Lost' : 'Missing'}</T>
          <T variant="data" tone="ink2" style={{ fontSize: 12 }}>{r.item.status === 'lost' ? yearText(r.item.year) : `since ${yearText(r.item.year)}`}</T>
        </View>
      );
  }
}

/** "Wormhole to Roanoke · 2337", "Transmitted to Eta Leporis · 2334", "Wormhole, destination not given · 2347". */
function hopText(h: Hop): string {
  const how = h.via === 'transmitted' ? 'Transmitted' : 'Wormhole';
  return `${h.to ? `${how} to ${h.to}` : `${how}, destination not given`} · ${yearText(h.year)}`;
}

function stayDates(s: Stay): string {
  if (s.ongoing) return `since ${monthYear(s.from)}`;
  if (monthYear(s.from) === monthYear(s.to)) return monthYear(s.from);
  return `${monthYear(s.from)} – ${monthYear(s.to)}`;
}

/** "Arrives 2158 · leaves 2166 (~8 years)", "New here 2145", "Arrives 2171 · lost 2185". */
function companyLabel(c: Company): string {
  const verb = c.came === 'made' ? 'New here' : 'Arrives';
  const a = yearText(c.from);
  if (!c.went) return withDuration(`${verb} ${a}`, c.to - c.from);
  return withDuration(`${verb} ${a} · ${c.went === 'lost' ? 'lost' : 'leaves'} ${yearText(c.to)}`, c.to - c.from);
}

/** Header switch between the network map and the single line. */
export function JourneyModeSwitch({ value, onChange }: { value: JourneyMode; onChange: (m: JourneyMode) => void }) {
  return (
    <View style={{ width: 180 }}>
      <Segmented<JourneyMode> label="Journey view" value={value} onChange={onChange}
        options={[{ value: 'network', label: 'Network' }, { value: 'single', label: 'Single' }]} />
    </View>
  );
}
