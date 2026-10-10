// The Systems list: the same facts as the map, as text, in sections; the complete text equivalent of the map (it
// opens as a modal from the map's List button). Built only from the map state, the travel history and the progress
// view, so it can't say more than the map does. A Bob row opens him; a system row shows it on the map.
import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { shortKind, Tag } from '@/components/bits';
import { Icon } from '@/components/icon';
import { ghostText, kindWords, stayText, voyageLine } from '@/components/map/map-callout';
import { T } from '@/components/text';
import { locAt, otherStatus, routes, yearText, type MapPlace, type MapState, type MapVoyage, type ProgressView, type Route } from '@/core';
import { useOpenBob } from '@/hooks/use-open-bob';
import { useApp } from '@/state/app';

export interface SystemsListProps {
  state: MapState;
  onFocusPlace: (id: string) => void;
}

/** Where his route says he came from, for a Bob at a place: "from Epsilon Eridani · here 6 months", "made here". */
function routeNote(r: Route | undefined, place: string, t: number): string {
  return stayText(r, place, t);
}

export function SystemsList({ state, onFocusPlace }: SystemsListProps) {
  const { view, palette: p } = useApp();
  const t = state.time;
  const narrator = view.chapter.narrator;
  const hist = useMemo(() => routes(view, t), [view, t]);
  const placeById = new Map(state.places.map((pl) => [pl.id, pl]));
  const kindOf = new Map(view.others.map((o) => [o.id, shortKind(o.kind) ?? null]));
  const nearOf = new Map((view.model.data.systems ?? []).flatMap((s) => (s.near && s.offsetLy != null ? [[s.id, { near: s.near, offsetLy: s.offsetLy }] as const] : [])));
  const travelling = view.chapter.travelling;

  const narratorPlace = state.places.find((pl) => pl.narrator) ?? null;
  const narratorVoyage = narrator ? state.voyages.find((v) => v.who === narrator && !v.isOther) ?? null : null;
  const systems = state.places.filter((pl) => pl.bobs.length || pl.others.length);
  const transit = state.voyages.filter((v) => v.isOther || v.who !== narrator);
  const unplaced = state.places.filter((pl) => !pl.pos);
  const lost = lostAt(view, t);
  const lostOthers = view.others.flatMap((o) => {
    const s = otherStatus(view, o.id, t);
    return s.status === 'lost' ? [{ id: o.id, kind: shortKind(o.kind) ?? null, place: s.place, year: s.year }] : [];
  });
  const missing = view.ids.filter((id) => locAt(view, id, t)?.status === 'missing');
  const now = view.latest;

  return (
    <View style={{ gap: 18 }}>
      <Section title="In this chapter">
        {narrator ? (
          <BobRow id={narrator} tag="POV" text={narratorText(view, narrator, t, narratorPlace, narratorVoyage, narratorPlace ? routeNote(hist.get(narrator), narratorPlace.id, t) : '')} />
        ) : (
          <Note text={view.chapter.system ? `Narrated by someone who isn't a Bob. Set at ${view.chapter.system}.` : "Narrated by someone who isn't a Bob."} />
        )}
        {travelling.length ? <Note text={`Travelling with him: ${travelling.join(', ')}`} /> : null}
      </Section>

      {systems.length ? (
        <Section title="Systems" count={systems.length}>
          {systems.map((pl, i) => (
            <SystemBlock key={pl.id} place={pl} first={i === 0} narrator={narrator} kindOf={kindOf} hist={hist} t={t} onFocusPlace={onFocusPlace} />
          ))}
        </Section>
      ) : null}

      {transit.length ? (
        <Section title="In transit" count={transit.length}>
          {transit.map((v) =>
            v.isOther ? <OtherRow key={v.who} id={v.who} kind={kindOf.get(v.who) ?? null} text={voyageLine(v, t)} /> : <BobRow key={v.who} id={v.who} text={voyageLine(v, t)} />,
          )}
        </Section>
      ) : null}

      {state.ghosts.length && now != null ? (
        <Section title="Known later" count={state.ghosts.length}>
          {state.ghosts.map((g) =>
            g.isOther ? (
              <OtherRow key={g.who} id={g.who} kind={kindOf.get(g.who) ?? null} text={ghostText(g, now)} />
            ) : (
              <BobRow key={g.who} id={g.who} text={ghostText(g, now)} lost={g.to.status === 'lost'} />
            ),
          )}
        </Section>
      ) : null}

      {unplaced.length ? (
        <Section title="Not on the map" count={unplaced.length}>
          {unplaced.map((pl) => (
            <View key={pl.id} accessible accessibilityLabel={`${pl.id}: ${kindWords(pl, placeById, nearOf)}`} style={{ minHeight: 44, justifyContent: 'center', paddingVertical: 6, gap: 1 }}>
              <T variant="row" style={{ fontSize: 14 }}>{pl.id}</T>
              <T variant="secondary" tone="ink2">{kindWords(pl, placeById, nearOf)}</T>
            </View>
          ))}
        </Section>
      ) : null}

      {lost.length || lostOthers.length ? (
        <Section title="Lost" count={lost.length + lostOthers.length}>
          {lost.map((l) => (
            <BobRow key={l.id} id={l.id} lost text={[l.place ? `Lost at ${l.place}` : 'Lost', l.year != null ? yearText(l.year) : null].filter(Boolean).join(' · ')} />
          ))}
          {lostOthers.map((o) => (
            <OtherRow key={o.id} id={o.id} kind={o.kind} lost text={[o.place ? `Lost at ${o.place}` : 'Lost', o.year != null ? yearText(o.year) : null].filter(Boolean).join(' · ')} />
          ))}
        </Section>
      ) : null}

      {missing.length ? (
        <Section title="Missing" count={missing.length}>
          {missing.map((id) => <BobRow key={id} id={id} text="Whereabouts unknown" />)}
        </Section>
      ) : null}

      {view.others.length ? (
        <Section title="Other replicants" count={view.others.length}>
          {view.others.map((o) => (
            <OtherRow key={o.id} id={o.id} kind={shortKind(o.kind) ?? null} lost={otherStatus(view, o.id, t).status === 'lost'} text={otherWhere(view, o.id, state)} />
          ))}
          <Pressable
            onPress={() => router.navigate('/others')}
            accessibilityRole="link"
            accessibilityLabel="All other replicants and AIs"
            style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.6 : 1 })}>
            <T variant="secondary" weight="600" style={{ flex: 1 }}>All other replicants and AIs</T>
            <Icon name="chevronRight" color={p.ink3} size={14} strokeWidth={2.2} />
          </Pressable>
        </Section>
      ) : null}
    </View>
  );
}

