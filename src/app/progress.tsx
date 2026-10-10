// Reading-position picker. Read chapters show their narrator's colour; unread chapters show only a number,
// so narrators, dates and places past the reader's position never appear. Jumping forward more than one
// chapter asks first, so a mistaken tap can't spoil anything.
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';

import { Card } from '@/components/bits';
import { closeSheet, SheetFrame } from '@/components/sheet';
import { T } from '@/components/text';
import { chapterDate, chapterIndex, chapterLabel, chapterSpoken, distance, narratorOf, stepProgress, type Progress } from '@/core';
import { useApp } from '@/state/app';
import { identityColour } from '@/theme/identity';

function confirmJump(chapters: number, go: () => void) {
  const msg = `Moves you ${chapters} chapters ahead and reveals everything before that chapter.`;
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(msg) ?? true) go();
    return;
  }
  Alert.alert('Jump ahead?', msg, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Jump ahead', onPress: go },
  ]);
}

export default function ProgressSheet() {
  const { view } = useApp();
  // Remount when the saved position loads (web direct visits) so the picker starts at the current chapter.
  return <ProgressPicker key={`${view.progress.book}:${view.progress.chapter}`} />;
}

function ProgressPicker() {
  const { view, setProgress, palette: p } = useApp();
  const model = view.model;
  const current = view.progress;
  const curIndex = view.index;
  const [book, setBook] = useState(current.book);
  const [picked, setPicked] = useState<Progress>(current);
  const bookRec = model.data.books.find((b) => b.id === book)!;
  const pickedIndex = chapterIndex(model, picked.book, picked.chapter);
  const pickedRef = model.chapters[pickedIndex];
  const pickedRead = pickedIndex <= curIndex;

  // Parts (Book 4) are shown as headers, using each chapter's label.
  const groups = useMemo(() => {
    const out: { part: string | null; chapters: typeof bookRec.chapters }[] = [];
    for (const c of bookRec.chapters) {
      const part = c.label?.match(/^(Part \d+)/)?.[1] ?? null;
      const last = out[out.length - 1];
      if (!last || last.part !== part) out.push({ part, chapters: [c] });
      else last.chapters.push(c);
    }
    return out;
  }, [bookRec]);

  const apply = () => {
    const d = distance(model, current, picked);
    const go = () => {
      setProgress(picked);
      closeSheet();
    };
    if (d > 1) confirmJump(d, go);
    else go();
  };

  return (
    <SheetFrame
      title="Reading position"
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => { setProgress(stepProgress(model, current, -1)); closeSheet(); }}
            accessibilityRole="button" style={{ flex: 1, height: 50, borderRadius: 14, borderWidth: 1, borderColor: p.line, backgroundColor: p.surf, alignItems: 'center', justifyContent: 'center' }}>
            <T variant="row">Back one</T>
          </Pressable>
          <Pressable onPress={apply} accessibilityRole="button" style={{ flex: 2, height: 50, borderRadius: 14, backgroundColor: p.ink, alignItems: 'center', justifyContent: 'center' }}>
            <T variant="row" color={p.inv}>{distance(model, current, picked) === 0 ? 'Done' : `Go to ${chapterLabel(pickedRef.chapter)}`}</T>
          </Pressable>
        </View>
      }>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 6 }}>
        {model.data.books.map((b) => {
          const on = b.id === book;
          const read = b.id < current.book;
          return (
            <Pressable key={b.id} onPress={() => setBook(b.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`Book ${b.id}, ${b.title}`}
              style={{ flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: on ? p.ink : p.line, backgroundColor: on ? p.ink : read ? p.surf2 : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              <T variant="data" weight="600" style={{ fontSize: 15 }} color={on ? p.inv : read ? p.ink : p.ink2}>{String(b.id)}</T>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T variant="headline">{bookRec.title}</T>
        <T variant="data" tone="ink2">{`${bookRec.chapters.length} chapters`}</T>
      </View>

      <Card style={{ padding: 14, gap: 6 }}>
        <T variant="tag" tone="ink2" style={{ fontSize: 11 }}>{`${pickedIndex === curIndex ? (view.finished ? 'FINISHED' : 'ABOUT TO READ') : 'SELECTED'} · B${picked.book} · ${chapterLabel(pickedRef.chapter).toUpperCase()}`}</T>
        {pickedRead ? (
          <>
            <T variant="headline">{pickedRef.chapter.pov ? `${pickedRef.chapter.pov} narrates` : 'Narrator not given'}</T>
            <T variant="secondary" tone="ink2">
              {[chapterDate(pickedRef.chapter) ?? 'Date not given', pickedRef.chapter.place].filter(Boolean).join(' · ')}
            </T>
          </>
        ) : (
          <T variant="secondary" tone="ink2">Narrator, date and place are hidden until you get there.</T>
        )}
      </Card>

      {groups.map((g) => (
        <View key={g.part ?? 'all'} style={{ gap: 8 }}>
          {g.part ? <T variant="tag" tone="ink2" style={{ fontSize: 11 }}>{g.part.toUpperCase()}</T> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {g.chapters.map((c) => {
              const idx = chapterIndex(model, book, c.n);
              const read = idx <= curIndex;
              const isCur = idx === curIndex;
              const isPicked = book === picked.book && c.n === picked.chapter;
              const n = read ? narratorOf(model, c) : null;
              const bar = n ? identityColour(model.slotOf.get(n) ?? 0, p.scheme) : 'transparent';
              const label = c.label ? c.label.replace(/^Part \d+ · Ch /, '') : String(c.n);
              return (
                <Pressable key={c.n} onPress={() => setPicked({ book, chapter: c.n })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isPicked }}
                  accessibilityLabel={`${chapterSpoken(c)}${isCur ? ', current' : read ? ', read' : ', not read yet'}${read && c.pov ? `, narrated by ${c.pov}` : ''}`}
                  style={{ width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 3,
                    backgroundColor: isCur ? p.ink : read ? p.surf : 'transparent', borderWidth: isPicked && !isCur ? 2 : 1, borderStyle: read ? 'solid' : 'dashed', borderColor: isPicked ? p.ink : p.line }}>
                  <T variant="data" weight={isCur ? '700' : '500'} style={{ fontSize: 14 }} color={isCur ? p.inv : read ? p.ink : p.ink2}>{label}</T>
                  <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: bar }} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </SheetFrame>
  );
}
