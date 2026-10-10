// The chapter at a glance, floating over the map: whose chapter it is, where he is, and how many people are with
// him, at other systems and en route. One button: it brings the map back to him and opens his callout. VoiceOver
// reads the whole summary and offers "Show as list".
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { Tag } from '@/components/bits';
import { Glass } from '@/components/glass';
import { T } from '@/components/text';
import { chapterSpoken, mapSummary, monthYear, type MapState, type ProgressView } from '@/core';
import { useApp } from '@/state/app';

import { NarratorPuck } from './narrator-puck';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Apr 2171" spelled out for VoiceOver: "April 2171". */
export function monthYearLong(y: number | null | undefined): string {
  if (y == null) return 'date not given';
  const m = Math.min(11, Math.max(0, Math.floor((y - Math.floor(y)) * 12)));
  return `${MONTHS[m]} ${Math.floor(y)}`;
}

export function headerTexts(view: ProgressView, state: MapState) {
  const s = mapSummary(view, state);
  const ch = view.chapter.ref.chapter;
  const chName = chapterSpoken(ch);
  const date = monthYear(state.time);
  let who: string;
  let where: string;
  let whereA11y: string;
  if (!s.narrator) {
    who = chName;
    where = 'not narrated by a Bob';
    whereA11y = `not narrated by a Bob${s.place ? `, set at ${s.place}` : ''}`;
  } else if (s.where === 'place') {
    who = s.narrator;
    where = s.place!;
    whereA11y = `at ${s.place}`;
  } else if (s.where === 'transit') {
    who = s.narrator;
    where = s.to ? `to ${s.to}` : 'destination not given';
    whereA11y = s.to ? `travelling to ${s.to}` : 'travelling, destination not given';
  } else if (s.where === 'lost') {
    who = s.narrator;
    where = 'lost';
    whereA11y = 'lost';
  } else if (s.where === 'missing') {
    who = s.narrator;
    where = 'missing';
    whereA11y = 'missing, whereabouts unknown';
  } else {
    // Active, but the books give no place for him on this date: say so, and where the chapter is set.
    const cs = view.chapter.system;
    who = s.narrator;
    where = cs ? `chapter set at ${cs}` : 'location not given';
    whereA11y = `location not given${cs ? `, chapter set at ${cs}` : ''}`;
  }
  // Non-breaking spaces inside each count, so the line wraps only between counts.
  const nb = (x: string) => x.replace(/ /g, '\u00a0');
  const counts: string[] = [];
  if (s.where === 'transit' && s.transit) counts.push(nb(s.transit));
  if (s.here) counts.push(nb(`${s.here} more here`));
  if (s.systems) counts.push(nb(`${s.systems} other ${s.systems === 1 ? 'system' : 'systems'}`));
  if (s.enRoute) counts.push(nb(`${s.enRoute} en route`));
  const line2 = s.empty ? `${nb(date)} · no systems named yet` : [nb(date), ...(counts.length ? counts : [s.where === 'place' ? 'alone here' : 'nobody else placed'])].join(' · ');
  const a11yCounts = [
    s.here ? `${s.here} ${s.here === 1 ? 'other' : 'others'} here` : null,
    s.systems ? `${s.systems} other ${s.systems === 1 ? 'system' : 'systems'} occupied` : null,
    s.enRoute ? `${s.enRoute} en route` : null,
  ].filter(Boolean);
  const read = view.latest != null && view.chapter.flashbackYear != null ? `; you have read to ${monthYearLong(view.latest)}` : '';
  const a11y = `${chName}. ${s.narrator ? `${s.narrator}, narrator, ` : ''}${whereA11y}, ${monthYearLong(state.time)}${read}. ${s.empty ? 'No systems named yet.' : a11yCounts.length ? `${a11yCounts.join(', ')}.` : 'Nobody else on the map.'}`;
  return { summary: s, who, where, line2, a11y };
}

export function ChapterHeaderCard({ state, onPress, onShowList, style }: { state: MapState; onPress: () => void; onShowList: () => void; style?: StyleProp<ViewStyle> }) {
  const { view, colourOf, palette: p } = useApp();
  const tx = headerTexts(view, state);
  const s = tx.summary;
  const puck = s.narrator && (s.where === 'place' || s.where === 'transit');
  return (
    <Glass interactive style={[{ borderRadius: 20, minHeight: 56 }, style]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={tx.a11y}
        accessibilityHint={s.narrator ? 'Shows him on the map' : undefined}
        accessibilityActions={[{ name: 'showList', label: 'Show as list' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'showList') onShowList();
        }}
        style={({ pressed }) => ({ minHeight: 56, paddingHorizontal: 14, paddingVertical: 7, justifyContent: 'center', gap: 1, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {puck ? <NarratorPuck colour={colourOf(s.narrator!)} size={20} /> : null}
          <T variant="headline" numberOfLines={1} style={{ fontSize: 16, flexShrink: 1 }}>
            {tx.who}
          </T>
          {s.narrator ? <Tag text="POV" /> : null}
          <T variant="headline" weight="400" tone="ink2" numberOfLines={1} style={{ fontSize: 16, flexShrink: 2 }}>
            {`· ${tx.where}`}
          </T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {view.chapter.flashbackYear != null ? (
            <View style={{ borderWidth: 1.5, borderColor: p.ink, borderRadius: 3, paddingHorizontal: 3 }}>
              <T variant="tag">CH</T>
            </View>
          ) : null}
          <T variant="secondary" tone="ink2" numberOfLines={2} style={{ flexShrink: 1 }}>
            {tx.line2}
          </T>
        </View>
      </Pressable>
    </Glass>
  );
}
