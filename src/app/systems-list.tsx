// Everyone on the map as a list: the complete text equivalent of the Systems map (formSheet on iPhone, a sheet on
// iPad). A Bob row opens him; a system row closes the list and shows that system on the map.
import { useMemo } from 'react';

import { requestMapFocus } from '@/components/map/map-requests';
import { closeSheet, SheetFrame } from '@/components/sheet';
import { SystemsList } from '@/components/systems-list';
import { T } from '@/components/text';
import { mapState, monthYear } from '@/core';
import { useApp } from '@/state/app';

export default function SystemsListSheet() {
  const { view } = useApp();
  const date = view.chapter.time ?? view.latest ?? view.maxYear;
  const state = useMemo(() => mapState(view, date), [view, date]);
  return (
    <SheetFrame title="Everyone">
      <T variant="secondary" tone="ink2">{`Where everyone is on ${monthYear(date)}, and how each got there.`}</T>
      <SystemsList
        state={state}
        onFocusPlace={(id) => {
          closeSheet();
          // Let the sheet start closing before the map moves.
          setTimeout(() => requestMapFocus(id), 50);
        }}
      />
    </SheetFrame>
  );
}
