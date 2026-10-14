// The key beside the Systems map (iPad, wide web): only the marks drawn right now, each a small sample and its name.
// Its close button puts it away (the map's Key button brings it back); Show all opens the full Key.
import { Pressable, View, type LayoutChangeEvent } from 'react-native';

import { Glass } from '@/components/glass';
import { Icon } from '@/components/icon';
import { T } from '@/components/text';
import { useApp } from '@/state/app';

import { KeyClock, type MapKeyItem } from './map-key';

export const LEGEND_WIDTH = 196;
const ROW = 22;
const HEADER = 40;

export function MapLegend({ items, maxHeight, animate, onShowAll, onClose, onLayout }: { items: MapKeyItem[]; maxHeight: number; animate: boolean; onShowAll: () => void; onClose: () => void; onLayout?: (e: LayoutChangeEvent) => void }) {
  const { palette: p } = useApp();
  // Rows that fit; past that, the last row says how many more the full Key has.
  const room = Math.max(1, Math.floor((maxHeight - HEADER - 8) / ROW));
  const shown = items.length > room ? items.slice(0, room - 1) : items;
  const more = items.length - shown.length;
  return (
    <Glass style={{ width: LEGEND_WIDTH, borderRadius: 16, paddingBottom: 6 }} onLayout={onLayout}>
      <View style={{ height: HEADER, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 2 }}>
        <T variant="secondary" weight="600" style={{ flex: 1 }} accessibilityRole="header">Key</T>
        <Pressable onPress={onShowAll} accessibilityRole="button" accessibilityLabel="Show all of the key" hitSlop={4} style={({ pressed }) => ({ height: HEADER, paddingHorizontal: 8, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <T variant="secondary" tone="ink2" style={{ fontSize: 12 }}>Show all</T>
        </Pressable>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the key" hitSlop={4} style={({ pressed }) => ({ width: HEADER, height: HEADER, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Icon name="close" color={p.ink2} size={16} strokeWidth={2} />
        </Pressable>
      </View>
      <KeyClock active={animate}>
        {shown.map((i) => (
          <View key={i.id} accessible accessibilityLabel={`${i.label}. ${i.detail}`} style={{ height: ROW, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
            <View style={{ width: 34, height: 20, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 64, height: 44, alignItems: 'center', justifyContent: 'center', transform: [{ scale: 0.55 }] }}>{i.sample}</View>
            </View>
            <T variant="secondary" numberOfLines={1} style={{ fontSize: 12, flexShrink: 1 }}>{i.label}</T>
          </View>
        ))}
      </KeyClock>
      {more > 0 ? (
        <Pressable onPress={onShowAll} accessibilityRole="button" accessibilityLabel={`${more} more in the full key`} style={({ pressed }) => ({ height: ROW, justifyContent: 'center', paddingLeft: 54, opacity: pressed ? 0.6 : 1 })}>
          <T variant="secondary" tone="ink2" style={{ fontSize: 12 }}>{`+${more} more`}</T>
        </Pressable>
      ) : null}
    </Glass>
  );
}
