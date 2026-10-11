// About: what the app is; its version, any waiting update and the release notes; theme; links; and the fine print
// (unofficial, no book text, AI-generated, no warranty, no data collected). Every section is a small heading over a
// card of rows, so the screen reads the same from top to bottom.
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Card, Segmented } from '@/components/bits';
import { Icon } from '@/components/icon';
import { SheetFrame } from '@/components/sheet';
import { T } from '@/components/text';
import releases from '@/data/releases.json';
import { useUpdate } from '@/hooks/use-update';
import { useApp, usePalette, type ThemePref } from '@/state/app';

const ISSUES = 'https://github.com/prompt-janitor/tree-of-bob/issues';
const AUTHOR_SITE = 'http://dennisetaylor.org/';

const openUrl = (url: string) => Linking.openURL(url).catch(() => {});

/** A section: a small heading over its content. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <T variant="overline" tone="ink2" weight="600" accessibilityRole="header">{title.toUpperCase()}</T>
      {children}
    </View>
  );
}

/** A 44 pt row inside a card; rows after the first get a hairline above them. */
function Row({ children, first, onPress, label, hint, role, expanded }: { children: ReactNode; first?: boolean; onPress?: () => void; label?: string; hint?: string; role?: 'button' | 'link'; expanded?: boolean }) {
  const p = usePalette();
  const style = { minHeight: 44, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: first ? 0 : 1, borderTopColor: p.line };
  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole={role ?? 'button'} accessibilityLabel={label} accessibilityHint={hint} accessibilityState={expanded != null ? { expanded } : undefined} style={({ pressed }) => [style, { opacity: pressed ? 0.6 : 1 }]}>
      {children}
    </Pressable>
  );
}

/** A row that opens a link (outside the app) or another screen. */
function LinkRow({ label, onPress, external, first }: { label: string; onPress: () => void; external?: boolean; first?: boolean }) {
  const p = usePalette();
  return (
    <Row first={first} onPress={onPress} label={label} role={external ? 'link' : 'button'} hint={external ? 'Opens in your web browser' : undefined}>
      <T variant="row">{label}</T>
      <Icon name={external ? 'arrow' : 'chevronRight'} size={18} color={p.ink2} />
    </Row>
  );
}

export default function AboutSheet() {
  const { themePref, setThemePref, validation, palette: p } = useApp();
  const version = Constants.expoConfig?.version;
  // The commit the web build was made from (set by the Pages workflow), so a phone's build can be told apart.
  const build = process.env.EXPO_PUBLIC_BUILD?.slice(0, 7);
  const update = useUpdate();
  const [notesOpen, setNotesOpen] = useState(false);
  return (
    <SheetFrame title="About">
      <T variant="body">{"Spoiler-free companion to Dennis E. Taylor's Bobiverse books."}</T>

      <Section title="Version">
        <Card>
          <Row first>
            <T variant="row">Version</T>
            <T variant="data" tone="ink2">{[version, build].filter(Boolean).join(' · ')}</T>
          </Row>
          {update.available ? (
            <Row>
              <T variant="row" style={{ flex: 1 }}>New version available.</T>
              <Pressable
                onPress={update.apply}
                accessibilityRole="button"
                accessibilityLabel="Update to the new version"
                style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: p.ink, opacity: pressed ? 0.6 : 1 })}>
                <T variant="secondary" weight="600" color={p.inv}>Update</T>
              </Pressable>
            </Row>
          ) : null}
          <Row onPress={() => setNotesOpen((o) => !o)} label="Release notes" expanded={notesOpen}>
            <T variant="row">Release notes</T>
            <View style={{ transform: [{ rotate: notesOpen ? '180deg' : '0deg' }] }}>
              <Icon name="chevronDown" size={18} color={p.ink2} />
            </View>
          </Row>
          {notesOpen
            ? releases.map((r) => (
                <View key={r.version} style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 4, borderTopWidth: 1, borderTopColor: p.line }}>
                  <T variant="data" weight="600">{r.version}</T>
                  {r.notes.map((n) => <T key={n} variant="secondary" tone="ink2">{n}</T>)}
                </View>
              ))
            : null}
        </Card>
      </Section>

      <Section title="Appearance">
        <Segmented<ThemePref>
          label="Theme"
          value={themePref}
          onChange={setThemePref}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Section>

      <Section title="Links">
        <Card>
          <LinkRow first label="Author's site" external onPress={() => openUrl(AUTHOR_SITE)} />
          <LinkRow label="Report an error" external onPress={() => openUrl(ISSUES)} />
          <LinkRow label="Credits & licences" onPress={() => router.push('/licenses')} />
        </Card>
      </Section>

      <View style={{ gap: 6 }}>
        <T variant="secondary" tone="ink2">Unofficial fan project. Not affiliated with Dennis E. Taylor or his publishers. No book text.</T>
        <T variant="secondary" tone="ink2">AI-generated. May contain errors. Provided as is, without warranty or liability.</T>
        <T variant="secondary" tone="ink2">No data collected.</T>
      </View>

      {validation.errors.length ? (
        <Card style={{ padding: 14, gap: 6 }}>
          <T variant="row">{`Data problem: ${validation.errors.length} issue${validation.errors.length === 1 ? '' : 's'}`}</T>
          <T variant="secondary" tone="ink2">Some records failed validation and may show incorrectly.</T>
          {validation.errors.slice(0, 20).map((e, i) => <T key={i} variant="data" tone="ink2" selectable>{e}</T>)}
        </Card>
      ) : null}
    </SheetFrame>
  );
}