// --- text ---------------------------------------------------------------------------------------------------

function narratorText(view: ProgressView, id: string, t: number, place: MapPlace | null, voyage: MapVoyage | null, route: string): string {
  if (place) return [`At ${place.id}`, route].filter(Boolean).join(' · ');
  if (voyage) return voyageLine(voyage, t);
  const s = locAt(view, id, t);
  if (s && !s.notYet && s.status === 'lost') return 'Lost';
  if (s && !s.notYet && s.status === 'missing') return 'Whereabouts unknown';
  return 'Location not given';
}

function otherWhere(view: ProgressView, id: string, state: MapState): string {
  const at = state.places.find((pl) => pl.others.includes(id));
  if (at) return `At ${at.id}`;
  const v = state.voyages.find((x) => x.isOther && x.who === id);
  if (v) return voyageLine(v, state.time);
  const s = otherStatus(view, id, state.time);
  if (s.status === 'lost') return `Lost${s.place ? ` at ${s.place}` : ''}${s.year != null ? ` · ${yearText(s.year)}` : ''}`;
  return 'Whereabouts not given on this date';
}

function lostAt(view: ProgressView, t: number): { id: string; place: string | null; year: number | null }[] {
  const out: { id: string; place: string | null; year: number | null }[] = [];
  for (const id of view.ids) {
    const s = locAt(view, id, t);
    if (s && !s.notYet && s.status === 'lost') out.push({ id, place: s.loc, year: s.lostAt });
  }
  return out;
}

// --- pieces -------------------------------------------------------------------------------------------------

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <T variant="overline" tone="ink2" accessibilityRole="header" style={{ textTransform: 'uppercase' }}>{title}</T>
        {count != null ? <T variant="data" tone="ink3">{count}</T> : null}
      </View>
      {children}
    </View>
  );
}

function Note({ text }: { text: string }) {
  return <T variant="secondary" tone="ink2">{text}</T>;
}

