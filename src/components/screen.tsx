// Screen scaffolding: one scroll per view (no nested scroll areas), safe areas, and room for the floating nav.
import { useCallback, useRef, type ReactNode } from 'react';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PHONE_NAV_CLEARANCE } from '@/components/nav';
import { T } from '@/components/text';
import { useLayout } from '@/hooks/use-layout';
import { useApp, usePalette } from '@/state/app';

/** Shrinks the iPhone nav when the user scrolls down and restores it when they scroll up. */
export function useNavScroll() {
  const { setNavCompact, navCompact } = useApp();
  const last = useRef(0);
  return useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      if (y > last.current + 8 && y > 60 && !navCompact) setNavCompact(true);
      else if ((y < last.current - 8 || y <= 0) && navCompact) setNavCompact(false);
      last.current = y;
    },
    [navCompact, setNavCompact],
  );
}

export function useContentInsets() {
  const insets = useSafeAreaInsets();
  const { compact } = useLayout();
  return {
    top: compact ? insets.top : 0,
    bottom: compact ? PHONE_NAV_CLEARANCE + insets.bottom : 110,
  };
}

export function Screen({ title, subtitle, right, children, maxWidth = 760 }: { title?: string; subtitle?: string; right?: ReactNode; children: ReactNode; maxWidth?: number }) {
  const p = usePalette();
  const { compact } = useLayout();
  const pad = useContentInsets();
  const onScroll = useNavScroll();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: p.bg }}
      onScroll={compact ? onScroll : undefined}
      scrollEventThrottle={32}
      contentContainerStyle={{ paddingTop: pad.top + (compact ? 8 : 12), paddingBottom: pad.bottom, paddingHorizontal: 16, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth, gap: 14 }}>
        {title ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: compact ? 6 : 0 }}>
            <View style={{ flexShrink: 1, gap: 2 }}>
              <T variant="display" accessibilityRole="header">{title}</T>
              {subtitle ? <T variant="secondary" tone="ink2">{subtitle}</T> : null}
            </View>
            {right}
          </View>
        ) : null}
        {children}
      </View>
    </ScrollView>
  );
}
