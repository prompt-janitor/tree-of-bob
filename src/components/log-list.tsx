// Event log list, capped with "Show more". Current-chapter events are emphasised.
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/bits';
import { Icon, type IconName } from '@/components/icon';
import { T } from '@/components/text';
import { buildLog, monthYear, revealTag, scopeLog, yearText, type EventKind } from '@/core';
import { useOpenBob } from '@/hooks/use-open-bob';
import { useApp } from '@/state/app';

const PAGE = 50;
const ICONS: Record<EventKind, IconName> = { birth: 'plus', travel: 'arrow', scut: 'link', fate: 'lost', milestone: 'flag' };

export function LogList() {
  const { view, palette: p, colourOf, logScope, logKinds } = useApp();
  const open = useOpenBob();
  const [limit, setLimit] = useState(PAGE);
  const all = useMemo(() => buildLog(view), [view]);
  const events = useMemo(() => scopeLog(all, view, logScope, logKinds), [all, view, logScope, logKinds]);
  const shown = useMemo(
    () => events.slice(-limit).map((e, i, arr) => ({ e, head: i === 0 || yearText(arr[i - 1].year) !== yearText(e.year) })),
    [events, limit],
  );
  if (!events.length) {
    return (
      <Card style={{ padding: 16 }}>
        <T variant="secondary" tone="ink2">{logScope === 'chapter' ? 'Nothing new in the last chapter.' : 'No events match these filters.'}</T>
      </Card>
    );
  }
  return (
    <Card>
      {events.length > shown.length ? (
        <Pressable onPress={() => setLimit((l) => l + PAGE)} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderColor: p.line2 }}>
          <T variant="secondary" weight="600">{`Show ${Math.min(PAGE, events.length - shown.length)} earlier events`}</T>
        </Pressable>
      ) : null}
      {shown.map(({ e, head }) => {
        const y = yearText(e.year);
        return (
          <View key={e.key}>
            {head ? (
              <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 }}>
                <T variant="tag" tone="ink3" style={{ fontSize: 11 }}>{y}</T>
              </View>
            ) : null}
            <Pressable
              onPress={() => e.bob && open(e.bob)}
              disabled={!e.bob}
              accessibilityRole={e.bob ? 'button' : 'text'}
              accessibilityLabel={`${e.bob && e.lead ? e.bob + ' ' : ''}${e.text}. ${e.when ?? monthYear(e.year)}. Revealed in book ${e.reveal.book} chapter ${e.reveal.chapter}${e.isCurrent ? ', last chapter' : ''}.`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: pressed ? p.sel : e.isCurrent ? p.tintInk : 'transparent' })}>
              <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: p.surf2, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={ICONS[e.kind]} color={p.ink} size={14} strokeWidth={2} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="secondary" style={{ fontSize: 14, lineHeight: 19 }}>
                  {e.bob && e.lead ? <T variant="secondary" weight="600" style={{ fontSize: 14 }}>{e.bob + ' '}</T> : null}
                  {e.text}
                </T>
                <T variant="data" tone="ink3" style={{ fontSize: 11 }}>{e.when ?? monthYear(e.year)}</T>
              </View>
              {e.bob ? <View style={{ width: 6, height: 12, borderRadius: 2, marginTop: 4, backgroundColor: colourOf(e.bob) }} /> : null}
              <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, backgroundColor: e.isCurrent ? p.ink : 'transparent', borderWidth: 1, borderColor: e.isCurrent ? p.ink : p.ink3 }}>
                <T variant="tag" color={e.isCurrent ? p.inv : p.ink2}>{revealTag(e.reveal)}</T>
              </View>
            </Pressable>
          </View>
        );
      })}
    </Card>
  );
}
