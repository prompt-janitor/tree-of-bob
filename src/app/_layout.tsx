import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useLayout } from '@/hooks/use-layout';
import { AppProvider, useApp } from '@/state/app';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootStack() {
  const { palette: p, hydrated } = useApp();
  const { compact } = useLayout();
  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);
  const sheet = {
    presentation: 'formSheet' as const,
    sheetGrabberVisible: true,
    sheetCornerRadius: 28,
    headerShown: false,
    contentStyle: { backgroundColor: p.bg },
  };
  // On iPad (regular width) a form sheet is a centred card, and a smaller first detent leaves it short, so every
  // sheet there opens at full height. On iPhone only the Bob sheet and the Everyone list keep a half-height first
  // step (the Bob sheet leaves the tree visible behind it); About and Key are long enough to open large.
  const detents = (phone: number[]) => (compact ? phone : [1]);
  return (
    <>
      <StatusBar style={p.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="bob/[id]" options={{ ...sheet, sheetAllowedDetents: detents([0.5, 1]), sheetLargestUndimmedDetentIndex: compact ? 0 : 'none' }} />
        <Stack.Screen name="progress" options={{ ...sheet, sheetAllowedDetents: [1] }} />
        <Stack.Screen name="search" options={{ ...sheet, sheetAllowedDetents: [1] }} />
        <Stack.Screen name="about" options={{ ...sheet, sheetAllowedDetents: [1] }} />
        <Stack.Screen name="licenses" options={{ ...sheet, sheetAllowedDetents: [1] }} />
        <Stack.Screen name="key" options={{ ...sheet, sheetAllowedDetents: [1] }} />
        <Stack.Screen name="systems-list" options={{ ...sheet, sheetAllowedDetents: detents([0.6, 1]) }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProvider>
        <RootStack />
      </AppProvider>
    </GestureHandlerRootView>
  );
}
