// Stroke icons on a 24 pt grid, 1.7–1.8 pt stroke . Ink only; never coloured.
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const PATHS = {
  chapter: 'M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1v13c-3-1-6-1-9 1-3-2-6-2-9-1zM12 6.5v13',
  tree: 'M3 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M17 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M17 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 6h10M11 6v12h6',
  systems: 'M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M12 3.5a8.5 8.5 0 0 1 8.5 8.5M20.5 12a8.5 8.5 0 0 1-8.5 8.5M12 20.5A8.5 8.5 0 0 1 3.5 12',
  log: 'M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1',
  others: 'M6 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.5M17.5 14.5a5.5 5.5 0 0 1 3 4.5',
  search: 'M4.5 11a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0M16 16l4.5 4.5',
  filter: 'M4 7h16M7 12h10M10 17h4',
  info: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 11v6M12 7.5v.5',
  close: 'M6 6l12 12M18 6L6 18',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M6 9l6 6 6-6',
  link: 'M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1',
  arrow: 'M4 12h13M13 7l5 5-5 5',
  lost: 'M4 4l16 16M20 4L4 20',
  plus: 'M12 5v14M5 12h14',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  sidebar: 'M6 4.5h12a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3zM9 4.5v15',
  install: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 17v1.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V17',
  share: 'M8.5 9.5H7A1.5 1.5 0 0 0 5.5 11v8A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17 9.5h-1.5M12 3.5v10M8.5 7L12 3.5 15.5 7',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, color, strokeWidth = 1.8 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d={PATHS[name]} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
