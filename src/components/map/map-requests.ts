// Requests to the Systems map from elsewhere (the list modal): focus a place. The map screen subscribes while it is
// mounted; a request made while it is not is dropped.
import { useEffect, useRef } from 'react';

type Listener = (place: string) => void;
const listeners = new Set<Listener>();

export function requestMapFocus(place: string) {
  for (const l of listeners) l(place);
}

export function useMapFocusRequests(onFocus: Listener) {
  const ref = useRef(onFocus);
  useEffect(() => {
    ref.current = onFocus;
  });
  useEffect(() => {
    const l: Listener = (place) => ref.current(place);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
}
