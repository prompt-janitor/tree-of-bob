// Systems view: the map takes the whole content area and shows where everyone is on the chapter date and how each
// got there (travel history, as the Tree shows ancestry). Floating over it: the chapter header card, the Key button,
// the tools (level, list, recentre), the "off the map" pill and one callout at a time. The full text equivalent is the
// list modal (/systems-list).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Glass } from '@/components/glass';
import { Icon } from '@/components/icon';
import { ChapterHeaderCard } from '@/components/map/chapter-header-card';
import { BobContent, CalloutFrame, OffMapContent, PlaceContent, VoyageContent, voyageTitle } from '@/components/map/map-callout';
import { useMapFocusRequests } from '@/components/map/map-requests';
import { NarratorPuck } from '@/components/map/narrator-puck';
import { COMPASS_R, compassAt } from '@/components/map/scene';
import { StarMap } from '@/components/map/star-map';
import type { MapHit, MapLevel, PivotRequest } from '@/components/map/types';
import { useContentInsets } from '@/components/screen';
import { T } from '@/components/text';
import { filterMapState, groupVoyages, LAYER_KEYS, mapState, type LayerMode } from '@/core';
import { useLayout } from '@/hooks/use-layout';
import { useOpenBob } from '@/hooks/use-open-bob';
import { useApp } from '@/state/app';

/** floating: the target is not drawn on this level, so the callout has no pointer. */
type Callout = { hit: MapHit; from?: MapHit; floating?: boolean } | { offmap: true };

