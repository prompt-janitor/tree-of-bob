// The Systems map renderer (web). Skia on the web runs on CanvasKit, a WebAssembly build served from public/
// (canvaskit.wasm). The canvas module is imported only after CanvasKit has loaded, and only in the browser: the
// static pre-render and the first client render show the empty map background, so hydration matches.
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { View } from 'react-native';

import { useHydrated } from '@/hooks/use-hydrated';
import { useApp } from '@/state/app';

import type { StarMapProps } from './types';

const base = process.env.EXPO_BASE_URL ?? '';

export function StarMap(props: StarMapProps) {
  const hydrated = useHydrated();
  const { palette } = useApp();
  const blank = <View style={[{ flex: 1, backgroundColor: palette.bg }, props.style]} aria-hidden />;
  if (!hydrated) return blank;
  return (
    <WithSkiaWeb
      opts={{ locateFile: (file: string) => `${base}/${file}` }}
      getComponent={() => import('./star-map-canvas')}
      fallback={blank}
      componentProps={props}
    />
  );
}
