// Frame for routes presented as sheets (formSheet on iOS/Android, a full page on the web).
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/bits';
import { T } from '@/components/text';
import { usePalette } from '@/state/app';

export function closeSheet() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function SheetFrame({ title, children, footer, scroll = true, onClose }: { title?: string; children: ReactNode; footer?: ReactNode; scroll?: boolean; onClose?: () => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const web = Platform.OS === 'web';
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 8, minHeight: 44, width: '100%', maxWidth: 740, alignSelf: 'center' }}>
      {title ? <T variant="title" style={{ fontSize: 20 }} accessibilityRole="header">{title}</T> : <View />}
      <IconButton icon="close" label="Close" onPress={onClose ?? closeSheet} color={p.ink2} />
    </View>
  );
  const content = { padding: 20, paddingTop: 4, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' } as const;

  // iOS form sheets find the first scroll view in the sheet and stretch it over the whole sheet, so anything
  // above it ends up underneath. There the scroll view is the root: the header (and any footer actions) is
  // its sticky first row.
  if (Platform.OS === 'ios' && scroll) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: p.bg }} stickyHeaderIndices={[0]} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: p.bg, paddingTop: 14, paddingBottom: footer ? 12 : 4 }}>
          {header}
          {footer ? <View style={{ paddingHorizontal: 16, paddingTop: 8, width: '100%', maxWidth: 740, alignSelf: 'center' }}>{footer}</View> : null}
        </View>
        <View style={content}>{children}</View>
      </ScrollView>
    );
  }

  const body = scroll ? (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ ...content, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' }}>{children}</View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: web ? insets.top + 8 : 14 }}>
      {header}
      {body}
      {footer ? <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16), borderTopWidth: 1, borderColor: p.line, backgroundColor: p.bg }}>{footer}</View> : null}
    </View>
  );
}
