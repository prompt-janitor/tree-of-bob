// Callouts over the map: one at a time, pointing at the pivot (every tap moves the pivot to what was tapped, so the
// callout never has to follow anything while the map turns). A place lists who is there and how each got there; a
// Bob shows his travel lineage; a voyage lists who is on it. Each is a real accessible view with its own scroll.
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';

import { shortKind, Tag } from '@/components/bits';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icon';
import { T } from '@/components/text';
import {
  LY_PER_PC,
  distanceLy,
  groupVoyages,
  lineage,
  monthYear,
  otherStatus,
  placePositions,
  routes,
  spanText,
  voyageText,
  yearText,
  type GhostTrail,
  type MapPlace,
  type MapState,
  type MapVoyage,
  type ProgressView,
  type Route,
  type RouteLeg,
} from '@/core';
import { useOpenBob } from '@/hooks/use-open-bob';
import { useApp } from '@/state/app';

// --- words shared with the list -------------------------------------------------------------------------------

/** How he got to the place he is at: "from Epsilon Eridani · here 6 months", "made here · 2170". */
export function stayText(r: Route | undefined, place: string, t: number): string {
  if (!r) return '';
  const last = r.legs[r.legs.length - 1];
  if (last && last.to === place && last.arrived != null) {
    const span = spanText(t - last.arrived);
    return [last.from ? `from ${last.from}` : null, span === 'just left' ? 'just arrived' : `here ${span}`].filter(Boolean).join(' · ');
  }
  if (r.made?.place === place && !r.legs.length) return `made here${r.made.year != null ? ` · ${yearText(r.made.year)}` : ''}`;
  return '';
}

/** A voyage relative to the map date: "Sol → Omicron² Eridani · en route for 14 yrs · 3 yrs to go". */
export function voyageLine(v: MapVoyage, t: number, withRoute = true): string {
  const vt = voyageText(v, t);
  const route = v.to ? `${v.from ? `${v.from} → ` : ''}${v.to}` : `${v.from ? `left ${v.from}, ` : ''}destination not given`;
  return [withRoute ? route : null, vt.out, vt.toGo].filter(Boolean).join(' · ');
}

export function ghostText(g: GhostTrail, now: number): string {
  const by = `By ${monthYear(now)} (NOW):`;
  if (g.to.status === 'lost') return `${by} lost · ${monthYear(g.year)}`;
  if (g.to.status === 'missing') return `${by} missing · ${monthYear(g.year)}`;
  if (g.to.place) {
    const how = g.via === 'wormhole' ? 'arrived by wormhole' : g.via === 'transmitted' ? 'transmitted' : 'arrived';
    return `${by} at ${g.to.place} · ${how} ${monthYear(g.year)}`;
  }
  if (g.to.voyage) return `${by} on the way to ${g.to.voyage.to ?? 'a destination not given'} · left ${monthYear(g.year)}`;
  return `${by} moved · ${monthYear(g.year)}`;
}

function legText(l: RouteLeg): string {
  const route = `${l.from ?? 'a place not given'} → ${l.to ?? 'a place not given'}`;
  const how = l.via === 'wormhole' ? 'by wormhole' : l.via === 'transmitted' ? 'transmitted' : null;
  const left = l.departed != null ? `left ${monthYear(l.departed)}` : null;
  const arrived = l.arrived != null ? `arrived ${monthYear(l.arrived)}` : null;
  return [route, how, left, arrived, l.departed == null && l.via === 'voyage' ? 'departure not given' : null].filter(Boolean).join(' · ');
}

function lineageText(e: { who: string; made: Route['made']; legs: RouteLeg[] }): string {
  const stops = [e.made?.place ?? e.legs[0]?.from ?? null, ...e.legs.map((l) => l.to)].filter((x): x is string => !!x);
  const first = e.made?.year ?? e.legs[0]?.departed ?? null;
  const last = e.legs.length ? e.legs[e.legs.length - 1].arrived : null;
  const years = first != null && last != null ? `${yearText(first)}–${yearText(last)}` : first != null ? yearText(first) : last != null ? `to ${yearText(last)}` : null;
  return [`${e.who}: ${stops.length ? stops.join(' → ') : 'place not given'}`, years].filter(Boolean).join(' · ');
}

// --- frame ----------------------------------------------------------------------------------------------------

export interface CalloutFrameProps {
  /** Screen point the pointer touches. */
  x: number;
  y: number;
  /** Above or below the point. */
  below: boolean;
  width: number;
  maxHeight: number;
  screenWidth: number;
  screenHeight: number;
  title: string;
  /** Pointer hidden (a callout docked to a button). */
  pointer?: boolean;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
}

