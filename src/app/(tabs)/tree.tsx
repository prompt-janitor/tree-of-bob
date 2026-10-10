// Tree view: "Who is this Bob, and who made him?" Lineage outline with a life lane per row on one shared axis.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type FlatList, Pressable, View, type ViewToken } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { GroupRow, LaneRow, TimeAxisBar } from '@/components/lanes';
import { Menu, type MenuOption } from '@/components/menu';
import { useContentInsets, useNavScroll } from '@/components/screen';
import { T } from '@/components/text';
import { Tag } from '@/components/bits';
import { ancestors, axisFor, filterSystems, treeRows, type LocationFilter, type TreeRow, type Zoom } from '@/core';
import { useLayout } from '@/hooks/use-layout';
import { useOpenBob } from '@/hooks/use-open-bob';
import { useApp } from '@/state/app';

const ZOOM_LABEL: Record<Zoom, string> = { all: 'All years', recent: 'Last 40 years', chapter: 'Around chapter' };

function filterLabel(f: LocationFilter): string {
  switch (f.kind) {
    case 'everyone': return 'Everyone';
    case 'alive': return 'Alive';
    case 'system': return `At ${f.name}`;
    case 'transit': return 'In transit';
    case 'missing': return 'Missing';
    case 'lost': return 'Lost';
  }
}

