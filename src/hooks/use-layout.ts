import { PixelRatio, Platform, useWindowDimensions } from 'react-native';

import { useHydrated } from '@/hooks/use-hydrated';
import { breakpoints } from '@/theme/tokens';

/**
 * Size classes used across the app.
 * compact  — iPhone, iPad one-third and one-half Split View: tab capsule, sheets for details.
 * regular  — iPad two-thirds and full width, desktop web: floating tabs, dense lanes, inspector column.
 */
export function useLayout() {
  const dims = useWindowDimensions();
  const hydrated = useHydrated();
  // Web static HTML is rendered at phone width; switch to the real width after hydration.
  const width = hydrated ? dims.width : 390;
  const height = hydrated ? dims.height : 844;
  const compact = width < breakpoints.regular;
  const fontScale = PixelRatio.getFontScale();
  return {
    width,
    height,
    compact,
    inspector: width >= breakpoints.inspector,
    rail: Platform.OS === 'web' && width >= breakpoints.rail,
    /** Accessibility text sizes: lanes move under the name. */
    largeText: fontScale >= 1.35,
    dense: !compact,
  };
}
