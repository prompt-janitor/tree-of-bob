// Bob details sheet (compact widths). While it is open the Bob stays selected, so the Tree behind it shows his
// lineage. The Tree clears the selection when it regains focus. If the window widens while the sheet is open
// (rotation, Split View), the sheet closes and the side drawer shows the same Bob.
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { BobDetails } from '@/components/bob-details';
import { closeSheet, SheetFrame } from '@/components/sheet';
import { useLayout } from '@/hooks/use-layout';
import { useApp } from '@/state/app';

export default function BobSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { view, select } = useApp();
  const bobId = decodeURIComponent(String(id ?? ''));
  const { compact } = useLayout();

  useEffect(() => {
    if (!compact) {
      if (view.info.has(bobId)) select(bobId);
      closeSheet();
    }
  }, [compact, bobId, view, select]);

  useFocusEffect(
    useCallback(() => {
      if (view.info.has(bobId)) select(bobId);
    }, [bobId, view, select]),
  );

  return (
    <SheetFrame>
      <BobDetails id={bobId} />
    </SheetFrame>
  );
}
