// Contract between the Systems screen and the map renderer.
import type { StyleProp, ViewStyle } from 'react-native';

import type { MapLayers, MapState, ProgressView } from '@/core';

export type MapLevel = 'local' | 'galaxy';

/** Something on the map a callout can be open on. id: a place id, a Bob or other replicant id, or a voyage group
 * key (from groupVoyages). */
export interface MapHit {
  kind: 'place' | 'bob' | 'voyage';
  id: string;
}

/** A request to move the pivot. n increments on every request, so asking again for the same target still moves. */
export interface PivotRequest {
  n: number;
  /** A place, a person (to where he is drawn now), or a voyage group; null: back to the default (recentre). */
  target: MapHit | null;
}

export interface StarMapProps {
  view: ProgressView;
  /** From mapState(view, date). The renderer draws only this, the travel history built from the same view, and
   * background stars. */
  state: MapState;
  level: MapLevel;
  /** Move the pivot (the point the map turns around and the callout points at). */
  pivot: PivotRequest;
  /** Selected Bob (lineage mode): his and his ancestors' routes drawn stronger, everyone else dimmed. */
  selectedBob: string | null;
  /** The open callout: its people's travel history draws stronger. */
  callout: MapHit | null;
  /** A tap on something: the canvas has already moved the pivot to it. anchored false: it is not drawn on this level
   * (a track leading off it), so the pivot did not move and a callout must not point at the centre. */
  onPress: (hit: MapHit, anchored: boolean) => void;
  /** A pivot request whose target is not drawn on this level: the camera did not move. */
  onUnanchored?: (target: MapHit) => void;
  /** A tap that hits nothing. */
  onPressEmpty: () => void;
  /** Two fingers started moving the map (callouts close). */
  onPanStart?: () => void;
  /** Whether the camera is away from its default (pivot, zoom or turn), for the recentre button's dot. */
  onOffDefault?: (off: boolean) => void;
  /** Screen areas covered by other UI (header, nav), so the pivot sits in the middle of the rest. */
  insets: { top: number; right: number; bottom: number; left: number };
  /** Rectangles of the floating controls over the map (screen points), kept free of labels. */
  chrome?: { l: number; t: number; r: number; b: number }[];
  /** Two fingers (web: shift- or right-drag) only zoom; the centre stays where it was put (a tap still moves it). */
  locked?: boolean;
  /** Layers: names and travel history are drawn by the scene (the rest is already filtered out of `state`). */
  layers?: MapLayers;
  /** The map state before layers were hidden, which the default camera frames. */
  fitState?: MapState;
  /** Fixed spot (left end) of the distance scale bar, bottom left of the map. */
  scaleBar?: { x: number; y: number } | null;
  style?: StyleProp<ViewStyle>;
}
