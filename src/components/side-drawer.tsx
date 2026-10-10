// Bob details on iPad and wide web: a drawer on the right, open while a Bob is selected. The content beside it
// narrows rather than being covered, so the Tree's lanes stay in view. It slides in from the right and back out
// (skipped with Reduce Motion). Drag the handle on its left edge (or use the VoiceOver adjust gesture) to change its
// width; the width is remembered.
import { useMemo, useState } from 'react';
import { PanResponder, Platform, ScrollView, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInRight, SlideOutRight } from 'react-native-reanimated';

import { BobDetails } from '@/components/bob-details';
import { IconButton } from '@/components/bits';
import { useApp } from '@/state/app';

const MIN = 300;
const MAX = 640;
const STEP = 40;
/** The content beside the drawer never gets narrower than this. */
const KEEP = 360;

/** Width the drawer can actually take in a window of `room` points. */
export function drawerWidthFor(want: number, room: number): number {
  const max = Math.max(MIN, Math.min(MAX, room - KEEP));
  return Math.round(Math.min(max, Math.max(MIN, want)));
}

/** Shared timing for the drawer and the content easing aside, so they move as one. */
export const DRAWER_MS = 280;
export const DRAWER_EASING = Easing.bezier(0.2, 0.8, 0.2, 1);

export function SideDrawer({ room, onDragging }: { room: number; onDragging?: (dragging: boolean) => void }) {
  const { palette: p, selected, select, drawerWidth, setDrawerWidth } = useApp();
  const committed = drawerWidthFor(drawerWidth, room);
  // While dragging, the width follows the finger without saving on every frame.
  const [live, setLive] = useState<number | null>(null);
  const width = live ?? committed;

  // The drag measures from the saved width; the handler is rebuilt whenever that changes.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => onDragging?.(true),
        onPanResponderMove: (_e, g) => setLive(drawerWidthFor(committed - g.dx, room)),
        onPanResponderRelease: (_e, g) => {
          setDrawerWidth(drawerWidthFor(committed - g.dx, room));
          setLive(null);
          onDragging?.(false);
        },
        onPanResponderTerminate: () => {
          setLive(null);
          onDragging?.(false);
        },
      }),
    [committed, room, setDrawerWidth, onDragging],
  );

  // Web: the responder system doesn't follow a mouse drag reliably, so track the pointer on the window instead.
  const webDrag =
    Platform.OS === 'web'
      ? {
          onPointerDown: (e: { nativeEvent: { clientX: number; pointerType?: string } }) => {
            if (e.nativeEvent.pointerType === 'touch') return;
            onDragging?.(true);
            const x0 = e.nativeEvent.clientX;
            const at = (x: number) => drawerWidthFor(committed - (x - x0), room);
            const move = (ev: PointerEvent) => setLive(at(ev.clientX));
            const up = (ev: PointerEvent) => {
              setDrawerWidth(at(ev.clientX));
              setLive(null);
              onDragging?.(false);
              globalThis.removeEventListener('pointermove', move);
              globalThis.removeEventListener('pointerup', up);
            };
            globalThis.addEventListener('pointermove', move);
            globalThis.addEventListener('pointerup', up);
          },
        }
      : {};

  if (!selected) return null;
  return (
    <Animated.View
      entering={SlideInRight.duration(DRAWER_MS).easing(DRAWER_EASING)}
      exiting={SlideOutRight.duration(DRAWER_MS - 60).easing(Easing.in(Easing.cubic))}
      accessibilityLabel={`Details for ${selected}`}
      style={{ width, backgroundColor: p.surf, borderLeftWidth: 1, borderColor: p.line }}>
      <View
        {...pan.panHandlers}
        {...webDrag}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Details width"
        accessibilityValue={{ text: `${width} points` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => setDrawerWidth(drawerWidthFor(committed + (e.nativeEvent.actionName === 'increment' ? STEP : -STEP), room))}
        style={[
          { position: 'absolute', left: -12, top: 0, bottom: 0, width: 24, zIndex: 2, alignItems: 'center', justifyContent: 'center' },
          Platform.OS === 'web' ? ({ cursor: 'col-resize' } as object) : null,
        ]}>
        <View style={{ width: 5, height: 44, borderRadius: 3, backgroundColor: live != null ? p.ink2 : p.ink3, opacity: live != null ? 1 : 0.6 }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 8, paddingTop: 6 }}>
        <IconButton icon="chevronRight" label="Close details" onPress={() => select(null)} color={p.ink2} />
      </View>
      {/* Switching Bobs while open cross-fades the details instead of swapping them in one frame. */}
      <Animated.View key={selected} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110 }}>
          <BobDetails id={selected} />
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}
