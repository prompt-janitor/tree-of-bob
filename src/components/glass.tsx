// Floating glass surface. iOS 26+: native Liquid Glass via expo-glass-effect. Elsewhere (older iOS, Android,
// web, or Reduce Transparency on): a translucent surface with a hairline edge and soft shadow.
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { usePalette } from '@/state/app';

const nativeGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

export function Glass({ style, children, interactive, ...rest }: ViewProps & { interactive?: boolean; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    AccessibilityInfo.isReduceTransparencyEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce);
    return () => sub.remove();
  }, []);

  if (nativeGlass && !reduce) {
    return (
      <GlassView {...rest} isInteractive={interactive} colorScheme={p.scheme} glassEffectStyle="regular" style={style}>
        {children}
      </GlassView>
    );
  }
  const fallback: ViewStyle = {
    backgroundColor: reduce ? p.surf : p.glass,
    borderWidth: 1,
    borderColor: reduce ? p.line : p.glassEdge,
    shadowColor: '#000',
    shadowOpacity: p.scheme === 'dark' ? 0.5 : 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  };
  // react-native-web forwards backdropFilter to CSS.
  const web = Platform.OS === 'web' ? ({ backdropFilter: 'blur(24px) saturate(180%)' } as unknown as ViewStyle) : null;
  return (
    <View {...rest} style={[fallback, web, style]}>
      {children}
    </View>
  );
}
