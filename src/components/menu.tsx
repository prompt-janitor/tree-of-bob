// A simple option menu presented over the screen (filter, time range). Works the same on iOS, Android and web.
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { T } from '@/components/text';
import { usePalette } from '@/state/app';

export interface MenuOption {
  key: string;
  label: string;
  detail?: string;
  selected?: boolean;
  onPress: () => void;
}

export function Menu({ visible, title, options, onClose }: { visible: boolean; title: string; options: MenuOption[]; onClose: () => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel="Close menu" style={{ flex: 1, backgroundColor: p.scrim, justifyContent: 'flex-start', alignItems: 'center', paddingTop: insets.top + 56, paddingHorizontal: 16 }}>
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 380, maxHeight: '75%', backgroundColor: p.surf, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: p.line }}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: p.line2 }}>
            <T variant="row" accessibilityRole="header">{title}</T>
          </View>
          <ScrollView>
            {options.map((o) => (
              <Pressable
                key={o.key}
                onPress={() => {
                  o.onPress();
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: !!o.selected }}
                style={({ pressed }) => ({ minHeight: 46, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pressed ? p.sel : 'transparent', borderBottomWidth: 1, borderColor: p.line2 })}>
                <View style={{ width: 18 }}>{o.selected ? <Icon name="chevronRight" color={p.ink} size={16} strokeWidth={2.4} /> : null}</View>
                <T variant="row" weight={o.selected ? '700' : '500'} style={{ flex: 1, fontSize: 15 }}>{o.label}</T>
                {o.detail ? <T variant="data" tone="ink3">{o.detail}</T> : null}
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
