import { router } from 'expo-router';
import { useCallback } from 'react';
import { Platform } from 'react-native';

import { useLayout } from '@/hooks/use-layout';
import { useApp } from '@/state/app';

/**
 * Opens a Bob's details. Native compact widths (iPhone, narrow Split View) push the Bob sheet. Regular widths
 * (iPad in either orientation, wide web) select him, which opens the side drawer; opening the selected Bob again
 * closes it. Compact web widths select him too, and the tab layout shows his details in an in-page sheet, so the
 * web app never puts a Bob's name in a URL.
 */
export function useOpenBob() {
  const { compact } = useLayout();
  const { toggleSelected, select } = useApp();
  return useCallback(
    (id: string) => {
      if (!compact) toggleSelected(id);
      else if (Platform.OS === 'web') select(id);
      else router.push({ pathname: '/bob/[id]', params: { id } });
    },
    [compact, toggleSelected, select],
  );
}