export default function SystemsScreen() {
  const { view, palette: p, selected, select, setNavCompact, colourOf, mapLayers, setMapLayers, mapLock, setMapLock } = useApp();
  const { compact } = useLayout();
  const safe = useSafeAreaInsets();
  const pad = useContentInsets();
  const open = useOpenBob();

  const date = view.chapter.time ?? view.latest ?? view.maxYear;
  // The header card counts the whole map; everything drawn and tappable uses only the layers that are on.
  const fullState = useMemo(() => mapState(view, date), [view, date]);
  const state = useMemo(() => filterMapState(view, fullState, mapLayers), [view, fullState, mapLayers]);
  const [layersOpen, setLayersOpen] = useState(false);
  const groups = useMemo(() => groupVoyages(state.voyages), [state]);
  // Galaxy is offered only once the reader has met a place outside the local neighbourhood.
  const hasFar = state.places.some((pl) => pl.pos && !pl.local);
  const unplaced = state.places.filter((pl) => !pl.pos);
  const narrator = view.chapter.narrator;

  const [levelRaw, setLevel] = useState<MapLevel>('local');
  const level: MapLevel = hasFar ? levelRaw : 'local';
  const [pivot, setPivot] = useState<PivotRequest>({ n: 0, target: null });
  const pivotTo = (target: MapHit | null) => setPivot((r) => ({ n: r.n + 1, target }));
  const [calloutRaw, setCallout] = useState<Callout | null>(null);
  const [selRaw, setSel] = useState<string | null>(null);
  const [offDefault, setOffDefault] = useState(false);
  const [area, setArea] = useState({ w: 0, h: 0 });
  // Measured heights of the header card (it wraps to two lines on a phone) and the off-map pill's width.
  const [headerH, setHeaderH] = useState(56);
  const [pillW, setPillW] = useState(0);

  // A chapter change closes the callout. Stepping back can hide a place, a Bob or a voyage: anything that names one
  // is dropped without comment.
  const [index, setIndex] = useState(view.index);
  if (index !== view.index) {
    setIndex(view.index);
    setCallout(null);
  }
  const knownWho = (id: string) => view.info.has(id) || view.others.some((o) => o.id === id);
  const valid = (h: MapHit) =>
    h.kind === 'place' ? state.places.some((pl) => pl.id === h.id) : h.kind === 'voyage' ? groups.some((g) => g.key === h.id) : knownWho(h.id);
  const callout = calloutRaw && ('offmap' in calloutRaw ? (unplaced.length ? calloutRaw : null) : valid(calloutRaw.hit) ? calloutRaw : null);
  const calloutHit = callout && 'hit' in callout ? callout.hit : null;
  // Lineage mode: the Bob in the open callout, else the one picked last, else (iPad) the one in the drawer.
  const sel = selRaw && knownWho(selRaw) ? selRaw : null;
  const selectedBob = (calloutHit?.kind === 'bob' ? calloutHit.id : null) ?? sel ?? (!compact ? selected : null);

  useFocusEffect(
    useCallback(() => {
      if (compact) setNavCompact(false);
    }, [compact, setNavCompact]),
  );

  // Stable handlers: the map rebuilds its gestures when they change, which must not happen mid-gesture.
  const info = view.info;
  const onPress = useCallback(
    (hit: MapHit, anchored: boolean) => {
      if (hit.kind === 'bob') {
        setSel(hit.id);
        // iPad with the Bob drawer open: the drawer carries him, so no callout.
        if (!compact && selected && info.has(hit.id)) {
          select(hit.id);
          setCallout(null);
          return;
        }
      }
      setCallout({ hit, floating: !anchored });
    },
    [compact, selected, info, select],
  );
  const onUnanchored = useCallback((target: MapHit) => {
    setCallout((c) => (c && 'hit' in c && c.hit.kind === target.kind && c.hit.id === target.id ? { ...c, floating: true } : c));
  }, []);
  const hasCallout = !!callout;
  const onPressEmpty = useCallback(() => {
    setLayersOpen(false);
    if (hasCallout) setCallout(null);
    else setSel(null);
  }, [hasCallout]);
  const onPanStart = useCallback(() => setCallout(null), []);
  const recentre = () => {
    setCallout(null);
    setSel(null);
    pivotTo(null);
  };
  const onLevel = (l: MapLevel) => {
    setLevel(l);
    setCallout(null);
  };
  const showNarrator = () => {
    const pl = state.places.find((x) => x.narrator);
    const g = narrator ? groups.find((x) => x.members.some((m) => m.who === narrator)) : null;
    const target: MapHit | null = pl
      ? { kind: 'place', id: pl.id }
      : g
        ? { kind: 'voyage', id: g.key }
        : !narrator && view.chapter.system && state.places.some((x) => x.id === view.chapter.system)
          ? { kind: 'place', id: view.chapter.system }
          : null;
    if (!target) return recentre();
    if (target.kind === 'place' && !state.places.find((x) => x.id === target.id)?.pos) {
      setCallout({ offmap: true });
      return;
    }
    pivotTo(target);
    setCallout({ hit: target });
  };
  const focusPlace = (id: string) => {
    const pl = state.places.find((x) => x.id === id);
    if (!pl) return;
    if (!pl.pos) {
      setCallout({ offmap: true });
      return;
    }
    if (hasFar) setLevel(pl.local ? 'local' : 'galaxy');
    pivotTo({ kind: 'place', id });
    setCallout({ hit: { kind: 'place', id } });
  };
  useMapFocusRequests(focusPlace);
  const selectFromCallout = (id: string) => {
    setSel(id);
    const from = calloutHit && calloutHit.kind !== 'bob' ? calloutHit : undefined;
    if (!compact && selected && view.info.has(id)) {
      select(id);
      setCallout(null);
      return;
    }
    if (!(callout && 'offmap' in callout)) pivotTo({ kind: 'bob', id });
    setCallout({ hit: { kind: 'bob', id }, from });
  };
  const back = () => {
    if (!callout || !('hit' in callout) || !callout.from) return;
    pivotTo(callout.from);
    setCallout({ hit: callout.from });
  };
  const showList = () => router.push('/systems-list');

  // --- layout
  const W = area.w;
  const H = area.h;
  const header = compact ? { top: safe.top + 8, left: 16, right: 16 + 44 + 8 } : { top: 12, left: 12, width: Math.min(420, W * 0.5) };
  const headerBottom = header.top + headerH;
  const toolsBottom = compact ? Math.max(0, pad.bottom - 20) : 0;
  const insets = compact
    ? { top: headerBottom + 8, right: 16, bottom: Math.max(0, pad.bottom - 24), left: 16 }
    : { top: Math.max(80, headerBottom + 12), right: 16, bottom: pad.bottom, left: 16 };
  const innerH = Math.max(80, H - insets.top - insets.bottom);
  const cx = insets.left + Math.max(80, W - insets.left - insets.right) / 2;
  const cy = insets.top + innerH / 2;
  const bottomLimit = compact ? H - toolsBottom - 8 : H - pad.bottom + 10;
  const calloutWidth = compact ? Math.min(320, W - 32) : 340;
  const spaceAbove = cy - headerBottom - 8 - 14;
  const spaceBelow = bottomLimit - cy - 14;
  const below = spaceAbove < H * 0.4 && spaceBelow > spaceAbove;
  const calloutMax = Math.max(120, Math.min(H * 0.5, below ? spaceBelow : spaceAbove));
  const pillBottom = compact ? toolsBottom : 96;
  const pillPeople = unplaced.reduce((n, pl) => n + pl.bobs.length + pl.others.length, 0);
  const narratorOffMap = unplaced.some((pl) => pl.narrator);
  // The floating controls, so the map keeps its labels out from under them.
  const nUnplaced = unplaced.length;
  const nTools = (hasFar ? 1 : 0) + 3 + (compact ? 0 : 1);
  const toolSize = compact ? 44 : 48;
  const headerR = compact ? W - (header.right ?? 0) : (header.left ?? 0) + (header.width ?? 0);
  // (The React Compiler memoizes these, so the map re-records its picture only when they change.)
  const chrome: { l: number; t: number; r: number; b: number }[] = [];
  if (W && H) {
    chrome.push({ l: header.left ?? 0, t: header.top, r: headerR, b: header.top + headerH });
    if (compact) {
      chrome.push({ l: W - 16 - 44, t: safe.top + 14, r: W - 16, b: safe.top + 58 });
      const th = nTools * 44 + (nTools - 1) * 8;
      chrome.push({ l: W - 16 - 44, t: H - toolsBottom - th, r: W - 16, b: H - toolsBottom });
    } else {
      chrome.push({ l: W - 16 - nTools * toolSize - (nTools - 1) * 8, t: 16, r: W - 16, b: 16 + toolSize });
    }
    if (nUnplaced) chrome.push({ l: 16, t: H - pillBottom - 44, r: 16 + (pillW || 200), b: H - pillBottom });
  }
  // The distance scale bar's fixed spot: bottom left of the map, above the off-map pill (the only distance cue), with
  // room under it for the viewport diameter line.
  const scaleBar = W && H ? { x: 20, y: H - pillBottom - (nUnplaced ? 44 + 14 : 14) - 12 } : null;
  // The galaxy locator above it is the recentre control (drawn by the map; this button covers it).
  const locator = compassAt(scaleBar);

  let calloutView: ReactNode = null;
  if (callout && W > 0) {
    const common = { view, state, onSelect: selectFromCallout };
    const close = () => setCallout(null);
    if ('offmap' in callout) {
      calloutView = (
        <CalloutFrame
          x={16 + calloutWidth / 2}
          y={H - pillBottom - 44 - 4}
          below={false}
          pointer={false}
          width={calloutWidth}
          maxHeight={Math.min(H * 0.5, H - pillBottom - 44 - headerBottom - 24)}
          screenWidth={W}
          screenHeight={H}
          title="Off the map"
          onClose={close}>
          <OffMapContent {...common} places={unplaced} />
        </CalloutFrame>
      );
    } else {
      const { hit } = callout;
      const title = hit.kind === 'place' ? hit.id : hit.kind === 'voyage' ? voyageTitle(state, hit.id) : hit.id;
      calloutView = (
        <CalloutFrame
          x={cx}
          y={cy}
          below={below}
          pointer={!callout.floating}
          width={calloutWidth}
          maxHeight={calloutMax}
          screenWidth={W}
          screenHeight={H}
          title={title}
          onClose={close}
          onBack={callout.from ? back : undefined}>
          {hit.kind === 'place' ? <PlaceContent {...common} id={hit.id} /> : null}
          {hit.kind === 'voyage' ? <VoyageContent {...common} id={hit.id} /> : null}
          {hit.kind === 'bob' ? <BobContent {...common} id={hit.id} onOpen={open} /> : null}
        </CalloutFrame>
      );
    }
  }

  const levelButton = hasFar ? (
    <ToolButton
      label={level === 'local' ? 'Show the galaxy' : 'Show the local neighbourhood'}
      selected={level === 'galaxy'}
      onPress={() => onLevel(level === 'local' ? 'galaxy' : 'local')}
      size={compact ? 44 : 48}>
      <LevelGlyph galaxy={level === 'local'} />
    </ToolButton>
  ) : null;
  const listButton = (
    <ToolButton label="List everyone" onPress={showList} size={compact ? 44 : 48}>
      <Icon name="log" color={p.ink} size={20} />
    </ToolButton>
  );
  const layersButton = (
    <ToolButton label="Layers" onPress={() => setLayersOpen((o) => !o)} size={compact ? 44 : 48} selected={layersOpen}>
      <LayersGlyph />
    </ToolButton>
  );
  // Locked: two fingers only zoom, so the centre stays on the narrator (or the place last tapped). Filled while locked.
  const lockButton = (
    <ToolButton label={mapLock ? 'Unlock the centre' : 'Lock the centre'} onPress={() => setMapLock(!mapLock)} size={compact ? 44 : 48} active={mapLock}>
      <LockGlyph locked={mapLock} />
    </ToolButton>
  );
  const layerRows: { key: (typeof LAYER_KEYS)[number]; label: string }[] = [
    { key: 'bobs', label: 'Bobs' },
    { key: 'others', label: 'Others' },
    { key: 'journeys', label: 'Journeys' },
    { key: 'history', label: 'Travel history' },
    { key: 'names', label: 'Names' },
    { key: 'empty', label: 'Empty systems' },
    { key: 'presence', label: 'Colonies' },
  ];
  const modes: { mode: LayerMode; label: string; w: number }[] = [
    { mode: 'chapter', label: 'Chapter', w: 66 },
    { mode: 'show', label: 'Show', w: 52 },
    { mode: 'hide', label: 'Hide', w: 52 },
  ];
  const layersPanel = layersOpen ? (
    <Glass
      style={[
        { position: 'absolute', borderRadius: 20, paddingVertical: 6 },
        compact ? { left: 16, right: 16 + 44 + 8, bottom: toolsBottom } : { right: 16, top: 16 + 48 + 8, width: 320 },
      ]}>
      {layerRows.map((r) => (
        <View key={r.key} accessibilityRole="radiogroup" accessibilityLabel={r.label} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 8, gap: 8 }}>
          <T variant="secondary" weight="600" style={{ flex: 1 }}>{r.label}</T>
          <View style={{ flexDirection: 'row', borderRadius: 12, backgroundColor: p.line }}>
            {modes.map((m) => {
              const on = mapLayers[r.key] === m.mode;
              return (
                <Pressable
                  key={m.mode}
                  onPress={() => setMapLayers({ ...mapLayers, [r.key]: m.mode })}
                  accessibilityRole="radio"
                  accessibilityLabel={`${r.label}: ${m.label}`}
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => ({ width: m.w, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                  <View style={{ position: 'absolute', top: 6, bottom: 6, left: 2, right: 2, borderRadius: 9, backgroundColor: on ? p.ink : 'transparent' }} />
                  <T variant="secondary" weight="600" color={on ? p.inv : p.ink}>{m.label}</T>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </Glass>
  ) : null;
  const keyButton = (
    <ToolButton label="Map key" onPress={() => router.push('/key')} size={compact ? 44 : 48}>
      <T variant="secondary" weight="700">Key</T>
    </ToolButton>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: p.bg }} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <StarMap
          view={view}
          state={state}
          level={level}
          pivot={pivot}
          selectedBob={selectedBob}
          callout={calloutHit}
          onPress={onPress}
          onPressEmpty={onPressEmpty}
          onPanStart={onPanStart}
          onOffDefault={setOffDefault}
          onUnanchored={onUnanchored}
          locked={mapLock}
          layers={mapLayers}
          fitState={fullState}
          insets={insets}
          chrome={chrome}
          scaleBar={scaleBar}
          style={{ flex: 1 }}
        />
      </View>

      <View style={[{ position: 'absolute' }, header]} onLayout={(e) => setHeaderH(Math.round(e.nativeEvent.layout.height))}>
        <ChapterHeaderCard state={fullState} onPress={showNarrator} onShowList={showList} />
      </View>

      {compact ? (
        <>
          <View style={{ position: 'absolute', top: safe.top + 8 + 6, right: 16 }}>{keyButton}</View>
          <View pointerEvents="box-none" style={{ position: 'absolute', right: 16, bottom: toolsBottom, gap: 8 }}>
            {levelButton}
            {listButton}
            {layersButton}
            {lockButton}
          </View>
        </>
      ) : (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 16, right: 16, flexDirection: 'row', gap: 8 }}>
          {levelButton}
          {listButton}
          {layersButton}
          {lockButton}
          {keyButton}
        </View>
      )}

      {unplaced.length ? (
        <Glass
          interactive
          onLayout={(e) => setPillW(Math.round(e.nativeEvent.layout.width))}
          style={{ position: 'absolute', left: 16, bottom: pillBottom, height: 44, borderRadius: 22, maxWidth: compact ? W - 16 - 16 - 44 - 12 : 360 }}>
          <Pressable
            onPress={() => setCallout(callout && 'offmap' in callout ? null : { offmap: true })}
            accessibilityRole="button"
            accessibilityLabel={`${pillText(unplaced.length, pillPeople)}. Places the books give no position for`}
            accessibilityState={{ expanded: !!(callout && 'offmap' in callout) }}
            style={({ pressed }) => ({ height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, paddingRight: 14, opacity: pressed ? 0.6 : 1 })}>
            {narratorOffMap && narrator ? (
              <NarratorPuck colour={colourOf(narrator)} size={20} />
            ) : (
              <Svg width={18} height={18}>
                <Circle cx={9} cy={9} r={6.5} fill="none" stroke={p.ink} strokeWidth={1.5} strokeDasharray="1.5 2.5" strokeLinecap="round" />
              </Svg>
            )}
            <T variant="secondary" weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>{pillText(unplaced.length, pillPeople)}</T>
          </Pressable>
        </Glass>
      ) : null}

      {locator ? (
        <Pressable
          onPress={recentre}
          accessibilityRole="button"
          accessibilityLabel={narrator ? `Recentre on ${narrator}` : 'Recentre the map'}
          accessibilityValue={offDefault ? { text: 'moved' } : undefined}
          style={{ position: 'absolute', left: locator.x - COMPASS_R - 4, top: locator.y - COMPASS_R - 4, width: COMPASS_R * 2 + 8, height: COMPASS_R * 2 + 8, borderRadius: COMPASS_R + 4 }}>
          {offDefault ? (
            // Moved away from the default view: a small location arrow, lower left, says a tap will bring it back.
            <View pointerEvents="none" style={{ position: 'absolute', left: 2, bottom: 2, width: 20, height: 20, borderRadius: 10, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={13} height={13} viewBox="0 0 24 24">
                <Path d="M21 3L3 10.5l7.6 2.9L13.5 21 21 3z" fill={p.ink} stroke={p.ink} strokeWidth={1.5} strokeLinejoin="round" />
              </Svg>
            </View>
          ) : null}
        </Pressable>
      ) : null}
      {calloutView}
      {layersPanel}
    </GestureHandlerRootView>
  );
}

function pillText(places: number, people: number): string {
  const pl = `${places} ${places === 1 ? 'place' : 'places'}`;
  return people ? `Off the map: ${people} at ${pl}` : `${pl} off the map`;
}

/** A round glass tool button. dot: a small ink dot (the camera is away from its default). active: an on/off option
 * that is on, shown as a filled ink disc (the glyph draws in the inverse colour). */
function ToolButton({ label, onPress, children, size, selected, dot, active }: { label: string; onPress: () => void; children: ReactNode; size: number; selected?: boolean; dot?: boolean; active?: boolean }) {
  const { palette: p } = useApp();
  return (
    <Glass interactive style={{ width: size, height: size, borderRadius: size / 2 }}>
      {active ? <View pointerEvents="none" style={{ position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: size / 2 - 4, backgroundColor: p.ink }} /> : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={selected != null ? { selected } : undefined}
        accessibilityValue={dot ? { text: 'moved' } : undefined}
        style={({ pressed }) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
        {children}
      </Pressable>
      {dot ? <View pointerEvents="none" style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: p.ink }} /> : null}
    </Glass>
  );
}

/** Three stacked sheets. */
function LayersGlyph() {
  const { palette: p } = useApp();
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 4l8.5 4.5L12 13 3.5 8.5 12 4z" stroke={p.ink} strokeWidth={1.7} strokeLinejoin="round" />
      <Path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5" stroke={p.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A padlock, closed or open (drawn in the inverse colour on the filled button while locked). */
function LockGlyph({ locked }: { locked: boolean }) {
  const { palette: p } = useApp();
  const c = locked ? p.inv : p.ink;
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={10.5} width={14} height={10} rx={2} stroke={c} strokeWidth={1.8} />
      <Path d={locked ? 'M8 10.5V7.5a4 4 0 0 1 8 0v3' : 'M8 10.5V7.5a4 4 0 0 1 7.6-1.7'} stroke={c} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** Galaxy: a tilted disc with a bulge. Local: a few stars over a floor line. */
function LevelGlyph({ galaxy }: { galaxy: boolean }) {
  const { palette: p } = useApp();
  return galaxy ? (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 12c3.5-3.5 8.5-1 8 3M12 12c-3.5 3.5-8.5 1-8-3M12 12c-1-4 2-7.5 5.5-7M12 12c1 4-2 7.5-5.5 7" stroke={p.ink} strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx={12} cy={12} r={2} fill={p.ink} />
    </Svg>
  ) : (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={7} cy={9} r={1.8} fill={p.ink} />
      <Circle cx={15.5} cy={6.5} r={1.8} fill={p.ink} />
      <Circle cx={13} cy={14} r={1.8} fill={p.ink} />
      <Path d="M3 19.5h18" stroke={p.ink} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}