export function CalloutFrame({ x, y, below, width, maxHeight, screenWidth, screenHeight, title, pointer = true, onClose, onBack, children }: CalloutFrameProps) {
  const { palette: p } = useApp();
  const titleRef = useRef<View>(null);
  useEffect(() => {
    // VoiceOver moves to the callout's title when it opens.
    const t = setTimeout(() => {
      const el = titleRef.current;
      if (!el) return;
      if (Platform.OS === 'web') (el as unknown as { focus?: () => void }).focus?.();
      else AccessibilityInfo.sendAccessibilityEvent(el, 'focus');
    }, 350);
    return () => clearTimeout(t);
  }, [title]);
  const left = Math.max(16, Math.min(screenWidth - 16 - width, x - width / 2));
  const pos: StyleProp<ViewStyle> = below ? { top: y + 14 } : { bottom: screenHeight - y + 14 };
  return (
    <View pointerEvents="box-none" style={[{ position: 'absolute', left, width }, pos]}>
      {pointer ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', left: Math.max(14, Math.min(width - 26, x - left - 6)), width: 12, height: 12,
            transform: [{ rotate: '45deg' }], backgroundColor: p.surf, borderColor: p.line, borderWidth: 1,
            ...(below ? { top: -6 } : { bottom: -6 }),
          }}
        />
      ) : null}
      <Glass style={{ borderRadius: 16, overflow: 'hidden', maxHeight }}>
        <View accessibilityViewIsModal style={{ maxHeight }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: onBack ? 0 : 12, paddingRight: 0, minHeight: 44 }}>
            {onBack ? (
              <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                <Icon name="chevronLeft" color={p.ink2} size={18} />
              </Pressable>
            ) : null}
            <View ref={titleRef} accessible accessibilityRole="header" style={{ flex: 1 }}>
              <T variant="row" weight="600" numberOfLines={2} style={{ fontSize: 15 }}>{title}</T>
            </View>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => ({ position: 'absolute', right: 0, top: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Icon name="close" color={p.ink2} size={16} />
          </Pressable>
        </View>
      </Glass>
    </View>
  );
}

// --- rows -------------------------------------------------------------------------------------------------------

function Sub({ text }: { text: string }) {
  return <T variant="secondary" tone="ink2" style={{ fontSize: 12, marginBottom: 6, paddingRight: 32 }}>{text}</T>;
}

function Heading({ text }: { text: string }) {
  return <T variant="overline" tone="ink2" accessibilityRole="header" style={{ fontSize: 11, marginTop: 8, marginBottom: 2 }}>{text.toUpperCase()}</T>;
}