function SystemBlock({ place, first, narrator, kindOf, hist, t, onFocusPlace }: { place: MapPlace; first: boolean; narrator: string | null; kindOf: Map<string, string | null>; hist: Map<string, Route>; t: number; onFocusPlace: (id: string) => void }) {
  const { palette: p } = useApp();
  const n = place.bobs.length + place.others.length;
  const summary = `${place.id}, ${n} here${place.narrator ? ', narrator here' : ''}${place.scut ? ', on SCUT' : ''}${place.pos ? '' : ', not on the map'}`;
  const bobs = [...place.bobs].sort((a, b) => Number(b === narrator) - Number(a === narrator));
  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
      <T variant="row" weight="700" style={{ flexShrink: 1 }}>{place.id}</T>
      <T variant="data" tone="ink3">{n}</T>
      {place.narrator ? <Tag text="POV HERE" /> : null}
      {place.scut ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Icon name="link" color={p.ink2} size={13} strokeWidth={2} />
          <T variant="tag" tone="ink2">SCUT</T>
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      <T variant="secondary" tone="ink3">{place.pos ? 'Show' : 'Not on the map'}</T>
    </View>
  );
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderColor: p.line2, paddingBottom: 4 }}>
      <Pressable
        onPress={() => onFocusPlace(place.id)}
        accessibilityRole="button"
        accessibilityLabel={summary}
        accessibilityHint={place.pos ? 'Shows this system on the map' : 'Shows the places off the map'}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
        {head}
      </Pressable>
      {bobs.map((id) => <BobRow key={id} id={id} tag={id === narrator ? 'POV' : undefined} text={routeNote(hist.get(id), place.id, t)} compact />)}
      {place.others.map((id) => <OtherRow key={id} id={id} kind={kindOf.get(id) ?? null} text={routeNote(hist.get(id), place.id, t)} compact />)}
    </View>
  );
}

/** A Bob with one line of facts. The row opens him. */
function BobRow({ id, text, tag, lost, compact }: { id: string; text: string; tag?: string; lost?: boolean; compact?: boolean }) {
  const { palette: p, colourOf } = useApp();
  const open = useOpenBob();
  return (
    <Pressable
      onPress={() => open(id)}
      accessibilityRole="button"
      accessibilityLabel={`${id}${tag === 'POV' ? ', narrator' : ''}${lost ? ', lost' : ''}${text ? `. ${text}` : ''}`}
      accessibilityHint="Opens his details"
      style={({ pressed }) => ({ minHeight: compact ? 44 : 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 6, paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}>
      {lost ? (
        <View style={{ width: 12, alignItems: 'center' }}>
          <Icon name="lost" color={p.ink} size={12} strokeWidth={2.6} />
        </View>
      ) : (
        <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: colourOf(id) }} />
      )}
      <View style={{ flex: 1, gap: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T variant="row" style={{ fontSize: 14 }} numberOfLines={1}>{id}</T>
          {tag ? <Tag text={tag} /> : null}
        </View>
        {text ? <T variant="secondary" tone="ink2">{text}</T> : null}
      </View>
      <Icon name="chevronRight" color={p.ink3} size={14} strokeWidth={2.2} />
    </Pressable>
  );
}

/** Another replicant with one line of facts: outlined square marker (a cross when lost), ink only. */
function OtherRow({ id, kind, text, lost, compact }: { id: string; kind: string | null; text: string; lost?: boolean; compact?: boolean }) {
  const p = useApp().palette;
  return (
    <View accessible accessibilityLabel={`${id}${kind ? `, ${kind}` : ''}, not a Bob${lost ? ', lost' : ''}. ${text}`} style={{ minHeight: compact ? 44 : 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 6, paddingVertical: 4 }}>
      {lost ? (
        <View style={{ width: 11, alignItems: 'center' }}>
          <Icon name="lost" color={p.ink} size={11} strokeWidth={2.6} />
        </View>
      ) : (
        <View style={{ width: 11, height: 11, borderWidth: 1.5, borderColor: p.ink }} />
      )}
      <View style={{ flex: 1, gap: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <T variant="row" weight="500" style={{ fontSize: 14, flexShrink: 0, maxWidth: '70%' }} numberOfLines={1}>{id}</T>
          {kind ? <T variant="data" tone="ink3" style={{ fontSize: 11, flexShrink: 1 }} numberOfLines={1}>{kind}</T> : null}
        </View>
        {text ? <T variant="secondary" tone="ink2">{text}</T> : null}
      </View>
    </View>
  );
}
