// Navigation chrome.
// iPhone / compact: floating glass capsule for the views + round search button + reading capsule above.
//   While content scrolls down it shrinks to one row: current-view icon, compact reading capsule, search.
// iPad / web / regular: floating view pill at the top, actions on the right, reading dock floating at the bottom.
// Web only, until installed: an install button beside search (phone: in the expanded nav only; the shrunk nav
// has no room for it).
import { router } from 'expo-router';
import { TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/glass';
import { Icon, type IconName } from '@/components/icon';
import { InstallButton } from '@/components/install-hint';
import { ReadingCapsule } from '@/components/reading-capsule';
import { T } from '@/components/text';
import { useApp, usePalette } from '@/state/app';

export interface TabDef {
  name: string;
  href: '/' | '/tree' | '/systems' | '/log' | '/others';
  label: string;
  icon: IconName;
  compact: boolean;
}

export const TABS: TabDef[] = [
  { name: 'index', href: '/', label: 'Chapter', icon: 'chapter', compact: true },
  { name: 'tree', href: '/tree', label: 'Tree', icon: 'tree', compact: true },
  { name: 'systems', href: '/systems', label: 'Systems', icon: 'systems', compact: true },
  { name: 'log', href: '/log', label: 'Log', icon: 'log', compact: true },
  { name: 'others', href: '/others', label: 'Others', icon: 'others', compact: false },
];

/** Space content must leave at the bottom so the floating nav never covers it. */
export const PHONE_NAV_CLEARANCE = 170;

function PhoneTab({ tab, isFocused, ...props }: TabTriggerSlotProps & { tab: TabDef }) {
  const p = usePalette();
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: !!isFocused }}
      style={{ flexGrow: isFocused ? 2.2 : 1, flexBasis: 0, minWidth: 0, height: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: isFocused ? p.ink : 'transparent' }}>
      <Icon name={tab.icon} color={isFocused ? p.inv : p.ink2} />
      {isFocused ? <T variant="row" color={p.inv} style={{ fontSize: 14 }} numberOfLines={1}>{tab.label}</T> : null}
    </Pressable>
  );
}

function CurrentTabButton({ tab, onPress }: { tab: TabDef; onPress: () => void }) {
  const p = usePalette();
  return (
    <Glass interactive style={{ width: 56, height: 56, borderRadius: 28, padding: 5 }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${tab.label}, current view. Show all views.`} style={{ flex: 1, borderRadius: 23, backgroundColor: p.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={tab.icon} color={p.inv} />
      </Pressable>
    </Glass>
  );
}

function SearchButton({ size }: { size: number }) {
  const p = usePalette();
  return (
    <Glass interactive style={{ width: size, height: size, borderRadius: size / 2 }}>
      <Pressable onPress={() => router.push('/search')} accessibilityRole="button" accessibilityLabel="Search Bobs, systems and others" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="search" color={p.ink} />
      </Pressable>
    </Glass>
  );
}

export function PhoneNav({ current }: { current: string }) {
  const insets = useSafeAreaInsets();
  const { navCompact, setNavCompact } = useApp();
  const bottom = Math.max(insets.bottom - 8, 12);
  const tab = TABS.find((t) => t.name === current) ?? TABS[0];

  if (navCompact) {
    return (
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <CurrentTabButton tab={tab} onPress={() => setNavCompact(false)} />
        <ReadingCapsule variant="compact" style={{ flex: 1 }} />
        <SearchButton size={56} />
      </View>
    );
  }
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom, gap: 10 }}>
      <ReadingCapsule variant="full" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Glass style={{ flex: 1, height: 60, borderRadius: 30, flexDirection: 'row', alignItems: 'center', gap: 2, padding: 6 }} accessibilityRole="tablist">
          {TABS.filter((t) => t.compact).map((t) => (
            <TabTrigger key={t.name} name={t.name} asChild>
              <PhoneTab tab={t} />
            </TabTrigger>
          ))}
        </Glass>
        <InstallButton place="bottom" glass size={46} bottomOffset={bottom + 150} />
        <SearchButton size={60} />
      </View>
    </View>
  );
}

function WideTab({ tab, isFocused, ...props }: TabTriggerSlotProps & { tab: TabDef }) {
  const p = usePalette();
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ height: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: "center", backgroundColor: isFocused ? p.ink : hovered || pressed ? p.surf2 : "transparent" })}>
      <T variant="secondary" weight="600" color={isFocused ? p.inv : p.ink2} style={{ fontSize: 14 }}>{tab.label}</T>
    </Pressable>
  );
}

export function WideTopBar() {
  const insets = useSafeAreaInsets();
  const p = usePalette();
  return (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 140 }}>
        <BrandMark />
        <T variant="row" weight="700">Tree of Bob</T>
      </View>
      <Glass style={{ flexDirection: 'row', gap: 2, padding: 4, borderRadius: 22 }} accessibilityRole="tablist">
        {TABS.map((t) => (
          <TabTrigger key={t.name} name={t.name} asChild>
            <WideTab tab={t} />
          </TabTrigger>
        ))}
      </Glass>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 140, justifyContent: 'flex-end' }}>
        <InstallButton place="top" />
        <Pressable onPress={() => router.push('/search')} accessibilityRole="button" accessibilityLabel="Search" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="search" color={p.ink} />
        </Pressable>
        <Pressable onPress={() => router.push('/about')} accessibilityRole="button" accessibilityLabel="About and settings" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="info" color={p.ink} />
        </Pressable>
      </View>
    </View>
  );
}

/** Small lineage mark used beside the name on regular widths. Root, three copies, in the first identity slots. */
export function BrandMark({ size = 26 }: { size?: number }) {
  const p = usePalette();
  const dot = (c: string, top: number, left: number, s: number) => (
    <View style={{ position: 'absolute', top, left, width: s, height: s, borderRadius: s / 2, backgroundColor: c }} />
  );
  const k = size / 56;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden>
      <View style={{ position: 'absolute', left: 16 * k, top: 27 * k, width: 20 * k, height: 2 }} >
        <View style={{ flex: 1, backgroundColor: p.ink }} />
      </View>
      <View style={{ position: 'absolute', left: 25 * k, top: 12 * k, width: 2, height: 32 * k, backgroundColor: p.ink }} />
      <View style={{ position: 'absolute', left: 25 * k, top: 12 * k, width: 12 * k, height: 2, backgroundColor: p.ink }} />
      <View style={{ position: 'absolute', left: 25 * k, top: 43 * k, width: 12 * k, height: 2, backgroundColor: p.ink }} />
      {dot(p.scheme === 'dark' ? '#7ac3ff' : '#1f7dcf', 22 * k, 4 * k, 12 * k)}
      {dot(p.scheme === 'dark' ? '#ff9c8e' : '#c35044', 7 * k, 38 * k, 10 * k)}
      {dot(p.scheme === 'dark' ? '#d2a8ff' : '#905fc0', 23 * k, 38 * k, 10 * k)}
      {dot(p.scheme === 'dark' ? '#5ad8ac' : '#009567', 39 * k, 38 * k, 10 * k)}
    </View>
  );
}
