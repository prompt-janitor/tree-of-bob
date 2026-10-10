// Chapter context pieces: header, flashback card, and who is in the narrator's system.
import { Pressable, View } from 'react-native';

import { BobChip, Card, SectionTitle, Tag } from '@/components/bits';
import { Icon } from '@/components/icon';
import { DashedRule } from '@/components/lanes';
import { T } from '@/components/text';
import { chapterDate, chapterHeadingSpoken, chapterLabel, locAt, monthYear, plural, settingLabels, yearText } from '@/core';
import { useOpenBob } from '@/hooks/use-open-bob';
import { useApp } from '@/state/app';
import { withAlpha } from '@/theme/identity';

export function ChapterHeader({ size = 'display' }: { size?: 'display' | 'title' }) {
  const { view, palette: p, colourOf } = useApp();
  const open = useOpenBob();
  const { ref, narrator } = view.chapter;
  const ch = ref.chapter;
  return (
    <View style={{ gap: 6 }}>
      <T variant="overline" tone="ink2">
        {`BOOK ${ref.book.id} · ${ref.book.title.toUpperCase()}${view.finished ? ' · SERIES FINISHED' : ''}`}
      </T>
      <T variant={size} accessibilityRole="header" accessibilityLabel={chapterHeadingSpoken(ref.book, ch)}>{chapterLabel(ch)}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        {narrator ? (
          <Pressable onPress={() => open(narrator)} accessibilityRole="button" accessibilityLabel={`${narrator} narrates this chapter`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingLeft: 6, paddingRight: 10, borderRadius: 10, backgroundColor: colourOf(narrator) }}>
            <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.24)', alignItems: 'center', justifyContent: 'center' }}>
              <T variant="tag" color={p.onIdentity} style={{ fontSize: 9 }}>{view.info.get(narrator)!.monogram}</T>
            </View>
            <T variant="row" color={p.onIdentity} style={{ fontSize: 14 }}>{`${narrator} narrates`}</T>
          </Pressable>
        ) : ch.pov ? (
          <Meta text={`Narrator: ${ch.pov}`} />
        ) : null}
        <Meta text={chapterDate(ch) ?? 'Date not given'} mono />
        {ch.place ? <Meta text={ch.place} /> : null}
      </View>
    </View>
  );
}

function Meta({ text, mono }: { text: string; mono?: boolean }) {
  const p = useApp().palette;
  return (
    <View style={{ minHeight: 32, paddingHorizontal: 10, borderRadius: 10, backgroundColor: p.surf2, justifyContent: 'center' }}>
      <T variant={mono ? 'data' : 'secondary'} style={{ fontSize: mono ? 13 : 14 }}>{text}</T>
    </View>
  );
}

/** Shown when the chapter is set earlier than the latest date read. */
export function FlashbackCard() {
  const { view, palette: p } = useApp();
  const fy = view.chapter.flashbackYear;
  const now = view.latest;
  if (fy == null || now == null) {
    if (view.chapter.ref.chapter.year == null) {
      return (
        <Card style={{ padding: 14 }}>
          <T variant="row">Date not given</T>
          <T variant="secondary" tone="ink2">No chapter marker on the timeline.</T>
        </Card>
      );
    }
    return null;
  }
  const x0 = view.minYear;
  const f = Math.min(1, Math.max(0, (fy - x0) / Math.max(0.1, now - x0)));
  const gap = Math.round(now - fy);
  return (
    <Card style={{ padding: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T variant="row">{gap >= 1 ? `A flashback of ${plural(gap, 'year')}` : 'Set a little earlier'}</T>
        <T variant="data" tone="ink3" style={{ fontSize: 11 }}>story time</T>
      </View>
      <View style={{ height: 34 }} accessibilityLabel={`Chapter set in ${monthYear(fy)}. Latest date read ${monthYear(now)}.`}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 20, height: 4, borderRadius: 2, backgroundColor: p.surf2 }} />
        <View style={{ position: 'absolute', left: `${f * 100}%`, top: 12, height: 20, width: 2 }}><DashedRule height={20} color={p.ink} width={2} /></View>
        <View style={{ position: 'absolute', left: `${f * 100}%`, top: -2, width: 120, marginLeft: -60, alignItems: 'center' }}>
          <View style={{ borderWidth: 1.5, borderColor: p.ink, borderRadius: 4, paddingHorizontal: 4, backgroundColor: p.surf }}>
            <T variant="tag" numberOfLines={1}>{`CH ${monthYear(fy).toUpperCase()}`}</T>
          </View>
        </View>
        <View style={{ position: 'absolute', right: 0, top: 12, height: 20, width: 2, backgroundColor: p.ink }} />
        <View style={{ position: 'absolute', right: 0, top: -2, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, backgroundColor: p.ink }}>
          <T variant="tag" color={p.inv}>NOW</T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 }}>
        <T variant="data" tone="ink3" style={{ fontSize: 11 }}>{yearText(x0)}</T>
        <T variant="data" tone="ink3" style={{ fontSize: 11 }}>{`latest read ${monthYear(now)}`}</T>
      </View>
    </Card>
  );
}

