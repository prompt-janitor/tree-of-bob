// The reading-position control: previous, current chapter (opens the picker), next. Swipe left/right to step.
// Appears as a glass capsule on iPhone (full or compact) and as the floating dock on iPad and web.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { PanResponder, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from '@/components/glass';
import { Icon } from '@/components/icon';
import { T } from '@/components/text';
import { chapterDate, chapterHeadingSpoken, chapterLabel, isFirst, isLast, monthYear } from '@/core';
import { useApp } from '@/state/app';

export type CapsuleVariant = 'full' | 'compact' | 'dock';

export function ReadingCapsule({ variant = 'full', style }: { variant?: CapsuleVariant; style?: StyleProp<ViewStyle> }) {
  const { view, step, palette: p } = useApp();
  const ref = view.chapter.ref;
  const total = ref.book.chapters.length;
  const fraction = ref.book.chapters.findIndex((c) => c.n === ref.chapter.n) / Math.max(1, total - 1);
  const first = isFirst(view.model, view.progress);
  const last = isLast(view.model, view.progress);
  const ch = ref.chapter;
  // Main line: who narrates and where (the code line above carries the chapter number). Dock shows the date in its code line.
  const summary = [ch.pov, ch.place, variant === 'dock' ? null : chapterDate(ch)].filter(Boolean).join(' · ') || chapterLabel(ch);
  const title = view.finished ? 'Finished' : summary;
  const spoken = [chapterHeadingSpoken(ref.book, ch), ch.place ? `at ${ch.place}` : null, chapterDate(ch)].filter(Boolean).join(', ');
  const btn = variant === 'compact' ? 40 : 44;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderRelease: (_e, g) => {
          if (g.dx < -40) step(1);
          else if (g.dx > 40) step(-1);
        },
      }),
    [step],
  );

  const code =
    variant === 'compact'
      ? `B${ref.book.id} · ${chapterLabel(ref.chapter).toUpperCase()}`
      : variant === 'dock'
        ? [`B${ref.book.id} · ${chapterLabel(ref.chapter).toUpperCase()} OF ${total}`, ref.chapter.year != null ? monthYear(ref.chapter.year).toUpperCase() : null]
            .filter(Boolean)
            .join(' · ')
        : `B${ref.book.id} · ${chapterLabel(ref.chapter).toUpperCase()} / ${total}`;

  return (
    <Glass interactive style={[{ height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', gap: 4, padding: 5 }, style]} {...pan.panHandlers}>
      <Pressable
        onPress={() => step(-1)}
        disabled={first}
        accessibilityRole="button"
        accessibilityLabel="Previous chapter"
        style={({ pressed }) => ({ width: btn, height: btn, borderRadius: btn / 2, alignItems: 'center', justifyContent: 'center', opacity: first ? 0.3 : pressed ? 0.6 : 1 })}>
        <Icon name="chevronLeft" color={p.ink} size={20} strokeWidth={2} />
      </Pressable>
      <Pressable
        onPress={() => router.push('/progress')}
        accessibilityRole="button"
        accessibilityLabel={view.finished ? 'Reading position: finished the series. Opens the chapter picker.' : `Reading position: about to read ${spoken}. Opens the chapter picker.`}
        style={{ flex: 1, minWidth: 0, height: 44, justifyContent: 'center', alignItems: variant === 'compact' ? 'flex-start' : 'center', gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T variant="tag" tone="ink2" style={{ fontSize: variant === 'compact' ? 10 : 11, letterSpacing: 0.2 }} numberOfLines={1}>
            {code}
          </T>
          {variant === 'full' && (
            <View style={{ width: 34, height: 3, borderRadius: 2, backgroundColor: p.line, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(fraction * 100)}%`, height: 3, backgroundColor: p.ink }} />
            </View>
          )}
        </View>
        <T variant="row" numberOfLines={1} style={{ fontSize: variant === 'compact' ? 14 : 15, maxWidth: '100%' }}>
          {title}
        </T>
      </Pressable>
      <Pressable
        onPress={() => step(1)}
        disabled={last}
        accessibilityRole="button"
        accessibilityLabel={view.index === view.model.chapters.length - 1 && !view.finished ? 'Mark the series finished' : 'Next chapter'}
        style={({ pressed }) => ({ width: btn, height: btn, borderRadius: btn / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: p.ink, opacity: last ? 0.3 : pressed ? 0.75 : 1 })}>
        <Icon name="chevronRight" color={p.inv} size={20} strokeWidth={2} />
      </Pressable>
    </Glass>
  );
}
