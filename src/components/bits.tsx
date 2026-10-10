// Small shared pieces: tags, swatches, monograms, chips, cards, segmented control, section headers.
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { T } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { useApp, usePalette } from '@/state/app';
import { radius } from '@/theme/tokens';

/** Ink tag: POV, NEW, EST, CH… Solid for emphasis, outlined otherwise. */
export function Tag({ text, solid = true }: { text: string; solid?: boolean }) {
  const p = usePalette();
  return (
    <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: radius.tag, backgroundColor: solid ? p.ink : 'transparent', borderWidth: solid ? 0 : 1, borderColor: p.ink3 }}>
      <T variant="tag" color={solid ? p.inv : p.ink2}>{text}</T>
    </View>
  );
}

/** Identity colour bar shown beside a Bob's name. */
export function Swatch({ id, w = 6, h = 22 }: { id: string; w?: number; h?: number }) {
  const { colourOf } = useApp();
  return <View style={{ width: w, height: h, borderRadius: Math.min(3, w / 2), backgroundColor: colourOf(id) }} />;
}

export function Monogram({ id, size = 48 }: { id: string; size?: number }) {
  const { colourOf, view, palette } = useApp();
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.27, backgroundColor: colourOf(id), alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden>
      <T variant="data" color={palette.onIdentity} style={{ fontSize: size * 0.32, lineHeight: size * 0.4, fontWeight: '600' }}>
        {view.info.get(id)?.monogram ?? '??'}
      </T>
    </View>
  );
}

/** A Bob as a tappable chip. The narrator's chip is filled with his colour. */
/** minHeight 34 suits dense rows; pass 44 where the chip is a touch target in a list (hitSlop does nothing on web). */
export function BobChip({ id, onPress, filled, note, minHeight = 34 }: { id: string; onPress?: () => void; filled?: boolean; note?: string; minHeight?: number }) {
  const { colourOf, palette: p } = useApp();
  const c = colourOf(id);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={note ? `${id}, ${note}` : id}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight, paddingLeft: 8, paddingRight: 11, borderRadius: radius.chip, backgroundColor: filled ? c : p.surf2, opacity: pressed ? 0.7 : 1 })}>
      {!filled && <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c }} />}
      <T variant="row" weight={filled ? '700' : '500'} color={filled ? p.onIdentity : p.ink} style={{ fontSize: 14 }}>
        {id}
      </T>
      {note ? <T variant="data" tone="ink3" style={{ fontSize: 11 }}>{note}</T> : null}
    </Pressable>
  );
}

/** Another replicant (not a Bob) as a tappable chip: square, outlined, ink only, never an identity colour, with his
 * kind as the note. */
/** "Brazilian Empire replicant probe (Major Ernesto Medeiros)" -> "Brazilian Empire replicant probe". */
export function shortKind(kind: string | null | undefined): string | undefined {
  const k = kind?.split(';')[0].replace(/\s*\(.*?\)\s*/g, ' ').trim();
  return k || undefined;
}

export function OtherChip({ id, kind, note, onPress, minHeight = 34 }: { id: string; kind?: string | null; note?: string; onPress?: () => void; minHeight?: number }) {
  const p = usePalette();
  const extra = [kind, note].filter(Boolean).join(', ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${id}, other replicant${extra ? `, ${extra}` : ''}`}
      accessibilityHint="Opens Other replicants"
      hitSlop={5}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight, maxWidth: '100%', paddingLeft: 8, paddingRight: 11, borderRadius: radius.tag, borderWidth: 1, borderColor: p.ink2, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 10, height: 10, borderWidth: 1.5, borderColor: p.ink }} />
      <T variant="row" weight="500" style={{ fontSize: 14, flexShrink: 0 }}>{id}</T>
      {kind ? <T variant="data" tone="ink3" numberOfLines={1} style={{ fontSize: 11, flexShrink: 1 }}>{kind}</T> : null}
      {note ? <T variant="data" tone="ink3" style={{ fontSize: 11 }}>{note}</T> : null}
    </Pressable>
  );
}

export function Card({ children, style, outlined }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; outlined?: boolean }) {
  const p = usePalette();
  return <View style={[{ backgroundColor: p.surf, borderRadius: radius.card, borderWidth: 1, borderColor: outlined ? p.ink : p.line, overflow: 'hidden' }, style]}>{children}</View>;
}

export function SectionTitle({ title, count, right }: { title: string; count?: number | string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 }}>
        <T variant="row" weight="700" style={{ flexShrink: 1 }}>{title}</T>
        {count != null ? <T variant="data" tone="ink3">{count}</T> : null}
      </View>
      {right}
    </View>
  );
}

/** minHeight is the height of each segment, which is its touch target (the 3 pt padding round them is not). */
export function Segmented<V extends string>({ value, options, onChange, label, minHeight = 34 }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; label: string; minHeight?: number }) {
  const p = usePalette();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', backgroundColor: p.surf2, borderRadius: 10, padding: 3, gap: 2 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, backgroundColor: on ? p.surf : 'transparent', shadowColor: '#000', shadowOpacity: on ? 0.12 : 0, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }}>
            <T variant="secondary" weight={on ? '600' : '400'} tone={on ? 'ink' : 'ink2'} numberOfLines={1}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function IconButton({ icon, label, onPress, size = 44, color }: { icon: IconName; label: string; onPress: () => void; size?: number; color?: string }) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={({ pressed }) => ({ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} color={color ?? p.ink} />
    </Pressable>
  );
}

export function FilterChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={{ minHeight: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: on ? p.ink : p.line, backgroundColor: on ? p.ink : 'transparent', justifyContent: 'center' }}>
      <T variant="secondary" weight="500" color={on ? p.inv : p.ink2}>{label}</T>
    </Pressable>
  );
}
