// Other replicants and AIs: not Bobs, so they stay out of the lineage tree.
import { View } from 'react-native';

import { Card } from '@/components/bits';
import { Screen } from '@/components/screen';
import { T } from '@/components/text';
import { revealLong } from '@/core';
import { useApp } from '@/state/app';

export default function OthersScreen() {
  const { view, palette: p } = useApp();
  return (
    <Screen title="Others" subtitle="Replicants and AIs who are not Bobs" maxWidth={820}>
      {view.others.length ? (
        <Card>
          {view.others.map((o, i) => (
            <View key={o.id} style={{ padding: 14, gap: 4, borderTopWidth: i ? 1 : 0, borderColor: p.line2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <T variant="row" style={{ flexShrink: 1 }}>{o.id}</T>
                <T variant="data" tone="ink3">{revealLong(view.model, o.reveal)}</T>
              </View>
              {o.kind ? <T variant="secondary" tone="ink2">{o.kind}</T> : null}
              {o.about ? <T variant="secondary">{o.about}</T> : null}
            </View>
          ))}
        </Card>
      ) : (
        <T variant="secondary" tone="ink2">No other replicants so far.</T>
      )}
    </Screen>
  );
}
