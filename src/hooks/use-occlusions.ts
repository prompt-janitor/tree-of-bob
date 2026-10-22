import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { occlusions, type Region } from '../../modules/reserved-regions';

export type { Region };

/**
 * What the system covers on the app's window (iOS 27.1 reserved regions, such as the iPhone Duo's status indicator),
 * in window points with the margins controls should keep. Null when the system can't say (older iOS, Expo Go, web,
 * Android): then the safe area applies. Read again whenever the window or its safe area changes (fold, rotation).
 */
export function useOcclusions(): Region[] | null {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [regions, setRegions] = useState<Region[] | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let live = true;
    occlusions().then((r) => {
      if (live) setRegions(r);
    });
    return () => {
      live = false;
    };
  }, [width, height, insets.top, insets.right, insets.bottom, insets.left]);
  return regions;
}
