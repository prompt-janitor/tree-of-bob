// Web only: whether a new version of the app has downloaded and is waiting, and a way to switch to it now. The page
// shell's service-worker script (src/app/+html.tsx) sets window.__tobUpdate and fires "tob-update"; applying reloads
// the page into the new version. Always false on native and in development (no service worker).
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

type UpdateWindow = Window & { __tobUpdate?: boolean; __tobApplyUpdate?: () => void };

const browser = Platform.OS === 'web' && typeof window !== 'undefined';

const subscribe = (l: () => void) => {
  if (!browser) return () => {};
  window.addEventListener('tob-update', l);
  return () => window.removeEventListener('tob-update', l);
};
const snapshot = () => browser && !!(window as UpdateWindow).__tobUpdate;

export function useUpdate(): { available: boolean; apply: () => void } {
  const available = useSyncExternalStore(subscribe, snapshot, () => false);
  return { available, apply: () => (browser ? (window as UpdateWindow).__tobApplyUpdate?.() : undefined) };
}
