// Search: only Bobs, systems and other replicants already revealed. The no-result message is the same
// whether or not the name exists later in the books.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Card, Monogram } from '@/components/bits';
import { Icon } from '@/components/icon';
import { SheetFrame } from '@/components/sheet';
import { T } from '@/components/text';
import { revealTag, search, type SearchHit } from '@/core';
import { useLayout } from '@/hooks/use-layout';
import { useOpenBob } from '@/hooks/use-open-bob';
import { useApp } from '@/state/app';
import { fonts } from '@/theme/tokens';

export default function SearchSheet() {
  const { view, palette: p, select, setFilter } = useApp();
  const { compact } = useLayout();
  const openBob = useOpenBob();
  const [q, setQ] = useState('');
  const hits = useMemo(() => search(view, q), [view, q]);

  const choose = (h: SearchHit) => {
    if (h.kind === 'bob') {
      router.dismissTo('/tree');
      // Compact widths open his details (a sheet on iPhone, an in-page sheet on the web, never a /bob URL on
      // the web). Wide widths select him, which opens the side drawer.
      if (compact) setTimeout(() => openBob(h.id), 50);
      else select(h.id);
    } else if (h.kind === 'system') {
      setFilter({ kind: 'system', name: h.name });
      router.dismissTo('/tree');
    } else {
      router.dismissTo('/others');
    }
  };

  return (
    <SheetFrame title="Search">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: p.surf2 }}>
        <Icon name="search" color={p.ink2} size={18} />
        <TextInput
          value={q}
          onChangeText={setQ}
          autoFocus
          autoCorrect={false}
          autoCapitalize="words"
          placeholder="Bobs, systems, others you've met"
          placeholderTextColor={p.ink3}
          accessibilityLabel="Search Bobs, systems and other replicants you have met"
          returnKeyType="search"
          onSubmitEditing={() => hits[0] && choose(hits[0])}
          style={{ flex: 1, fontSize: 17, color: p.ink, fontFamily: fonts.sans, height: 44 }}
        />
      </View>
      {q.trim() && !hits.length ? <T variant="secondary" tone="ink2">No one by that name so far.</T> : null}
      {hits.length ? (
        <Card>
          {hits.map((h, i) => {
            const key = h.kind === 'system' ? `s:${h.name}` : `${h.kind}:${h.id}`;
            const I = h.kind === 'bob' ? view.info.get(h.id)! : null;
            const other = h.kind === 'other' ? view.others.find((o) => o.id === h.id) : null;
            const title = h.kind === 'system' ? h.name : h.id;
            const sub =
              h.kind === 'bob'
                ? [I!.generation ? `Gen ${I!.generation}` : 'Parent not known', I!.bob.parent && view.info.has(I!.bob.parent) ? `copied from ${I!.bob.parent}` : null, I!.now].filter(Boolean).join(' · ')
                : h.kind === 'system'
                  ? 'Star system · show who is there'
                  : other?.kind ?? 'Other replicant';
            return (
              <Pressable key={key} onPress={() => choose(h)} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: p.line2, backgroundColor: pressed ? p.sel : 'transparent' })}>
                {h.kind === 'bob' ? <Monogram id={h.id} size={36} /> : (
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: p.surf2, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={h.kind === 'system' ? 'systems' : 'others'} color={p.ink} size={18} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="row" style={{ fontSize: 16 }}>{title}</T>
                  <T variant="secondary" tone="ink2" numberOfLines={1}>{sub}</T>
                </View>
                {I ? <T variant="data" tone="ink3" style={{ fontSize: 11 }}>{revealTag(I.bob.reveal)}</T> : null}
              </Pressable>
            );
          })}
        </Card>
      ) : null}
      <T variant="secondary" tone="ink2">{view.finished ? 'Covers the whole series.' : `Covers what you have met before Book ${view.progress.book}, ${view.chapter.ref.chapter.label ?? 'Ch ' + view.progress.chapter}.`}</T>
    </SheetFrame>
  );
}
