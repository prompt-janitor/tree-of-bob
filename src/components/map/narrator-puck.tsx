// The narrator's marker, the same in the map, the Key and the chapter header card: a GPS-like puck in his identity
// colour (halo, edge ring, core dot with a background stroke). The shape is used for nothing else, and his label
// always carries the POV tag too, so colour is never the only signal.
import Svg, { Circle } from 'react-native-svg';

import { usePalette } from '@/state/app';

/** size: the halo's diameter in points (32 on the map, 20 in the header card). */
export function NarratorPuck({ colour, size = 32 }: { colour: string; size?: number }) {
  const p = usePalette();
  const k = size / 32;
  const c = size / 2;
  const core = Math.max(3, 6 * k);
  return (
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={16 * k - 0.5} fill={colour} fillOpacity={p.scheme === 'dark' ? 0.24 : 0.18} stroke={colour} strokeOpacity={0.5} strokeWidth={1} />
      <Circle cx={c} cy={c} r={core + 1.25} fill={p.bg} />
      <Circle cx={c} cy={c} r={core} fill={colour} />
    </Svg>
  );
}