function Line({ text, lost }: { text: string; lost?: boolean }) {
  const { palette: p } = useApp();
  return (
    <View accessible style={{ minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
      {lost ? <Icon name="lost" color={p.ink} size={11} strokeWidth={2.6} /> : null}
      <T variant="secondary" style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

/** A person: colour square (Bob) or outlined square (another replicant), name and tags, a note on the right. The row
 * selects him; the chevron opens him. */
function PersonRow({ id, note, onSelect }: { id: string; note: string; onSelect: (id: string) => void }) {
  const { view, palette: p, colourOf } = useApp();
  const open = useOpenBob();
  const isBob = view.info.has(id);
  const kind = isBob ? null : shortKind(view.others.find((o) => o.id === id)?.kind) ?? null;
  const pov = id === view.chapter.narrator;
  const isNew = !!view.info.get(id)?.isNew;
  const label = `${id}${pov ? ', narrator' : ''}${isNew ? ', new' : ''}${kind ? `, ${kind}, not a Bob` : ''}${note ? `. ${note}` : ''}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        onPress={() => onSelect(id)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Shows his route on the map"
        style={({ pressed }) => ({ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.6 : 1 })}>
        {isBob ? <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colourOf(id) }} /> : <View style={{ width: 10, height: 10, borderWidth: 1.5, borderColor: p.ink }} />}
        <View style={{ flex: 1, gap: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <T variant="row" weight="600" numberOfLines={1} style={{ fontSize: 14, flexShrink: 1 }}>{id}</T>
            {pov ? <Tag text="POV" /> : null}
            {isNew ? <Tag text="NEW" solid={false} /> : null}
          </View>
          {kind || note ? <T variant="secondary" tone="ink2" style={{ fontSize: 12 }} numberOfLines={2}>{[kind, note].filter(Boolean).join(' · ')}</T> : null}
        </View>
      </Pressable>
      <Pressable
        onPress={() => (isBob ? open(id) : router.navigate('/others'))}
        accessibilityRole="button"
        accessibilityLabel={isBob ? `Open ${id}` : 'Other replicants'}
        style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
        <Icon name="chevronRight" color={p.ink3} size={14} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

// --- contents ---------------------------------------------------------------------------------------------------

interface ContentProps {
  view: ProgressView;
  state: MapState;
  onSelect: (id: string) => void;
}

function useRoutes(view: ProgressView, t: number) {
  return useMemo(() => routes(view, t), [view, t]);
}

export function PlaceContent({ id, view, state, onSelect }: ContentProps & { id: string }) {
  const t = state.time;
  const hist = useRoutes(view, t);
  const pl = state.places.find((x) => x.id === id) ?? null;
  const narrator = view.chapter.narrator;
  const pos = useMemo(() => placePositions(view.model), [view.model]);
  const me = pos.get(id) ?? null;
  const sub: string[] = [];
  if (pl?.narrator && narrator) sub.push(`${narrator} is here${pl.scut ? ' · on SCUT' : ''}`);
  else {
    const nPlace = state.places.find((x) => x.narrator);
    const there = nPlace ? pos.get(nPlace.id) : null;
    if (me && there && narrator) sub.push(`${Math.round(distanceLy(me, there))} ly from ${narrator}`);
    if (pl?.scut) sub.push('on SCUT');
  }
  if (me && Math.abs(me.z * LY_PER_PC) > 3) sub.push(`${Math.round(Math.abs(me.z * LY_PER_PC))} ly ${me.z > 0 ? 'above' : 'below'} the galactic plane`);
  const people = pl ? [...[...pl.bobs].sort((a, b) => Number(b === narrator) - Number(a === narrator)), ...pl.others] : [];
  const lostBobs = pl?.lost ?? [];
  const lostOthers = view.others.filter((o) => {
    const s = otherStatus(view, o.id, t);
    return s.status === 'lost' && s.place === id;
  });
  return (
    <View>
      {sub.length ? <Sub text={sub.join(' · ')} /> : null}
      {people.length ? people.map((p) => <PersonRow key={p} id={p} note={stayText(hist.get(p), id, t)} onSelect={onSelect} />) : <Line text="Nobody here on this date." />}
      {lostBobs.length || lostOthers.length ? <Heading text="Lost here" /> : null}
      {lostBobs.map((b) => {
        const s = hist.get(b)?.end;
        return <Line key={b} lost text={`${b} · lost${s?.year != null ? ` ${yearText(s.year)}` : ''}`} />;
      })}
      {lostOthers.map((o) => {
        const s = otherStatus(view, o.id, t);
        return <Line key={o.id} lost text={[o.id, shortKind(o.kind), `lost${s.year != null ? ` ${yearText(s.year)}` : ''}`].filter(Boolean).join(' · ')} />;
      })}
    </View>
  );
}

export function BobContent({ id, view, state, onOpen }: ContentProps & { id: string; onOpen: (id: string) => void }) {
  const { palette: p } = useApp();
  const t = state.time;
  const hist = useRoutes(view, t);
  const r = hist.get(id);
  const isBob = view.info.has(id);
  const line = useMemo(() => (isBob ? lineage(view, id, t) : []), [view, id, t, isBob]);
  const voy = state.voyages.find((v) => v.who === id);
  const ghost = state.ghosts.find((g) => g.who === id);
  const kind = isBob ? null : shortKind(view.others.find((o) => o.id === id)?.kind) ?? null;
  const rows: { key: string; text: string; lost?: boolean }[] = [];
  if (r?.made) {
    rows.push({ key: 'made', text: [`Made at ${r.made.place ?? 'a place not given'}`, r.made.year != null ? yearText(r.made.year) : null, r.made.by ? `by ${r.made.by}` : null].filter(Boolean).join(' · ') });
  }
  r?.legs.forEach((l, i) => rows.push({ key: `leg${i}`, text: legText(l) }));
  let now: string;
  if (voy) now = voyageLine(voy, t);
  else if (r?.end.status === 'lost') now = `Lost${r.end.place ? ` at ${r.end.place}` : ''}${r.end.year != null ? ` · ${monthYear(r.end.year)}` : ''}`;
  else if (r?.end.status === 'missing') now = 'Whereabouts unknown';
  else if (r?.end.place) {
    const last = r.legs[r.legs.length - 1];
    const since = last?.to === r.end.place && last.arrived != null ? last.arrived : r.made?.place === r.end.place ? r.made.year : null;
    now = `At ${r.end.place}${since != null ? ` · ${spanText(t - since) === 'just left' ? 'just arrived' : spanText(t - since)}` : ''}`;
  } else now = 'Whereabouts not given on this date';
  const before = line.slice(0, -1);
  return (
    <View>
      {kind ? <Sub text={`${kind} · not a Bob`} /> : null}
      {rows.length ? <Heading text="Travel history" /> : null}
      {rows.map((x) => <Line key={x.key} text={x.text} lost={x.lost} />)}
      <Heading text={`On ${monthYear(t)}`} />
      <Line text={now} lost={r?.end.status === 'lost'} />
      {ghost && view.latest != null ? <Line text={ghostText(ghost, view.latest)} /> : null}
      {before.length ? <Heading text="Before him" /> : null}
      {before.map((e) => <Line key={e.who} text={lineageText(e)} />)}
      {isBob ? (
        <Pressable
          onPress={() => onOpen(id)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${id}`}
          style={({ pressed }) => ({ minHeight: 44, marginTop: 6, marginBottom: 6, borderRadius: 12, backgroundColor: p.ink, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
          <T variant="secondary" weight="600" color={p.inv}>{`Open ${id}`}</T>
        </Pressable>
      ) : (
        <Pressable onPress={() => router.navigate('/others')} accessibilityRole="link" style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <T variant="secondary" weight="600">Other replicants</T>
        </Pressable>
      )}
    </View>
  );
}

export function voyageTitle(state: MapState, key: string): string {
  const g = groupVoyages(state.voyages).find((x) => x.key === key);
  if (!g) return 'Voyage';
  return g.to ? `${g.from ?? 'A place not given'} → ${g.to}` : `From ${g.from ?? 'a place not given'} · destination not given`;
}

export function VoyageContent({ id, state, onSelect }: ContentProps & { id: string }) {
  const g = groupVoyages(state.voyages).find((x) => x.key === id);
  const t = state.time;
  if (!g) return null;
  return (
    <View>
      {g.members.map((m) => {
        const vt = voyageText(m, t);
        const note = [
          vt.out,
          m.departKnown ? `left ${monthYear(m.departed)}` : 'departure not given',
          m.arrives != null ? `arrives ${monthYear(m.arrives)}` : m.to ? 'arrival not given yet' : 'destination not given',
        ]
          .filter(Boolean)
          .join(' · ');
        return <PersonRow key={m.who} id={m.who} note={note} onSelect={onSelect} />;
      })}
    </View>
  );
}

/** Known places with no position, beside the map: what the books say about where each is, and who is there. */
export function OffMapContent({ view, state, onSelect, places }: ContentProps & { places: MapPlace[] }) {
  const t = state.time;
  const hist = useRoutes(view, t);
  const byId = new Map(state.places.map((pl) => [pl.id, pl]));
  const nearOf = new Map((view.model.data.systems ?? []).flatMap((s) => (s.near && s.offsetLy != null ? [[s.id, { near: s.near, offsetLy: s.offsetLy }] as const] : [])));
  return (
    <View>
      {places.map((pl) => (
        <View key={pl.id} style={{ paddingTop: 4 }}>
          <T variant="row" weight="600" style={{ fontSize: 14 }}>{pl.id}</T>
          <T variant="secondary" tone="ink2" style={{ fontSize: 12 }}>{kindWords(pl, byId, nearOf)}</T>
          {[...pl.bobs, ...pl.others].map((p) => <PersonRow key={p} id={p} note={stayText(hist.get(p), pl.id, t)} onSelect={onSelect} />)}
        </View>
      ))}
    </View>
  );
}

export function kindWords(pl: MapPlace, known: Map<string, MapPlace>, near: Map<string, { near: string; offsetLy: number }>): string {
  switch (pl.kind) {
    case 'far':
      return 'Far beyond the local neighbourhood';
    case 'near': {
      // Name the anchor only when the reader has met it.
      const rec = near.get(pl.id);
      return rec && known.has(rec.near) ? `About ${Math.round(rec.offsetLy)} ly from ${rec.near}, direction not given` : 'Position given only relative to another place';
    }
    case 'direction':
      return 'A direction, not a place';
    case 'network':
      return 'A wormhole network';
    case 'fictional':
      return 'The books give no position';
    default:
      return 'Position not given';
  }
}
