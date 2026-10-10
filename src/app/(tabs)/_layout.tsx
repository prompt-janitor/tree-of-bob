// Tab shell. Compact widths: content full screen with the floating glass nav. Regular widths: top tab pill,
// optional chapter rail (wide web), content, the Bob side drawer, and the floating reading dock.
// Web: Bob details never get a URL. Compact web widths show them in an in-page sheet over the tabs (native
// pushes the bob/[id] route instead). The layout also keeps the document title in step with the screen.
import { router, usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/bits';
import { BobDetails } from '@/components/bob-details';
import { ChapterHeader, Disclaimer, FlashbackCard, HereCard } from '@/components/chapter';
import { PhoneNav, TABS, WideTopBar } from '@/components/nav';
import { ReadingCapsule } from '@/components/reading-capsule';
import { DRAWER_EASING, DRAWER_MS, drawerWidthFor, SideDrawer } from '@/components/side-drawer';
import { useLayout } from '@/hooks/use-layout';
import { useApp } from '@/state/app';
import { documentTitle } from '@/web/document-title';

const web = Platform.OS === 'web';

function currentTab(pathname: string): string {
  const seg = pathname.replace(/^\//, '').split('/')[0];
  return TABS.find((t) => t.name === seg)?.name ?? 'index';
}

export default function TabsLayout() {
  const { compact, rail, width } = useLayout();
  const { palette: p, selected, drawerWidth } = useApp();
  const pathname = usePathname();
  const room = width - (rail ? 300 : 0);
  const drawer = !compact && selected ? drawerWidthFor(drawerWidth, room) : 0;
  // The content eases aside as the drawer opens or closes, but follows a drag of the drawer's edge directly.
  const [dragging, setDragging] = useState(false);
  const ease = dragging ? undefined : LinearTransition.duration(DRAWER_MS).easing(DRAWER_EASING);

  // If the window narrows to compact while the drawer is open (Split View), the same Bob opens as a sheet. On the
  // web the in-page sheet follows the selection, so nothing needs to happen there.
  const wasCompact = useRef(compact);
  useEffect(() => {
    if (!web && compact && !wasCompact.current && selected) router.push({ pathname: '/bob/[id]', params: { id: selected } });
    wasCompact.current = compact;
  }, [compact, selected]);

  // Web: the browser tab names the screen ("Tree · Tree of Bob"), never a Bob.
  useEffect(() => {
    if (web) document.title = documentTitle(pathname);
  }, [pathname]);

  return (
    <Tabs style={{ flex: 1, backgroundColor: p.bg }}>
      {compact ? (
        <View style={{ flex: 1 }}>
          <TabSlot style={{ flex: 1 }} />
          <PhoneNav current={currentTab(pathname)} />
          {web && selected ? <WebBobSheet id={selected} /> : null}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WideTopBar />
          <View style={{ flex: 1, flexDirection: 'row' }}>
            {rail ? <ChapterRail /> : null}
            <Animated.View layout={ease} style={{ flex: 1, minWidth: 0 }}>
              <TabSlot style={{ flex: 1 }} />
            </Animated.View>
            <SideDrawer room={room} onDragging={setDragging} />
          </View>
          <Animated.View layout={ease} pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: drawer, bottom: 20, alignItems: 'center' }}>
            <ReadingCapsule variant="dock" style={{ width: Math.min(460, width - drawer - 32) }} />
          </Animated.View>
        </View>
      )}
      <TabList style={{ display: 'none' }}>
        {TABS.map((t) => (
          <TabTrigger key={t.name} name={t.name} href={t.href} />
        ))}
      </TabList>
    </Tabs>
  );
}

function ChapterRail() {
  const { palette: p } = useApp();
  return (
    <View accessibilityLabel="This chapter" style={{ width: 300, borderRightWidth: 1, borderColor: p.line }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 110 }}>
        <ChapterHeader size="title" />
        <FlashbackCard />
        <HereCard />
        <Disclaimer />
      </ScrollView>
    </View>
  );
}

/**
 * Compact web widths: a Bob's details in a sheet over the tabs, open while he is selected (his lineage shows on
 * the Tree behind it). Closes with the close button, a tap on the dimmed area above it, or Escape. Opening
 * another Bob from inside it replaces the details.
 */
function WebBobSheet({ id }: { id: string }) {
  const { palette: p, select } = useApp();
  const insets = useSafeAreaInsets();
  const sheet = useRef<View>(null);
  const close = () => select(null);

  useEffect(() => {
    // Move keyboard and screen reader focus into the sheet, and let Escape close it. The focus waits a moment:
    // the press that opened the sheet finishes after this effect and would otherwise keep focus on the row.
    const focus = setTimeout(() => (sheet.current as unknown as HTMLElement | null)?.focus?.(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null);
    };
    globalThis.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(focus);
      globalThis.removeEventListener('keydown', onKey);
    };
  }, [select]);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' }}>
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: p.scrim }}>
        <Pressable onPress={close} aria-hidden tabIndex={-1} style={{ flex: 1 }} />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.duration(280).easing(Easing.bezier(0.2, 0.8, 0.2, 1))}
        exiting={SlideOutDown.duration(200).easing(Easing.in(Easing.cubic))}
        style={{ maxHeight: '88%', width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        <View
          ref={sheet}
          role="dialog"
          aria-modal
          aria-label={`Details for ${id}`}
          tabIndex={-1}
          style={{ flexShrink: 1, backgroundColor: p.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0, borderColor: p.line, outline: 'none' } as object}>
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: p.ink3, opacity: 0.5 }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 8 }}>
            <IconButton icon="close" label="Close details" onPress={close} color={p.ink2} />
          </View>
          {/* Switching Bobs while open cross-fades the details, as in the side drawer. */}
          <Animated.View key={id} entering={FadeIn.duration(180)} style={{ flexShrink: 1 }}>
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 16) + 16 }}>
              <BobDetails id={id} />
            </ScrollView>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}
