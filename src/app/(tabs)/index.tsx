// Chapter view: "Who is in this chapter, and when is it set?" Home on iPhone.
import { router } from 'expo-router';
import { View } from 'react-native';

import { IconButton } from '@/components/bits';
import { ChapterHeader, Disclaimer, FlashbackCard, HereCard } from '@/components/chapter';
import { Screen } from '@/components/screen';
import { T } from '@/components/text';
import { useLayout } from '@/hooks/use-layout';

export default function ChapterScreen() {
  const { compact, rail } = useLayout();
  return (
    <Screen>
      {compact ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: -10 }}>
          <T variant="overline" tone="ink2" weight="600">TREE OF BOB</T>
          <IconButton icon="info" label="About and settings" onPress={() => router.push('/about')} />
        </View>
      ) : null}
      <ChapterHeader />
      <FlashbackCard />
      <HereCard />
      {!rail ? <Disclaimer /> : null}
    </Screen>
  );
}
