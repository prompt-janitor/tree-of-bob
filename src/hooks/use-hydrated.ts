import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False during web static rendering and while hydrating, true afterwards (always true on native).
 * Anything that depends on window size or the system colour scheme waits for this on the web, so the
 * pre-rendered HTML and the first client render match (no hydration mismatch).
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
