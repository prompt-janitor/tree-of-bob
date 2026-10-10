// About: what the app is, the unofficial and no-warranty notes, theme, privacy, links and the data notice.
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';

import { Card, Segmented } from '@/components/bits';
import { Icon } from '@/components/icon';
import { SheetFrame } from '@/components/sheet';
import { T } from '@/components/text';
import { useApp, usePalette, type ThemePref } from '@/state/app';

const ISSUES = 'https://github.com/prompt-janitor/tree-of-bob/issues';
const AUTHOR_SITE = 'http://dennisetaylor.org/';

const openUrl = (url: string) => Linking.openURL(url).catch(() => {});

/** A full-width row that opens a link or another screen. */
function LinkRow({ label, onPress, external }: { label: string; onPress: () => void; external?: boolean }) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={label}
      accessibilityHint={external ? 'Opens in your web browser' : undefined}
      style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: p.line, backgroundColor: p.surf, opacity: pressed ? 0.6 : 1 })}>
      <T variant="row">{label}</T>
      <Icon name={external ? 'arrow' : 'chevronRight'} size={18} color={p.ink2} />
    </Pressable>
  );
}

export default function AboutSheet() {
  const { themePref, setThemePref, validation, palette: p } = useApp();
  const version = Constants.expoConfig?.version;
  return (
    <SheetFrame title="About">
      <T variant="body">{"Spoiler-free companion to Dennis E. Taylor's Bobiverse books."}</T>

      <View style={{ gap: 4 }}>
        <T variant="secondary" tone="ink2">
          {'Unofficial fan project. Not affiliated with Dennis E. Taylor or his publishers. No book text.'}
        </T>
        <Pressable
          onPress={() => openUrl(AUTHOR_SITE)}
          accessibilityRole="link"
          accessibilityLabel="Author's site, dennisetaylor.org"
          accessibilityHint="Opens in your web browser"
          style={({ pressed }) => ({ minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}>
          <T variant="secondary" weight="600" style={{ textDecorationLine: 'underline' }}>{"Author's site"}</T>
          <Icon name="arrow" size={16} color={p.ink2} />
        </Pressable>
        <T variant="secondary" tone="ink2">AI-generated. May contain errors. Provided as is, without warranty or liability.</T>
      </View>

      <View style={{ gap: 8 }}>
        <T variant="row">Appearance</T>
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
      </View>

      <T variant="secondary" tone="ink2">No data collected.</T>

      <View style={{ gap: 8 }}>
        <LinkRow label="Report an error" external onPress={() => openUrl(ISSUES)} />
        <LinkRow label="Credits & licences" onPress={() => router.push('/licenses')} />
      </View>

      {version ? <T variant="data" tone="ink3">{`Version ${version}`}</T> : null}
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
