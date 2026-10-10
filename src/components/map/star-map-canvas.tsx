// The Systems map canvas (Skia). One camera that always orbits a pivot: the narrator by default, or whatever was last
// tapped. One finger orbits (across turns the map, up and down tilts it from straight down, through edge-on, to
// straight up from below), two
// fingers move the pivot along the floor, a pinch zooms (on the web: drag orbits, shift- or right-drag moves, the
// wheel zooms). While the camera moves, every place's drop line fades in so height reads; it fades out after. The camera lives in shared values and
// the scene is drawn by a worklet into one picture, so turning never re-renders React. Hidden from VoiceOver: the
// header card, the callouts and the list modal carry the same facts. On the web this module is loaded only after
// CanvasKit (see star-map.web.tsx).
import { Canvas, Picture, Skia, useTypeface, type SkFont } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, Platform, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, MouseButton } from 'react-native-gesture-handler';
import { Easing, type SharedValue, useAnimatedReaction, useDerivedValue, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { clampTilt, DEFAULT_TILT, LY_PER_PC, MAX_TILT, pivotFit, type Camera, type Vec3 } from '@/core';
import { useApp } from '@/state/app';

import { arcPoint, dotObstacles, drawScene, edgeMarkers, proj, puckAt, trackEnds, voyageDots, type Box, type DrawHit, type Fonts } from './draw';
import { buildScene, scaleBarFor, type Scene } from './scene';
import type { MapHit, StarMapProps } from './types';

/** Generous hit radius for taps, points. */
const HIT = 24;
const ROTATE_PER_PT = 0.007;
/** Tilt per point of vertical drag: about 260 pt from straight down to edge-on, as much again to straight up. */
const TILT_PER_PT = 0.006;
/** Drop lines of every place while the camera moves: how long they stay after the gesture ends, and their strength
 * with Reduce Motion (no fade, shown only during the gesture). */
const DROPS_HOLD_MS = 1200;
const DROPS_REDUCED = 0.5;
/** A tilt or turn this far from the default counts as moved (the recentre dot). */
const TURNED = (10 * Math.PI) / 180;
const TILTED = (5 * Math.PI) / 180;

/** Zoom limits: the visible half-height in parsecs at the closest and the furthest zoom. */
const ZOOM = {
  local: { near: 2 / LY_PER_PC, far: 260 / LY_PER_PC },
  galaxy: { near: 400, far: 80000 },
} as const;

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

function plainDigits(s: string, font: SkFont): string {
  if (!/[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(s)) return s;
  return [...s].map((ch) => (SUPERSCRIPT.includes(ch) && font.getGlyphIDs(ch)[0] === 0 ? String(SUPERSCRIPT.indexOf(ch)) : ch)).join('');
}

/** Where a tap target sits now, for moving the pivot to it. */
export function anchorOf(scene: Scene, hit: MapHit | null): Vec3 | null {
  if (!hit) return null;
  if (hit.kind === 'place') {
    const n = scene.nodes.find((x) => x.ids.includes(hit.id));
    if (n) return n.p;
    return scene.level === 'galaxy' ? scene.nodes.find((x) => x.cluster)?.p ?? null : null;
  }
  if (hit.kind === 'voyage') return scene.voyageAnchor[hit.id] ?? null;
  return scene.whereNow[hit.id] ?? null;
}

export default function StarMapCanvas(props: StarMapProps) {
  const { view, state, level, pivot, selectedBob, callout, insets, chrome, scaleBar, style, onPress, onPressEmpty, onPanStart, onOffDefault, onUnanchored, locked = false, layers, fitState } = props;
  const { palette, colourOf } = useApp();
  const reduceMotion = useReducedMotion();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const { w, h } = size;

  const typeface = useTypeface(require('./instrument-sans.ttf'));
  const fontScale = Math.min(PixelRatio.getFontScale(), 1.3);
  const fonts = useMemo<Fonts | null>(() => {
    if (!typeface) return null;
    const make = (pt: number) => {
      const f = Skia.Font(typeface, pt * fontScale);
      // Unhinted, subpixel-positioned glyphs keep the spacing even at small sizes. The native binding reads this
      // argument as a number (react-native-skia 2.6), the web one as a boolean; 1 works for both.
      f.setSubpixel(1 as unknown as boolean);
      f.setLinearMetrics(true);
      return f;
    };
    return { label: make(12.5), line2: make(11), small: make(10.5) };
  }, [typeface, fontScale]);
  // The viewport diameter under the scale bar: "Viewport ⌀ 42 ly", spelled out when the map font lacks the ⌀ glyph.
  const viewportPrefix = fonts && fonts.small.getGlyphIDs('\u2300')[0] !== 0 ? 'Viewport \u2300 ' : 'Viewport diameter ';

  const scene = useMemo(() => {
    const sc = buildScene({ view, state, level, selectedBob, callout, colourOf, palette, names: layers?.names ?? 'show', history: layers?.history ?? 'chapter', fitState });
    // Superscript digits ("Omicron² Eridani") that the label font lacks are drawn as plain digits.
    if (fonts) {
      for (const l of sc.labels) {
        for (const line of l.lines) {
          line.text = plainDigits(line.text, fonts.label);
          for (const r of line.runs ?? []) r.text = plainDigits(r.text, fonts.label);
        }
      }
      for (const n of sc.nodes) n.name = plainDigits(n.name, fonts.label);
    }
    return sc;
  }, [view, state, level, selectedBob, callout, colourOf, palette, fonts, layers?.names, layers?.history, fitState]);

  // Camera. The centre (ox, oy, oz) is always the pivot, its height included, so the pivot sits in the middle of the
  // map area, at the centre of the viewport globe, and turning or zooming never moves it. The floor is the horizontal
  // plane through it (the globe's equator): a tap or a new chapter moves the centre, and the floor with it, to the new
  // pivot's height; a two-finger move slides the centre along the floor, so the floor stays at that height.
  const yaw = useSharedValue(0);
  const tilt = useSharedValue(DEFAULT_TILT);
  // Strength of the drop lines shown only while the camera moves (0 at rest).
  const drops = useSharedValue(0);
  const scale = useSharedValue(10);
  const ox = useSharedValue(0);
  const oy = useSharedValue(0);
  const oz = useSharedValue(0);
  const cx = useSharedValue(0);
  const cy = useSharedValue(0);
  const minScale = useSharedValue(0.01);
  const maxScale = useSharedValue(1000);
  const pinchFrom = useSharedValue(1);
  const fitScale = useSharedValue(10);
  const defX = useSharedValue(0);
  const defY = useSharedValue(0);
  const defZ = useSharedValue(0);
  const panMode = useSharedValue(false);
  const moving = useSharedValue(false);
  // Locked: two fingers only zoom. zoomOnly: this two-finger gesture has become a pinch, so the drift of the fingers'
  // midpoint no longer moves the centre (until the fingers lift).
  const lock = useSharedValue(locked);
  const zoomOnly = useSharedValue(false);
  useEffect(() => {
    lock.set(locked);
  }, [locked, lock]);
  const boxL = useSharedValue(0);
  const boxT = useSharedValue(0);
  const boxR = useSharedValue(0);
  const boxB = useSharedValue(0);

  const inner = useMemo(() => {
    const iw = Math.max(80, w - insets.left - insets.right);
    const ih = Math.max(80, h - insets.top - insets.bottom);
    return { iw, ih, cx: insets.left + iw / 2, cy: insets.top + ih / 2 };
  }, [w, h, insets.left, insets.right, insets.top, insets.bottom]);

  useEffect(() => {
    cx.set(inner.cx);
    cy.set(inner.cy);
    boxL.set(insets.left);
    boxT.set(insets.top);
    boxR.set(insets.left + inner.iw);
    boxB.set(insets.top + inner.ih);
    const half = Math.min(inner.iw, inner.ih) / 2;
    minScale.set(half / ZOOM[level].far);
    maxScale.set(half / ZOOM[level].near);
  }, [inner, insets.left, insets.top, level, cx, cy, boxL, boxT, boxR, boxB, minScale, maxScale]);

  const moveTo = useCallback(
    (target: { yaw?: number; tilt?: number; scale?: number; center?: Vec3 }, animate: boolean) => {
      // A move that spans more than two screens at the larger scale (a level switch to a far narrator) would show
      // only empty floor for most of the animation: it snaps instead.
      let far = false;
      if (target.center) {
        const d = Math.hypot(target.center.x - ox.get(), target.center.y - oy.get(), target.center.z - oz.get());
        far = d * Math.max(scale.get(), target.scale ?? 0) > 2 * Math.max(w, h, 1);
      }
      const run = animate && !reduceMotion && !far;
      const cfg = { duration: 450, easing: Easing.out(Easing.cubic) };
      const set = (sv: SharedValue<number>, v: number) => {
        sv.set(run ? withTiming(v, cfg) : v);
      };
      if (target.yaw != null) {
        // Turn the short way round.
        let y = target.yaw;
        while (y - yaw.get() > Math.PI) y -= Math.PI * 2;
        while (yaw.get() - y > Math.PI) y += Math.PI * 2;
        set(yaw, y);
      }
      if (target.tilt != null) set(tilt, clampTilt(target.tilt));
      if (target.scale != null) set(scale, Math.min(maxScale.get(), Math.max(minScale.get(), target.scale)));
      if (target.center) {
        set(ox, target.center.x);
        set(oy, target.center.y);
        set(oz, target.center.z);
      }
    },
    [reduceMotion, yaw, tilt, scale, ox, oy, oz, minScale, maxScale, w, h],
  );

  /** The default camera for a scene: its pivot and the scale that shows the nearest few places round it. */
  const fitOf = useCallback(
    (sc: Scene, t: number = DEFAULT_TILT) => {
      const galaxy = sc.level === 'galaxy';
      // A tall, narrow map (phone) is limited by its width: it fits the nearest two places (at least 15 ly) so the
      // map fills the height; places further out get edge markers.
      const narrow = inner.iw < 600 && inner.ih > inner.iw * 1.2;
      const opts = galaxy ? { minPc: 3000, nearPc: 0, nth: 1e6 } : narrow ? { nth: 2, nearPc: 15 / LY_PER_PC } : {};
      const f = pivotFit(sc.pivot, sc.fit, inner.iw, inner.ih, t, opts);
      const half = Math.min(inner.iw, inner.ih) / 2;
      const s = Math.min(half / ZOOM[sc.level].near, Math.max(half / ZOOM[sc.level].far, f.scale));
      return { scale: s };
    },
    [inner],
  );

  const setDefaults = useCallback(
    (sc: Scene) => {
      const f = fitOf(sc);
      fitScale.set(f.scale);
      defX.set(sc.pivot.x);
      defY.set(sc.pivot.y);
      defZ.set(sc.pivot.z);
      return f;
    },
    [fitOf, fitScale, defX, defY, defZ],
  );

  /** Whether the camera is at its default (not turned, tilted, zoomed or moved by the reader). */
  const atDefault = useCallback(() => {
    const turned = Math.abs(Math.atan2(Math.sin(yaw.get()), Math.cos(yaw.get()))) > TURNED || Math.abs(tilt.get() - DEFAULT_TILT) > TILTED;
    const zoomed = Math.abs(scale.get() / fitScale.get() - 1) > 0.15;
    const moved = Math.hypot(ox.get() - defX.get(), oy.get() - defY.get(), oz.get() - defZ.get()) * scale.get() > 4;
    return !(turned || zoomed || moved);
  }, [yaw, tilt, scale, fitScale, ox, oy, oz, defX, defY, defZ]);

  // Show every known place's height once without a gesture: the drop lines fade in, hold and fade out (not with
  // Reduce Motion). Runs when the map first appears and on a recentre or chapter change that moves the camera.
  const reveal = useCallback(() => {
    if (reduceMotion) return;
    drops.set(withSequence(withTiming(1, { duration: 300 }), withDelay(DROPS_HOLD_MS, withTiming(0, { duration: 450 }))));
  }, [reduceMotion, drops]);

  // First layout and level change: the default camera. A pivot request: move there (null: recentre). A chapter that
  // keeps the narrator's place keeps the camera; otherwise it moves to the new pivot and fit.
  const seen = useRef<{ level: string; n: number; pivotKey: string; iw: number; ih: number } | null>(null);
  useEffect(() => {
    if (!w || !h) return;
    const last = seen.current;
    seen.current = { level, n: pivot.n, pivotKey: scene.pivotKey, iw: inner.iw, ih: inner.ih };
    if (!last || last.level !== level) {
      const f = setDefaults(scene);
      moveTo({ yaw: 0, tilt: DEFAULT_TILT, scale: f.scale, center: scene.pivot }, !!last);
      reveal();
      return;
    }
    if (pivot.n !== last.n) {
      if (!pivot.target) {
        const f = setDefaults(scene);
        moveTo({ yaw: 0, tilt: DEFAULT_TILT, scale: f.scale, center: scene.pivot }, true);
        reveal();
      } else {
        const a = anchorOf(scene, pivot.target);
        if (a) moveTo({ center: a }, true);
        // Not drawn on this level: the camera stays, and the callout must not point at whatever is in the middle.
        else onUnanchored?.(pivot.target);
      }
      return;
    }
    if (scene.pivotKey !== last.pivotKey) {
      // The defaults (recentre, the recentre dot) assume the default tilt; this move keeps the reader's tilt, so its
      // scale is fitted at that tilt.
      setDefaults(scene);
      moveTo({ scale: fitOf(scene, tilt.get()).scale, center: scene.pivot }, true);
      reveal();
      return;
    }
    // Same pivot: a camera the reader has moved stays where it is; one still at its default follows a change in the
    // fit or in the map's size (rotation, Split View).
    const wasDefault = atDefault();
    const f = setDefaults(scene);
    if (wasDefault && (last.iw !== inner.iw || last.ih !== inner.ih || Math.abs(f.scale / scale.get() - 1) > 0.01)) {
      moveTo({ scale: f.scale, center: scene.pivot }, true);
    }
  }, [w, h, inner, level, pivot, scene, moveTo, setDefaults, fitOf, atDefault, scale, tilt, reveal, onUnanchored]);

  // The recentre button shows a dot while the camera is away from its default.
  const notifyOff = useCallback((off: boolean) => onOffDefault?.(off), [onOffDefault]);
  useAnimatedReaction(
    () => {
      const turned = Math.abs(Math.atan2(Math.sin(yaw.get()), Math.cos(yaw.get()))) > TURNED || Math.abs(tilt.get() - DEFAULT_TILT) > TILTED;
      const zoomed = Math.abs(scale.get() / fitScale.get() - 1) > 0.15;
      const moved = Math.hypot(ox.get() - defX.get(), oy.get() - defY.get(), oz.get() - defZ.get()) * scale.get() > 4;
      return turned || zoomed || moved;
    },
    (off, prev) => {
      if (off !== prev) scheduleOnRN(notifyOff, off);
    },
  );

  // The scale bar's length (ly), chosen again only when the zoom moves its bar out of 40–130 pt (see scaleBarFor).
  const barLy = useSharedValue(0);
  useAnimatedReaction(
    () => scale.get(),
    (k) => {
      const ly = scaleBarFor(k, 120, barLy.get()).ly;
      if (ly !== barLy.get()) barLy.set(ly);
    },
  );

  // The drawing: recorded into one picture whenever the camera or the scene changes.
  const picture = useDerivedValue(() => {
    const rec = Skia.PictureRecorder();
    const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, Math.max(1, w), Math.max(1, h)));
    if (w > 0 && h > 0) {
      const cam: Camera = { yaw: yaw.get(), tilt: tilt.get(), scale: scale.get(), center: { x: ox.get(), y: oy.get(), z: oz.get() }, cx: cx.get(), cy: cy.get() };
      drawScene(canvas, scene, cam, fonts, w, h, {
        drops: drops.get(),
        far: scale.get() < fitScale.get() * 0.5,
        box: { l: boxL.get(), t: boxT.get(), r: boxR.get(), b: boxB.get() },
        chrome: chrome ?? [],
        scaleBar: scaleBar ?? null,
        scaleBarLy: barLy.get(),
        viewportPrefix,
      });
    }
    return rec.finishRecordingAsPicture();
  }, [scene, fonts, w, h, chrome, scaleBar, viewportPrefix]);

  const camNow = useCallback(
    (): Camera => ({ yaw: yaw.get(), tilt: tilt.get(), scale: scale.get(), center: { x: ox.get(), y: oy.get(), z: oz.get() }, cx: cx.get(), cy: cy.get() }),
    [yaw, tilt, scale, ox, oy, oz, cx, cy],
  );

  // Taps, in order: the puck, pips and position dots; edge markers; places; voyage lines; travel history; ghost
  // rings and hop arcs. The nearest within reach in the first tier that has one wins.
  const hitTest = useCallback(
    (x: number, y: number): MapHit | null => {
      const cam = camNow();
      const P = (v: Vec3) => proj(v.x, v.y, v.z, cam);
      const tiers: { d: number; hit: MapHit }[][] = [[], [], [], [], [], []];
      const consider = (tier: number, px: number, py: number, hit: MapHit, reach = HIT) => {
        const d = Math.hypot(px - x, py - y);
        if (d <= reach) tiers[tier].push({ d, hit });
      };
      const segPoint = (ax: number, ay: number, bx: number, by: number) => {
        const vx = bx - ax;
        const vy = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
        return { px: ax + vx * t, py: ay + vy * t };
      };
      const narrator = view.chapter.narrator;
      // Tier 0: the puck, pips, position dots. A pip or dot with a neighbour within reach is crowded: the tap opens
      // its place (or voyage) instead, so a slightly missed tap never opens the wrong Bob.
      const pk = puckAt(scene, cam);
      if (pk && narrator) {
        const node = scene.nodes.find((n) => n.puck && !n.cluster);
        const voy = scene.voyages.find((v) => v.puck);
        if (node) consider(0, pk.x, pk.y, { kind: 'place', id: node.ids[0] });
        else if (voy) consider(0, pk.x, pk.y, { kind: 'voyage', id: voy.key });
      }
      // Pips and the names in place labels exactly as drawn: the drawing runs once more into a throwaway picture and
      // reports where each one went (a label can move, and with names on a pip row shows only when its label had no
      // room).
      const drawn: DrawHit[] = [];
      if (fonts) {
        const rec = Skia.PictureRecorder();
        drawScene(rec.beginRecording(Skia.XYWHRect(0, 0, Math.max(1, w), Math.max(1, h))), scene, cam, fonts, w, h, {
          drops: drops.get(),
          far: scale.get() < fitScale.get() * 0.5,
          box: { l: insets.left, t: insets.top, r: insets.left + inner.iw, b: insets.top + inner.ih },
          chrome: chrome ?? [],
          scaleBar: scaleBar ?? null,
          scaleBarLy: barLy.get(),
          viewportPrefix,
          hits: drawn,
        });
        rec.finishRecordingAsPicture();
      }
      const small: { x: number; y: number; id: string; crowd: MapHit }[] = [];
      for (const d of drawn) {
        if (d.crowd != null) small.push({ x: d.x, y: d.y, id: d.id, crowd: { kind: 'place', id: d.crowd } });
        else {
          // A name with its dot: the nearest point of its box, within a few points.
          const px = Math.max(d.x, Math.min(d.x + d.w, x));
          const py = Math.max(d.y, Math.min(d.y + d.h, y));
          consider(0, px, py, { kind: 'bob', id: d.id }, 8);
        }
      }
      const avoid = dotObstacles(scene, cam, pk);
      for (const v of scene.voyages) {
        const row = voyageDots(v, cam, avoid);
        if (!row) continue;
        // A collapsed row (one dot standing for the group) opens the group.
        const crowd: MapHit = { kind: 'voyage', id: v.key };
        if (row.n < v.dots.length) small.push({ x: row.start, y: row.y, id: v.dotIds[0], crowd }, { x: row.start + 1, y: row.y, id: v.dotIds[0], crowd });
        else v.dotIds.forEach((id, i) => small.push({ x: row.start + i * 9, y: row.y, id, crowd }));
        if (v.colour == null) small.push({ x: row.x, y: row.y, id: v.ids[0], crowd });
      }
      for (const q of small) {
        const crowded = small.some((r) => r !== q && Math.hypot(r.x - q.x, r.y - q.y) < HIT) || (pk && Math.hypot(pk.x - q.x, pk.y - q.y) < HIT);
        consider(0, q.x, q.y, crowded ? q.crowd : { kind: 'bob', id: q.id }, 12);
      }
      // Tier 1: edge markers.
      const box: Box = { l: insets.left, t: insets.top, r: insets.left + inner.iw, b: insets.top + inner.ih };
      for (const m of edgeMarkers(scene, cam, box)) consider(1, m.x, m.y, { kind: 'place', id: scene.nodes[m.node].ids[0] ?? '' }, 30);
      // Tier 2: places.
      for (const n of scene.nodes) {
        const a = P(n.p);
        if (n.ids.length) consider(2, a.x, a.y, { kind: 'place', id: n.ids[0] });
        else if (n.cluster) {
          const first = state.places.find((pl) => pl.local && pl.pos);
          if (first) consider(2, a.x, a.y, { kind: 'place', id: first.id });
        }
      }
      // Tier 3: voyage lines.
      for (const v of scene.voyages) {
        const a = P(v.a);
        const b = v.b ? P(v.b) : { x: a.x + Math.cos(v.stubAngle) * 26, y: a.y + Math.sin(v.stubAngle) * 26 };
        const s = segPoint(a.x, a.y, b.x, b.y);
        consider(3, s.px, s.py, { kind: 'voyage', id: v.key }, 14);
      }
      // Tier 4: travel history.
      for (const tr of scene.tracks) {
        const e = trackEnds(tr, cam);
        const s = segPoint(e.ax, e.ay, e.bx, e.by);
        consider(4, s.px, s.py, { kind: 'bob', id: tr.who }, 12);
      }
      // Tier 5: ghost rings and hop arcs.
      for (const g of scene.ghosts) {
        const b = P(g.b);
        consider(5, b.x, b.y, { kind: 'bob', id: g.who });
      }
      for (const hp of scene.hops) {
        if (!hp.a) continue;
        const m = P(arcPoint(hp.a, hp.b, 0.5));
        consider(5, m.x, m.y, { kind: 'bob', id: hp.who });
      }
      for (const tier of tiers) {
        if (!tier.length) continue;
        tier.sort((a, b) => a.d - b.d);
        return tier[0].hit;
      }
      return null;
    },
    [scene, camNow, view, insets.left, insets.top, inner, state.places, fonts, w, h, drops, scale, fitScale, chrome, scaleBar, barLy, viewportPrefix],
  );

  const onTap = useCallback(
    (x: number, y: number) => {
      const hit = hitTest(x, y);
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      if (!hit) {
        onPressEmpty();
        return;
      }
      // Every tap that opens a callout first makes its anchor the pivot, so the callout stays put while turning.
      const a = anchorOf(scene, hit);
      if (a) moveTo({ center: a }, true);
      onPress(hit, !!a);
    },
    [hitTest, scene, moveTo, onPress, onPressEmpty],
  );

  const notifyPan = useCallback(() => onPanStart?.(), [onPanStart]);
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .maxPointers(2)
      .minDistance(4)
      .mouseButton(MouseButton.LEFT | MouseButton.RIGHT)
      .onStart(() => {
        moving.set(false);
        // Every place's drop line shows while the camera moves (Reduce Motion: at once, fainter, no fade).
        drops.set(reduceMotion ? DROPS_REDUCED : withTiming(1, { duration: 180 }));
      })
      .onFinalize(() => {
        drops.set(reduceMotion ? 0 : withDelay(DROPS_HOLD_MS, withTiming(0, { duration: 450 })));
      })
      .onChange((e) => {
        // Once a gesture is a pan it stays one: the events after one of the two fingers lifts are ignored, so the end of
        // a two-finger move never turns or tilts the map (nor applies the jump of the touch centre).
        if (moving.get() && e.numberOfPointers < 2 && !panMode.get()) return;
        const k = scale.get();
        if (e.numberOfPointers >= 2 || panMode.get()) {
          // Two fingers (web: shift- or right-drag) move the centre of view in 3D. Across: sideways along the floor.
          // Up and down: up and down through space, like an elevator, so the floor (the globe's equator through the
          // centre) rises or sinks through the stars and their drop lines lengthen or shorten; the stars still follow
          // the finger. Height can't be seen from straight above or below, so there the vertical drag hands over
          // smoothly to moving along the floor instead.
          if (!moving.get()) {
            moving.set(true);
            if (!lock.get()) scheduleOnRN(notifyPan);
          }
          if (lock.get() || zoomOnly.get()) return;
          const c = Math.cos(yaw.get());
          const s = Math.sin(yaw.get());
          const ct = Math.cos(tilt.get());
          const st = Math.sin(tilt.get());
          const w = Math.min(1, Math.max(0, (st - 0.25) / 0.35));
          const lift = w * w * (3 - 2 * w);
          // Along the floor: its foreshortening, limited so a nearly edge-on view does not fling the centre away; seen
          // from below the plane, up the screen is the other way along the floor.
          const ft = (ct < 0 ? -1 : 1) * Math.max(0.25, Math.abs(ct));
          const along = (1 - lift) * e.changeY;
          ox.set(ox.get() - (c * e.changeX) / k + (s * along) / (k * ft));
          oy.set(oy.get() + (s * e.changeX) / k + (c * along) / (k * ft));
          oz.set(oz.get() + (lift * e.changeY) / (k * Math.max(0.25, st)));
        } else {
          // One finger: orbit the pivot. Across turns the map (the same way at every tilt, so the side nearest the
          // viewer follows the finger above and below the plane); down tilts it towards straight down, up through
          // edge-on to straight up from below.
          yaw.set(yaw.get() + e.changeX * ROTATE_PER_PT);
          tilt.set(Math.min(MAX_TILT, Math.max(0, tilt.get() - e.changeY * TILT_PER_PT)));
        }
      })
      .onEnd((e) => {
        if (moving.get() || panMode.get() || reduceMotion) return;
        // A short spin after a quick sideways flick; a mostly vertical drag (a tilt) ends where it is.
        if (Math.abs(e.velocityX) < 150 || Math.abs(e.velocityY) > Math.abs(e.velocityX)) return;
        const spin = Math.max(-0.8, Math.min(0.8, e.velocityX * ROTATE_PER_PT * 0.12));
        yaw.set(withTiming(yaw.get() + spin, { duration: 300, easing: Easing.out(Easing.quad) }));
      });
    const pinch = Gesture.Pinch()
      .onStart(() => {
        pinchFrom.set(scale.get());
        zoomOnly.set(false);
      })
      .onUpdate((e) => {
        // Once the fingers have clearly spread or closed, the rest of this gesture only zooms.
        if (Math.abs(Math.log(e.scale)) > 0.06) zoomOnly.set(true);
        scale.set(Math.min(maxScale.get(), Math.max(minScale.get(), pinchFrom.get() * e.scale)));
      })
      .onFinalize(() => {
        zoomOnly.set(false);
      });
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDuration(300)
      .onEnd((e, ok) => {
        if (ok) onTap(e.x, e.y);
      });
    // No double tap: it would hold every single tap until it failed. The recentre button does that job.
    return Gesture.Race(tap, Gesture.Simultaneous(pan, pinch));
  }, [onTap, notifyPan, reduceMotion, yaw, tilt, scale, ox, oy, oz, drops, minScale, maxScale, pinchFrom, panMode, moving, lock, zoomOnly]);

  // Web: the scroll wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms; shift-drag or right-drag pans.
  const host = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = host.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      scale.set(Math.min(maxScale.get(), Math.max(minScale.get(), scale.get() * k)));
    };
    const onDown = (e: PointerEvent) => {
      const pan = e.shiftKey || e.button === 2;
      panMode.set(pan);
      if (pan && !lock.get()) notifyPan();
    };
    const onMenu = (e: Event) => e.preventDefault();
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('contextmenu', onMenu);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('contextmenu', onMenu);
    };
  }, [scale, minScale, maxScale, panMode, notifyPan, lock]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.round(width) !== w || Math.round(height) !== h) setSize({ w: Math.round(width), h: Math.round(height) });
  };

  return (
    <View
      ref={host}
      onLayout={onLayout}
      style={[{ flex: 1, backgroundColor: palette.bg, overflow: 'hidden' }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden>
      <GestureDetector gesture={gesture}>
        <View style={{ flex: 1 }} collapsable={false}>
          {w > 0 && h > 0 ? (
            <Canvas style={{ width: w, height: h }}>
              <Picture picture={picture} />
            </Canvas>
          ) : null}
        </View>
      </GestureDetector>
    </View>
  );
}

export { StarMapCanvas as StarMap };
