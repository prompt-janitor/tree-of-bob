// Type scale. On iOS these map onto SF Pro / SF Mono and scale with Dynamic Type
// (React Native scales Text by the system font size); on the web they use Instrument Sans / IBM Plex Mono.
import { Text, type TextProps, type TextStyle } from 'react-native';

import { usePalette } from '@/state/app';
import { fonts } from '@/theme/tokens';

export type Variant = 'display' | 'title' | 'headline' | 'body' | 'row' | 'secondary' | 'data' | 'tag' | 'overline';
export type Tone = 'ink' | 'ink2' | 'ink3' | 'inv';

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.3 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  row: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  secondary: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  data: { fontSize: 12, lineHeight: 16, fontWeight: '500', fontFamily: fonts.mono, fontVariant: ['tabular-nums'] },
  tag: { fontSize: 10, lineHeight: 12, fontWeight: '600', fontFamily: fonts.mono, letterSpacing: 0.4 },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '500', fontFamily: fonts.mono, letterSpacing: 0.5 },
};

export interface TProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  weight?: TextStyle['fontWeight'];
  color?: string;
}

export function T({ variant = 'body', tone = 'ink', weight, color, style, ...rest }: TProps) {
  const p = usePalette();
  const v = VARIANTS[variant];
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: v.fontFamily ?? fonts.sans, color: color ?? p[tone] },
        v,
        weight ? { fontWeight: weight } : null,
        style,
      ]}
    />
  );
}
