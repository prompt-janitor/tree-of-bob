// Web only: the install button and the short hint it opens. Renders nothing on native or once installed.
// The hint closes with its close button, a tap outside it, or Escape (the web Modal handles Escape).
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/bits';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icon';
import { T } from '@/components/text';
import { useInstall, type InstallMode } from '@/hooks/use-install';
import { usePalette } from '@/state/app';

/**
 * place: 'top' opens the hint under a top bar button (regular widths), 'bottom' above the phone nav.
 * glass: draw the button as a round glass control, to sit beside the phone nav's search button.
 */
export function InstallButton({ place, glass, size = 44, bottomOffset = 0 }: { place: 'top' | 'bottom'; glass?: boolean; size?: number; bottomOffset?: number }) {
  const p = usePalette();
  const { available, mode, install } = useInstall();
  const [open, setOpen] = useState(false);
  if (!available) return null;

  const button = (
    <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Install app" style={{ width: glass ? undefined : size, height: glass ? undefined : size, flex: glass ? 1 : undefined, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="install" color={p.ink} />
    </Pressable>
  );
  return (
    <>
      {glass ? <Glass interactive style={{ width: size, height: size, borderRadius: size / 2 }}>{button}</Glass> : button}
      <InstallHint
        visible={open}
        mode={mode}
        place={place}
        bottomOffset={bottomOffset}
        onClose={() => setOpen(false)}
        onInstall={() => {
          setOpen(false);
          install().catch(() => {});
        }}
      />
    </>
  );
}

function InstallHint({ visible, mode, place, bottomOffset, onClose, onInstall }: { visible: boolean; mode: InstallMode; place: 'top' | 'bottom'; bottomOffset: number; onClose: () => void; onInstall: () => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const share = (
    <View style={{ display: 'inline-flex', verticalAlign: 'text-bottom', paddingHorizontal: 4 } as object}>
      <Icon name="share" size={18} color={p.ink} />
    </View>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityLabel="Close install hint"
        style={{
          flex: 1,
          paddingHorizontal: 12,
          alignItems: place === 'top' ? 'flex-end' : 'stretch',
          justifyContent: place === 'top' ? 'flex-start' : 'flex-end',
          paddingTop: place === 'top' ? insets.top + 60 : 0,
          paddingBottom: place === 'bottom' ? bottomOffset : 0,
        }}>
        <Pressable
          onPress={() => {}}
          accessibilityRole="none"
          aria-label="Install app"
          role="dialog"
          style={{ width: '100%', maxWidth: 340, alignSelf: place === 'top' ? 'flex-end' : 'center', backgroundColor: p.surf, borderRadius: 16, borderWidth: 1, borderColor: p.line, paddingLeft: 16, paddingRight: 4, paddingBottom: 16, gap: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' } as object}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T variant="row" accessibilityRole="header">Install Tree of Bob</T>
            <IconButton icon="close" label="Close" onPress={onClose} color={p.ink2} />
          </View>
          <View style={{ paddingRight: 12, gap: 12 }}>
            {mode === 'prompt' ? (
              <T variant="body">Works offline once installed.</T>
            ) : mode === 'iphone' ? (
              <T variant="body">
                Tap Share{share}, then Add to Home Screen. If Share is hidden, tap ⋯ first. Works offline once installed.
              </T>
            ) : mode === 'ipad' ? (
              <T variant="body">Tap Share{share}at the top right, then Add to Home Screen. Works offline once installed.</T>
            ) : (
              <T variant="body">{"Use your browser's menu to install or add to Home Screen. Works offline once installed."}</T>
            )}
            {mode === 'prompt' ? (
              <Pressable onPress={onInstall} accessibilityRole="button" accessibilityLabel="Install" style={({ pressed }) => ({ minHeight: 44, borderRadius: 22, backgroundColor: p.ink, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                <T variant="row" color={p.inv}>Install</T>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
