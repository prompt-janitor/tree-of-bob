// Bob details: shared by the iPhone sheet and the iPad/web inspector column.
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BobChip, Card, Monogram, SectionTitle, Tag } from '@/components/bits';
import { Icon } from '@/components/icon';
import { JourneyLine, JourneyModeSwitch, type JourneyMode } from '@/components/journey-line';
import { T } from '@/components/text';
import { ancestors, monthYear, revealLong, settingLabels, whenEstimated, whenShort, yearText, type ProgressView } from '@/core';
import { useOpenBob } from '@/hooks/use-open-bob';
import { useApp } from '@/state/app';

let sourcesWarned = false;

export function BobDetails({ id, heading }: { id: string; heading?: string }) {
  const { view, palette: p, colourOf } = useApp();
  const open = useOpenBob();
  const I = view.info.get(id);
  const [showSources, setShowSources] = useState(false);
  const [journeyMode, setJourneyMode] = useState<JourneyMode>('network');
  if (!I) return <T variant="secondary" tone="ink2">Not revealed yet.</T>;
  const b = I.bob;
  const line = [...ancestors(view, id)].reverse();
  const narratorSince = narratorSinceLabel(view, id);
  const isNarrator = view.chapter.narrator === id;
  const parent = b.parent && view.info.has(b.parent) ? b.parent : null;
  const altCount = I.alts.length;

  return (
    <View style={{ gap: 14 }}>
      {heading ? <T variant="overline" tone="ink2">{heading}</T> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Monogram id={id} size={52} />
        <View style={{ flexShrink: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T variant="title" style={{ fontSize: 26, lineHeight: 30 }} accessibilityRole="header">{id}</T>
            {isNarrator ? <Tag text="POV" /> : I.isNew ? <Tag text="NEW" /> : null}
          </View>
          <T variant="data" tone="ink2">
            {[I.generation ? `GEN ${I.generation}` : 'PARENT NOT KNOWN', narratorSince ? `NARRATOR SINCE ${narratorSince}` : null, b.members?.length ? 'GROUP' : null].filter(Boolean).join(' · ')}
          </T>
        </View>
      </View>

      {line.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }} accessibilityLabel={`Line: ${[...line, id].join(', ')}`}>
          {[...line, id].map((a, i) => (
            <View key={a} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable onPress={() => a !== id && open(a)} disabled={a === id} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 28 }}>
                <View style={{ width: 6, height: 14, borderRadius: 2, backgroundColor: colourOf(a) }} />
                <T variant="secondary" weight={a === id ? '700' : '500'} tone={a === id ? 'ink' : 'ink2'} style={{ fontSize: 14 }}>{a}</T>
              </Pressable>
              {i < line.length ? <Icon name="chevronRight" color={p.ink3} size={10} strokeWidth={2.6} /> : null}
            </View>
          ))}
        </View>
      ) : null}

      {b.about ? <T variant="body">{b.about}</T> : null}
      {b.members?.length ? <T variant="secondary" tone="ink2">{`Members: ${b.members.join(', ')}`}</T> : null}

      <Card>
        <Fact label="Copied from" first>
          {parent ? <LinkName id={parent} /> : <T variant="row" tone="ink2" weight="500">Not known</T>}
        </Fact>
        {I.madeBy ? <Fact label="Made by"><LinkName id={I.madeBy} /></Fact> : null}
        <Fact label="Created">
          <T variant="row" weight="500">{[whenShort(b.when) ?? (I.bornEstimated ? null : monthYear(I.born)), b.where].filter(Boolean).join(' · ') || 'Not known'}</T>
          {I.bornEstimated || whenEstimated(b.when) ? <Tag text="EST" solid={false} /> : null}
        </Fact>
        <Fact label="First appears"><T variant="data" style={{ fontSize: 13 }}>{revealLong(view.model, b.reveal)}</T></Fact>
        <Fact label="Now"><T variant="row">{nowLong(view, id)}</T></Fact>
      </Card>

      {isNarrator && settingLabels(view).place ? (
        <View style={{ gap: 8 }}>
          <SectionTitle title={`${settingLabels(view).place}, ${view.chapter.ref.chapter.year != null ? monthYear(view.chapter.time) : 'now'}`} />
          {view.chapter.travelling.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {view.chapter.travelling.map((h) => <BobChip key={h} id={h} note="travelling with him" onPress={() => open(h)} />)}
            </View>
          ) : null}
          {view.chapter.setting !== 'deep' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {view.chapter.here.filter((h) => !view.chapter.travelling.includes(h)).length
                ? view.chapter.here.filter((h) => !view.chapter.travelling.includes(h)).map((h) => <BobChip key={h} id={h} note={view.chapter.setting === 'enroute' ? `at ${view.chapter.system}` : undefined} onPress={() => open(h)} />)
                : !view.chapter.travelling.length ? <T variant="secondary" tone="ink2">No other Bobs here.</T> : null}
            </View>
          ) : null}
          {view.chapter.lostHere.length && view.chapter.setting !== 'enroute' && view.chapter.setting !== 'deep' ? <T variant="secondary" tone="ink2">{`Lost here earlier: ${view.chapter.lostHere.join(', ')}`}</T> : null}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <SectionTitle title="Copies" count={I.kids.length} />
        {I.kids.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {I.kids.map((k) => <BobChip key={k} id={k} onPress={() => open(k)} />)}
          </View>
        ) : (
          <T variant="secondary" tone="ink2">None so far.</T>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <SectionTitle title="Journey" right={<JourneyModeSwitch value={journeyMode} onChange={setJourneyMode} />} />
        <JourneyLine view={view} id={id} mode={journeyMode} />
      </View>

      {I.fates.length ? (
        <View style={{ gap: 8 }}>
          <SectionTitle title="Fate" count={I.fates.length} />
          <Card style={{ padding: 14, gap: 8 }}>
            {I.fates.map((f, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                <T variant="data" tone="ink2" style={{ width: 40 }}>{yearText(f.year)}</T>
                <T variant="secondary" style={{ flex: 1 }}>
                  <T variant="secondary" weight="700">{(f.status ?? 'lost') === 'alive' ? 'Back. ' : (f.status ?? (f.partial ? 'missing' : 'lost')) === 'missing' ? 'Missing. ' : 'Lost. '}</T>
                  {f.text ?? ''}
                </T>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          if (!showSources) sourcesWarned = true;
          setShowSources((s) => !s);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: showSources }}>
        <Card style={{ padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="row">Sources and confidence</T>
              <T variant="secondary" tone="ink2">
                {`${capital(b.confidence ?? 'unknown')} · ${b.sources?.length ?? 0} sources${altCount ? ` · ${altCount} disagree${altCount === 1 ? 's' : ''}` : ''}`}
              </T>
            </View>
            <View style={{ transform: [{ rotate: showSources ? '180deg' : '0deg' }] }}>
              <Icon name="chevronDown" color={p.ink3} size={16} strokeWidth={2.2} />
            </View>
          </View>
          {showSources ? (
            <Animated.View entering={FadeIn.duration(180)} style={{ gap: 8 }}>
              {sourcesWarned ? <T variant="secondary" tone="ink2">Linked sources may describe events past your position.</T> : null}
              {(b.sources ?? []).map((s, i) => <T key={i} variant="secondary" selectable>{s}</T>)}
              {I.alts.map((a, i) => (
                <View key={`a${i}`} style={{ borderTopWidth: 1, borderColor: p.line2, paddingTop: 8, gap: 2 }}>
                  <T variant="secondary" weight="600">Disagreeing source</T>
                  <T variant="secondary" tone="ink2">
                    {[a.parent ? `Copied from ${a.parent}` : null, a.born != null ? `Created ${yearText(a.born)}` : null, a.where ? `At ${a.where}` : null].filter(Boolean).join(' · ')}
                  </T>
                  <T variant="secondary" tone="ink3" selectable>{a.source}</T>
                </View>
              ))}
            </Animated.View>
          ) : null}
        </Card>
      </Pressable>
    </View>
  );
}

function Fact({ label, children, first }: { label: string; children: React.ReactNode; first?: boolean }) {
  const p = useApp().palette;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 14, paddingVertical: 6, gap: 10, borderTopWidth: first ? 0 : 1, borderColor: p.line2 }}>
      <T variant="secondary" tone="ink2" style={{ width: 104 }}>{label}</T>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{children}</View>
    </View>
  );
}

function LinkName({ id }: { id: string }) {
  const { colourOf } = useApp();
  const open = useOpenBob();
  return (
    <Pressable onPress={() => open(id)} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 6, height: 14, borderRadius: 2, backgroundColor: colourOf(id) }} />
      <T variant="row" style={{ textDecorationLine: 'underline' }}>{id}</T>
    </Pressable>
  );
}

function capital(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}

function narratorSinceLabel(view: ProgressView, id: string): string | null {
  const r = view.model.povFirst.get(id);
  if (r == null || r > view.P) return null;
  return `B${Math.floor(r / 10000)}·${r % 10000}`;
}

function nowLong(view: ProgressView, id: string): string {
  const I = view.info.get(id)!;
  if (I.status === 'lost') return `Lost ${yearText(I.end)}`;
  if (I.status === 'missing') return 'Missing';
  if (I.inTransit) return `In transit to ${I.inTransit.to ?? 'an unknown destination'}`;
  const arrived = [...I.moves].reverse().find((m) => m.kind === 'arrive');
  return I.loc ? `${I.loc}${arrived?.year ? `, since ${yearText(arrived.year)}` : ''}` : 'Location not given';
}

