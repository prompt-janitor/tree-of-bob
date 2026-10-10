// Web only: whether the app can be installed from this browser, and how.
// Hidden on native, when already running as an installed app, and after the browser reports an install.
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { useHydrated } from '@/hooks/use-hydrated';

/** prompt: Chromium offered its install prompt. iphone / ipad: Safari's Share menu. other: the browser's menu. */
export type InstallMode = 'prompt' | 'iphone' | 'ipad' | 'other';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const browser = Platform.OS === 'web' && typeof window !== 'undefined';
let deferred: InstallPromptEvent | null = null;
let installed = false;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

// Listen from module load: Chromium can fire beforeinstallprompt before any screen mounts.
if (browser) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', emit);
}

function standalone(): boolean {
  if (!browser) return false;
  return !!window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function appleMode(): 'iphone' | 'ipad' | null {
  if (!browser) return null;
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return 'iphone';
  // iPadOS Safari reports itself as a Mac; a touch screen tells them apart.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ipad';
  return null;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useInstall(): { available: boolean; mode: InstallMode; install: () => Promise<boolean> } {
  useSyncExternalStore(subscribe, () => version, () => 0);
  const hydrated = useHydrated();
  const available = browser && hydrated && !installed && !standalone();
  const mode: InstallMode = deferred ? 'prompt' : (appleMode() ?? 'other');
  const install = async () => {
    const e = deferred;
    if (!e) return false;
    deferred = null;
    emit();
    await e.prompt();
    const { outcome } = await e.userChoice;
    return outcome === 'accepted';
  };
  return { available, mode, install };
}
