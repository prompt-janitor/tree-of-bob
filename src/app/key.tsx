// Marker key. Lists only the marker types that occur at the reader's current position: the timeline marks, then
// the Systems map marks (shared with the key beside the map), checked on both map dates (the chapter date and NOW).
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { filterMapState, mapState, routes, scutLabel, scutNetwork, scutRangeLy } from '@/core';
import { KeyClock, mapKeyItems } from '@/components/map/map-key';

import { Card, Tag } from '@/components/bits';
import { Icon } from '@/components/icon';
import { SheetFrame } from '@/components/sheet';
import { T } from '@/components/text';
import { useApp } from '@/state/app';
import { identityColour } from '@/theme/identity';

export default function KeySheet() {
  const { view, palette: p, colourOf, mapLayers } = useApp();
  const fromMap = useLocalSearchParams<{ from?: string }>().from === 'map';
  const [all, setAll] = useState(!fromMap);
  const infos = [...view.info.values()];
  const c = identityColour(0, p.scheme);
  // The map can show the chapter date or NOW, so a map mark is listed if it occurs on either.
  const dates = [...new Set([view.chapter.time, view.latest].filter((t): t is number => t != null))];
  const states = dates.map((t) => mapState(view, t));
  const narrator = view.chapter.narrator;
  const puckColour = narrator ? colourOf(narrator) : c;
  const hist = view.chapter.time != null ? [...routes(view, view.chapter.time).values()] : [];
  // The SCUT network shade shows only with its layer on (and once SCUT is known).
  const netOn = view.scut.length > 0 && mapLayers.scut === 'volume';
  const netLabel = scutLabel(view);
  const nowDiffers = (() => {
    if (!netOn || view.chapter.flashbackYear == null || view.chapter.time == null || view.latest == null) return false;
    const a = scutNetwork(mapState(view, view.chapter.time)).ids;
    const b = scutNetwork(mapState(view, view.latest)).ids;
    return a.length !== b.length || a.some((id) => !b.includes(id));
  })();
  type Item = { show: boolean; label: string; detail: string; sample: React.ReactNode };
  const items: Item[] = [
    { show: true, label: 'Colour', detail: 'Each narrator has a colour from his first chapter. Other Bobs take the colour of the narrator who introduced them.', sample: <View style={{ width: 8, height: 24, borderRadius: 3, backgroundColor: c }} /> },
    { show: true, label: 'At a system', detail: 'Solid bar: in a star system.', sample: <Svg width={60} height={12}><Rect x={4} y={3} width={52} height={6} rx={3} fill={c} /></Svg> },
    { show: infos.some((i) => i.moves.some((m) => m.kind === 'depart')), label: 'In transit', detail: 'Dashed line: between systems.', sample: <Svg width={60} height={12}><Line x1={4} x2={56} y1={6} y2={6} stroke={c} strokeWidth={2} strokeDasharray="4 3" /></Svg> },
    { show: infos.some((i) => i.bornEstimated), label: 'Estimated date', detail: 'Hatched: creation date not given.', sample: <Svg width={60} height={12}><Line x1={4} x2={56} y1={6} y2={6} stroke={c} strokeWidth={6} strokeDasharray="3 3" /></Svg> },
    { show: true, label: 'NOW', detail: 'Latest story date reached. Timelines stop here.', sample: <View style={{ backgroundColor: p.ink, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}><T variant="tag" color={p.inv}>NOW</T></View> },
    { show: view.chapter.flashbackYear != null, label: 'Chapter date (CH)', detail: 'Dashed rule: this chapter is set before NOW. Rings mark the narrator and Bobs in his system then.', sample: <View style={{ borderWidth: 1.5, borderColor: p.ink, borderRadius: 3, paddingHorizontal: 3 }}><T variant="tag">CH</T></View> },
    { show: !!view.chapter.narrator, label: 'Narrator', detail: 'Tells this chapter. Tinted row, POV tag.', sample: <Tag text="POV" /> },
    { show: view.newHere.bobs.length > 0, label: 'New', detail: 'First appeared in the chapter you just finished.', sample: <Tag text="NEW" /> },
    { show: infos.some((i) => i.status === 'lost'), label: 'Lost', detail: 'Destroyed or dead. Lane ends in a cross.', sample: <Icon name="lost" color={p.ink} size={14} strokeWidth={2.6} /> },
    { show: infos.some((i) => i.status === 'missing'), label: 'Missing', detail: 'Whereabouts unknown.', sample: <T variant="tag">?</T> },
    { show: !!view.scut.length, label: 'SCUT', detail: 'Faster-than-light link between systems.', sample: <Icon name="link" color={p.ink} size={16} strokeWidth={2} /> },
    { show: view.chapter.cast.some((x) => x.remote && !x.isOther), label: 'Calling in', detail: 'Takes part in this chapter from another system.', sample: <Icon name="signal" color={p.ink} size={16} strokeWidth={2} /> },
  ];
  const mapItems = mapKeyItems({
    view, states, layers: mapLayers, palette: p, colour: c, puckColour, history: hist, nowDiffers, netLabel, rangeLy: scutRangeLy(view),
  });
  // Opened from the map: first only what the map draws now (its layers, its date); Show all opens the rest here.
  const date = view.chapter.time ?? view.latest ?? view.maxYear;
  const drawnLayers = view.scut.length ? mapLayers : { ...mapLayers, scut: 'hide' as const };
  const onMap = fromMap
    ? mapKeyItems({
        view, states: [filterMapState(view, mapState(view, date), drawnLayers)], layers: drawnLayers, palette: p, colour: c, puckColour,
        history: drawnLayers.history !== 'hide' ? hist : [], nowDiffers, netLabel, rangeLy: scutRangeLy(view),
      }).filter((i) => i.show && i.beside)
    : [];
  const sections = (
    fromMap && !all
      ? [{ title: 'On the map', rows: onMap }]
      : [
          { title: null, rows: items.filter((i) => i.show) },
          { title: 'Systems map', rows: mapItems.filter((i) => i.show) },
        ]
  ).filter((s) => s.rows.length);
  return (
    <KeyClock active>
      <SheetFrame title="Key">
        {fromMap && !all ? null : <T variant="secondary" tone="ink2">Only markers at your current position are listed.</T>}
        {sections.map((s) => (
          <View key={s.title ?? 'timeline'} style={{ gap: 8 }}>
            {s.title ? <T variant="overline" tone="ink2" accessibilityRole="header">{s.title.toUpperCase()}</T> : null}
            <Card>
              {s.rows.map((i, n) => (
                <View key={i.label} accessible accessibilityLabel={`${i.label}. ${i.detail}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderTopWidth: n ? 1 : 0, borderColor: p.line2 }}>
                  <View style={{ width: 64, alignItems: 'center' }}>{i.sample}</View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="row">{i.label}</T>
                    <T variant="secondary" tone="ink2">{i.detail}</T>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ))}
        {fromMap && !all ? (
          <Pressable onPress={() => setAll(true)} accessibilityRole="button" accessibilityLabel="Show all of the key" style={({ pressed }) => ({ height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: p.line, opacity: pressed ? 0.6 : 1 })}>
            <T variant="secondary" weight="600">Show all</T>
          </Pressable>
        ) : null}
      </SheetFrame>
    </KeyClock>
  );
}