export default function TreeScreen() {
  const { view, palette: p, treeToggles, toggleTreeRow, filter, setFilter, zoom, setZoom, selected, toggleSelected, select, colourOf } = useApp();
  const { compact, dense, largeText, width } = useLayout();
  const pad = useContentInsets();
  const onScroll = useNavScroll();
  const open = useOpenBob();
  const [menu, setMenu] = useState<null | 'filter' | 'zoom'>(null);
  const [topRow, setTopRow] = useState<string | null>(null);
  const [listWidth, setListWidth] = useState(0);
  const list = useRef<FlatList<TreeRow>>(null);

  const rows = useMemo(() => treeRows(view, treeToggles, filter, selected), [view, treeToggles, filter, selected]);
  const axis = useMemo(() => axisFor(view, zoom), [view, zoom]);
  const ringIds = useMemo(() => new Set([view.chapter.narrator, ...view.chapter.travelling, ...view.chapter.here].filter(Boolean) as string[]), [view]);
  const lineage = useMemo(() => (selected && view.info.has(selected) ? new Set([selected, ...ancestors(view, selected)]) : null), [selected, view]);
  // Regular widths: up to 260 pt for the name and location, but never more than half the list (the drawer may be open).
  const nameWidth = compact ? Math.min(176, Math.round(width * 0.42)) : Math.min(260, Math.round((listWidth || width) * 0.5));
  const rightPad = 16;
  const rowH = dense ? 28 : 48;
  // Lanes are drawn in points: the list width less the name column (or the large-text inset) and the right pad.
  const trackWidth = Math.max(0, listWidth - (largeText ? 16 : nameWidth) - rightPad);

  const onPress = useCallback((id: string) => open(id), [open]);

  // Compact widths: the Bob sheet keeps its Bob selected; coming back to the Tree clears it. Regular widths keep
  // the selection, since it is what holds the side drawer open.
  useFocusEffect(
    useCallback(() => {
      if (compact) select(null);
    }, [compact, select]),
  );
  const onToggle = useCallback((key: string) => toggleTreeRow(key), [toggleTreeRow]);

  // Keep the selected Bob in view (e.g. after choosing him in search).
  useEffect(() => {
    if (!selected) return;
    const i = rows.findIndex((r) => r.kind === 'bob' && r.id === selected);
    if (i >= 0) list.current?.scrollToIndex({ index: i, viewPosition: 0.35, animated: true });
  }, [selected, rows]);

  // FlatList requires a stable onViewableItemsChanged.
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: ViewToken<TreeRow>[] }) => {
    const first = viewableItems.find((v) => v.item.kind === 'bob');
    setTopRow(first && first.item.kind === 'bob' ? first.item.id : null);
  });
  const crumb = topRow ? [...ancestors(view, topRow)].reverse() : [];

  const filterOptions: MenuOption[] = [
    { key: 'everyone', label: 'Everyone', detail: String(view.ids.length), selected: filter.kind === 'everyone', onPress: () => setFilter({ kind: 'everyone' }) },
    { key: 'alive', label: 'Everyone alive', selected: filter.kind === 'alive', onPress: () => setFilter({ kind: 'alive' }) },
    ...filterSystems(view).map((s) => ({ key: `s:${s.name}`, label: s.name, detail: String(s.count), selected: filter.kind === 'system' && filter.name === s.name, onPress: () => setFilter({ kind: 'system', name: s.name }) })),
    { key: 'transit', label: 'In transit', selected: filter.kind === 'transit', onPress: () => setFilter({ kind: 'transit' }) },
    { key: 'missing', label: 'Missing', selected: filter.kind === 'missing', onPress: () => setFilter({ kind: 'missing' }) },
    { key: 'lost', label: 'Lost', selected: filter.kind === 'lost', onPress: () => setFilter({ kind: 'lost' }) },
  ];
  const zoomOptions: MenuOption[] = (['all', 'recent', 'chapter'] as Zoom[]).map((z) => ({ key: z, label: ZOOM_LABEL[z], selected: zoom === z, onPress: () => setZoom(z) }));

  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: pad.top }}>
      <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <Pressable onPress={() => setMenu('filter')} accessibilityRole="button" accessibilityLabel={`Filter by location: ${filterLabel(filter)}`} style={{ height: 44, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="filter" color={p.ink} />
          <T variant="body" style={{ fontSize: 15 }}>{filterLabel(filter)}</T>
        </Pressable>
        <T variant="headline" accessibilityRole="header">
          {'Tree '}
          <T variant="data" tone="ink3" style={{ fontSize: 13 }}>{String(view.ids.length)}</T>
        </T>
        <Pressable onPress={() => router.push('/key')} accessibilityRole="button" accessibilityLabel="Marker key" style={{ height: 44, paddingHorizontal: 12, justifyContent: 'center' }}>
          <T variant="body" style={{ fontSize: 15 }}>Key</T>
        </Pressable>
      </View>
      {filter.kind !== 'everyone' ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row' }}>
          <Pressable onPress={() => setFilter({ kind: 'everyone' })} accessibilityRole="button" accessibilityLabel={`Remove filter ${filterLabel(filter)}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingLeft: 12, paddingRight: 8, borderRadius: 15, backgroundColor: p.ink }}>
            <T variant="secondary" weight="600" color={p.inv}>{filterLabel(filter)}</T>
            <Icon name="close" color={p.inv} size={12} strokeWidth={2.6} />
          </Pressable>
        </View>
      ) : null}
      <TimeAxisBar axis={axis} nameWidth={nameWidth} rightPad={rightPad} label={ZOOM_LABEL[zoom]} onLabelPress={() => setMenu('zoom')} />
      {compact && crumb.length ? (
        <View style={{ height: 30, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, backgroundColor: p.surf, borderBottomWidth: 1, borderColor: p.line }} accessibilityLabel={`In the line of ${crumb.join(', ')}`}>
          {crumb.slice(-3).map((a, i, arr) => (
            <View key={a} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 6, height: 14, borderRadius: 2, backgroundColor: colourOf(a) }} />
              <T variant="secondary" weight={i === arr.length - 1 ? '600' : '400'} tone={i === arr.length - 1 ? 'ink' : 'ink2'}>{a}</T>
              {a === view.chapter.narrator ? <Tag text="POV" /> : null}
              {i < arr.length - 1 ? <Icon name="chevronRight" color={p.ink3} size={10} strokeWidth={2.6} /> : null}
            </View>
          ))}
        </View>
      ) : null}
      {/* Rows ease into place when a branch or a folded batch opens or closes. */}
      <Animated.FlatList
        itemLayoutAnimation={LinearTransition.duration(220)}
        onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}
        ref={list}
        data={rows}
        keyExtractor={(r) => r.key}
        onScroll={compact ? onScroll : undefined}
        scrollEventThrottle={32}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        contentContainerStyle={{ paddingBottom: pad.bottom }}
        getItemLayout={largeText ? undefined : (_d, index) => ({ length: rowH, offset: rowH * index, index })}
        onScrollToIndexFailed={(e) => list.current?.scrollToOffset({ offset: e.averageItemLength * e.index, animated: true })}
        initialNumToRender={24}
        windowSize={11}
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <View style={{ height: rowH, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: item.minor ? 'transparent' : p.surf2, borderTopWidth: item.minor ? 1 : 0, borderColor: p.line2 }} accessibilityRole="header">
              <T variant="tag" tone={item.minor ? 'ink3' : 'ink2'} style={{ fontSize: item.minor ? 10 : 11 }}>{`${item.text.toUpperCase()} · ${item.count}`}</T>
            </View>
          ) : item.kind === 'group' ? (
            <GroupRow row={item} nameWidth={nameWidth} dense={dense} largeText={largeText} lineage={lineage} onToggle={onToggle} />
          ) : (
            <LaneRow row={item} axis={axis} nameWidth={nameWidth} rightPad={rightPad} dense={dense} largeText={largeText} ringIds={ringIds} lineage={lineage} trackWidth={trackWidth} onPress={onPress} onToggle={onToggle} />
          )
        }
        ListEmptyComponent={<T variant="secondary" tone="ink2" style={{ padding: 16 }}>{view.ids.length ? 'No Bobs match this filter.' : 'No Bobs yet. They appear here as you read.'}</T>}
        ListFooterComponent={
          selected && !compact ? (
            <Pressable onPress={() => toggleSelected(null)} accessibilityRole="button" style={{ alignSelf: 'center', marginTop: 16, height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: p.line, justifyContent: 'center' }}>
              <T variant="secondary" weight="600">{`Clear selection (${selected})`}</T>
            </Pressable>
          ) : null
        }
      />
      <Menu visible={menu === 'filter'} title="Show Bobs who are…" options={filterOptions} onClose={() => setMenu(null)} />
      <Menu visible={menu === 'zoom'} title="Time range" options={zoomOptions} onClose={() => setMenu(null)} />
    </View>
  );
}
