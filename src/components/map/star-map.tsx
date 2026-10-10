// The Systems map renderer (native). Skia is linked into the app, so the canvas loads directly; the web build has
// its own entry (star-map.web.tsx) that loads CanvasKit first. Contract: ./types.ts.
import StarMapCanvas from './star-map-canvas';
import type { StarMapProps } from './types';

export function StarMap(props: StarMapProps) {
  return <StarMapCanvas {...props} />;
}