export function HereCard() {
  const { view, palette: p, colourOf } = useApp();
  const open = useOpenBob();
  const { narrator, here, lostHere, travelling, time, setting, system } = view.chapter;
  const labels = settingLabels(view);
  if (!narrator || !labels.place) return null;
  const when = view.chapter.ref.chapter.year != null ? monthYear(time) : 'now';
  // On a voyage the card lists the travelling party; the Bobs at the destination follow as one line.
  const voyage = setting === 'enroute' || setting === 'deep';
  const rows = voyage ? [narrator, ...travelling] : [narrator, ...travelling, ...here.filter((h) => !travelling.includes(h))];
  const ahead = voyage ? here : [];
  // A chapter set in a system the narrator isn't in (he follows it over SCUT): say where he is.
  const nl = setting === 'system' && time != null ? locAt(view, narrator, time) : null;
  const remoteFrom = nl && !nl.notYet && !nl.transit && nl.loc && nl.loc !== system ? nl.loc : null;
  return (
    <Card>
      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}>
        <SectionTitle title={`${labels.place}, ${when}`} right={<T variant="data" tone="ink3" style={{ fontSize: 11 }}>{voyage ? `${rows.length} aboard` : `${rows.length} here`}</T>} />
      </View>
      {rows.map((id) => (
        <Pressable key={id} onPress={() => open(id)} accessibilityRole="button" accessibilityLabel={id === narrator ? `${id}, narrating` : travelling.includes(id) ? `${id}, travelling with ${narrator}` : id}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 14, borderTopWidth: 1, borderColor: p.line2, backgroundColor: pressed ? p.sel : id === narrator ? withAlpha(colourOf(id), 0.14) : 'transparent' })}>
          <SwatchFor id={id} />
          <View style={{ flex: 1 }}>
            <T variant="row" weight={id === narrator ? '700' : '600'}>{id}</T>
            {id === narrator && remoteFrom ? <T variant="secondary" tone="ink2" style={{ fontSize: 12 }}>{`Following events from ${remoteFrom}`}</T> : null}
          </View>
          {id === narrator ? <Tag text="POV" /> : view.info.get(id)!.isNew ? <Tag text="NEW" /> : null}
        </Pressable>
      ))}
      {ahead.length ? (
        <View style={{ minHeight: 40, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderColor: p.line2 }}>
          <T variant="secondary" tone="ink2">
            {`At ${system}: `}
            <T variant="secondary" weight="600">{ahead.join(', ')}</T>
          </T>
        </View>
      ) : null}
      {lostHere.length && !voyage ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, paddingHorizontal: 14, borderTopWidth: 1, borderColor: p.line2 }}>
          <Icon name="lost" color={p.ink} size={14} strokeWidth={2.4} />
          <T variant="secondary" tone="ink2" style={{ flex: 1 }}>
            {'Lost here earlier: '}
            <T variant="secondary" weight="600">{lostHere.join(', ')}</T>
          </T>
        </View>
      ) : null}
    </Card>
  );
}

function SwatchFor({ id }: { id: string }) {
  const { colourOf } = useApp();
  return <View style={{ width: 8, height: 22, borderRadius: 3, backgroundColor: colourOf(id) }} />;
}

export function NarratorChips() {
  const { view } = useApp();
  const open = useOpenBob();
  const { narrator, here } = view.chapter;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {[narrator, ...here].filter(Boolean).map((id) => (
        <BobChip key={id!} id={id!} filled={id === narrator} onPress={() => open(id!)} />
      ))}
    </View>
  );
}

export const DISCLAIMER = 'Unofficial fan project. Not affiliated with Dennis E. Taylor. No book text.';

export function Disclaimer() {
  return (
    <T variant="secondary" tone="ink3" style={{ fontSize: 12 }}>
      {DISCLAIMER}
    </T>
  );
}
