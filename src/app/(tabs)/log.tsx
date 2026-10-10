// Log view: "What just changed?" Story-order events, scoped to the chapter just finished, this book or everything.
import { useMemo } from 'react';
import { ScrollView } from 'react-native';

import { FilterChip, Segmented } from '@/components/bits';
import { LogList } from '@/components/log-list';
import { Screen } from '@/components/screen';
import { buildLog, scopeLog, type EventKind, type LogScope } from '@/core';
import { useApp } from '@/state/app';

const KINDS: { kind: EventKind; label: string }[] = [
  { kind: 'birth', label: 'Births' },
  { kind: 'travel', label: 'Travel' },
  { kind: 'scut', label: 'SCUT' },
  { kind: 'fate', label: 'Fates' },
  { kind: 'milestone', label: 'Milestones' },
];

export default function LogScreen() {
  const { view, logScope, setLogScope, logKinds, toggleLogKind } = useApp();
  const all = useMemo(() => buildLog(view), [view]);
  const count = (s: LogScope) => scopeLog(all, view, s, logKinds).length;
  return (
    <Screen title="Log" subtitle="In story order" maxWidth={820}>
      <Segmented
        label="Scope"
        value={logScope}
        onChange={setLogScope}
        options={[
          { value: 'chapter', label: `Last chapter · ${count('chapter')}` },
          { value: 'book', label: `Book ${view.progress.book} · ${count('book')}` },
          { value: 'all', label: `All · ${count('all')}` },
        ]}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {KINDS.map((k) => <FilterChip key={k.kind} label={k.label} on={logKinds.has(k.kind)} onPress={() => toggleLogKind(k.kind)} />)}
      </ScrollView>
      <LogList />
    </Screen>
  );
}
