// App state: reading position, selection, view options and theme. Saved between visits with AsyncStorage
// (localStorage on the web). Everything derived from the data goes through computeView(), the spoiler gate.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';

import raw from '@/data/tree-of-bob.json';
import {
  buildModel,
  clampProgress,
  computeView,
  defaultProgress,
  stepProgress,
  validateData,
  type EventKind,
  type LocationFilter,
  type LogScope,
  type Progress,
  type ProgressView,
  type TreeData,
  type ValidationResult,
  type Zoom,
} from '@/core';
import { dark, light, type Palette } from '@/theme/tokens';
import { identityColour } from '@/theme/identity';

const data = raw as unknown as TreeData;
const model = buildModel(data);
const validation = validateData(data);
const STORE_KEY = 'tree-of-bob/v1';

export type ThemePref = 'system' | 'light' | 'dark';

interface Saved {
  progress?: Progress;
  theme?: ThemePref;
  zoom?: Zoom;
  logScope?: LogScope;
  drawerWidth?: number;
  /** Systems map: who is at each place as names with colour dots (true) or as the compact dot row only (false). */
  mapNames?: boolean;
}

/** Default width of the Bob drawer on iPad and wide web (points). */
export const DRAWER_WIDTH = 380;

interface AppState {
  view: ProgressView;
  validation: ValidationResult;
  palette: Palette;
  /** Identity colour for a Bob (resolved through his colour key). */
  colourOf: (id: string) => string;
  themePref: ThemePref;
  setThemePref: (t: ThemePref) => void;
  setProgress: (p: Progress) => void;
  step: (delta: number) => void;
  selected: string | null;
  /** Selecting the selected Bob again clears the selection. */
  toggleSelected: (id: string | null) => void;
  select: (id: string | null) => void;
  /** Tree row keys the reader has flipped (a Bob row collapsed, a folded batch opened). */
  treeToggles: Set<string>;
  toggleTreeRow: (key: string) => void;
  filter: LocationFilter;
  setFilter: (f: LocationFilter) => void;
  zoom: Zoom;
  setZoom: (z: Zoom) => void;
  logScope: LogScope;
  setLogScope: (s: LogScope) => void;
  logKinds: Set<EventKind>;
  toggleLogKind: (k: EventKind) => void;
  /** iPad and wide web: width of the Bob side drawer, set by dragging its edge. */
  drawerWidth: number;
  setDrawerWidth: (w: number) => void;
  /** Systems map: names with colour dots under each place (true), or the compact dot row only. */
  mapNames: boolean;
  setMapNames: (on: boolean) => void;
  /** iPhone: the floating nav shrinks while the content scrolls down. */
  navCompact: boolean;
  setNavCompact: (c: boolean) => void;
  hydrated: boolean;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [hydrated, setHydrated] = useState(false);
  const [progress, setProgressState] = useState<Progress>(() => defaultProgress(model));
  const [themePref, setThemePref] = useState<ThemePref>('system');
  const [zoom, setZoom] = useState<Zoom>('all');
  const [logScope, setLogScope] = useState<LogScope>('book');
  const [logKinds, setLogKinds] = useState<Set<EventKind>>(() => new Set(['birth', 'travel', 'scut', 'fate', 'milestone']));
  const [selectedRaw, setSelected] = useState<string | null>(null);
  const [filterRaw, setFilter] = useState<LocationFilter>({ kind: 'everyone' });
  const [treeToggles, setTreeToggles] = useState<Set<string>>(() => new Set());
  const [navCompact, setNavCompact] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(DRAWER_WIDTH);
  const [mapNames, setMapNames] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((s) => {
        const saved: Saved = s ? JSON.parse(s) : {};
        if (saved.progress) setProgressState(clampProgress(model, saved.progress));
        if (saved.theme) setThemePref(saved.theme);
        if (saved.zoom) setZoom(saved.zoom);
        if (saved.logScope) setLogScope(saved.logScope);
        if (typeof saved.drawerWidth === 'number') setDrawerWidth(saved.drawerWidth);
        if (typeof saved.mapNames === 'boolean') setMapNames(saved.mapNames);
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const saved: Saved = { progress, theme: themePref, zoom, logScope, drawerWidth, mapNames };
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(saved)).catch(() => {});
  }, [hydrated, progress, themePref, zoom, logScope, drawerWidth, mapNames]);

  const view = useMemo(() => computeView(model, progress), [progress]);

  // A selection or filter that the current position no longer reveals is ignored (going back hides things).
  const selected = selectedRaw && view.info.has(selectedRaw) ? selectedRaw : null;
  const filter: LocationFilter =
    filterRaw.kind === 'system' && !view.ids.some((id) => view.info.get(id)!.loc === filterRaw.name) ? { kind: 'everyone' } : filterRaw;

  // On the web the pre-rendered HTML is light; the real scheme applies once saved settings have loaded.
  const ready = Platform.OS !== 'web' || hydrated;
  const scheme = !ready ? 'light' : themePref === 'system' ? (system === 'dark' ? 'dark' : 'light') : themePref;
  const palette = scheme === 'dark' ? dark : light;

  const colourOf = useCallback(
    (id: string) => {
      const key = view.info.get(id)?.colourKey ?? model.root;
      return identityColour(model.slotOf.get(key) ?? 0, palette.scheme);
    },
    [view, palette.scheme],
  );

  const setProgress = useCallback(
    (p: Progress) => {
      const next = clampProgress(model, p);
      if (next.book === progress.book && next.chapter === progress.chapter) return;
      if (Platform.OS !== 'web') {
        // Selection tick per chapter; a light impact when crossing into another book.
        if (next.book !== progress.book) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        else Haptics.selectionAsync().catch(() => {});
      }
      setProgressState(next);
    },
    [progress],
  );

  const step = useCallback((delta: number) => setProgress(stepProgress(model, progress, delta)), [progress, setProgress]);

  const value: AppState = {
    view,
    validation,
    palette,
    colourOf,
    themePref,
    setThemePref,
    setProgress,
    step,
    selected,
    toggleSelected: (id) => setSelected((cur) => (id == null || cur === id ? null : id)),
    select: setSelected,
    treeToggles,
    toggleTreeRow: (key) =>
      setTreeToggles((cur) => {
        const next = new Set(cur);
        if (!next.delete(key)) next.add(key);
        return next;
      }),
    filter,
    setFilter,
    zoom,
    setZoom,
    logScope,
    setLogScope,
    logKinds,
    toggleLogKind: (k) =>
      setLogKinds((s) => {
        const next = new Set(s);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        return next;
      }),
    drawerWidth,
    setDrawerWidth,
    mapNames,
    setMapNames,
    navCompact,
    setNavCompact,
    hydrated,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}

export function usePalette(): Palette {
  return useApp().palette;
}
