// The Systems map's key items, shared by the Key sheet (everything at the reading position) and the key beside the
// map on wide screens (only what is drawn now). Samples: Bobs in the neutral identity colour, everything else ink and
// told apart by shape.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { monthYear, type MapLayers, type MapState, type ProgressView, type Route } from '@/core';
import { NarratorPuck } from '@/components/map/narrator-puck';
import type { Palette } from '@/theme/tokens';

import { flashGlow, GLINT_LEN, HOP_DELAY, MOTION_MS, RIPPLES_PER_CYCLE } from './motion';

export interface MapKeyItem {
  id: string;
  label: string;
  detail: string;
  sample: ReactNode;
  /** Listed beside the map when it applies (orientation aids that are always there are not). */
  beside: boolean;
  show: boolean;
}

export interface MapKeyInput {
  view: ProgressView;
  /** The map states to check: the sheet passes both map dates unfiltered, the key beside the map the one drawn. */
  states: MapState[];
  layers: MapLayers;
  palette: Palette;
  /** The neutral identity colour for Bob samples, and the narrator's for his puck and ripples. */
  colour: string;
  puckColour: string;
  /** Travel history routes for the chapter date (empty when not drawn). */
  history: Route[];
  /** The SCUT network differs at NOW in this flashback (its outline is drawn). */
  nowDiffers: boolean;
  netLabel: string;
  /** SCUT's range (ly) once the reader knows it. */
  rangeLy: number | null;
}

/** A ripple: an arc curving away from the caller (on the left). */
const ripple = (x: number, y: number, r: number, a: number) =>
  `M${x - r + r * Math.cos(a)} ${y - r * Math.sin(a)}A${r} ${r} 0 0 1 ${x - r + r * Math.cos(a)} ${y + r * Math.sin(a)}`;

const Clock = createContext(0);

/** One clock for every animated sample inside it, ticking a few times a second while `active` (the key is on
 * screen); still with Reduce Motion. Only the samples re-render. */
export function KeyClock({ active, children }: { active: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  const [now, setNow] = useState(0);
  const run = active && !reduce;
  useEffect(() => {
    if (!run) return;
    const id = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(id);
  }, [run]);
  return <Clock.Provider value={run ? now : 0}>{children}</Clock.Provider>;
}

/** The map's motion cycle as a share (0 to 1) and its count. */
function useCycle(): { frac: number; cycle: number } {
  const t = useContext(Clock) / MOTION_MS;
  return { frac: t - Math.floor(t), cycle: Math.floor(t) };
}
const ends = (t: number) => Math.max(0, Math.min(1, t * 5, (1 - t) * 5));

/** Ripples drifting from left to right, widening, fading at the ends. */
function Ripples({ colour, ring, ink, big }: { colour: string; ring: boolean; ink: string; big: boolean }) {
  const { frac } = useCycle();
  const shift = (frac * RIPPLES_PER_CYCLE) % 1;
  const n = big ? 4 : 5;
  const x0 = 6;
  const span = big ? 34 : 46;
  const cy = big ? 12 : 7;
  return (
    <Svg width={60} height={big ? 24 : 14}>
      {Array.from({ length: n + 1 }, (_, k) => {
        const t = Math.min(1, (k + shift) / n);
        const r = big ? 3.5 + 3.5 * t : 2.5 + 2.5 * t;
        return <Path key={k} d={ripple(x0 + t * span + r, cy, r, big ? 0.73 : 0.66)} stroke={colour} strokeOpacity={(big ? 0.95 : 0.6) * ends(t)} strokeWidth={big ? 1.5 : 1.25} fill="none" strokeLinecap="round" />;
      })}
      {ring ? (
        <>
          <Circle cx={52} cy={12} r={6} fill="none" stroke={ink} strokeWidth={1.5} />
          <Circle cx={52} cy={12} r={2.5} fill={ink} />
        </>
      ) : null}
    </Svg>
  );
}

/** A voyage line with its chevron and dot, and the glint drifting along it. */
function VoyageSample({ colour, p }: { colour: string; p: Palette }) {
  const { frac } = useCycle();
  const x = 4 + frac * 52;
  const t = frac;
  return (
    <Svg width={60} height={14}>
      <Line x1={4} x2={56} y1={7} y2={7} stroke={colour} strokeWidth={2} strokeLinecap="round" />
      <Path d="M14 3l4.5 4-4.5 4" stroke={colour} strokeWidth={1.75} fill="none" strokeLinecap="round" />
      <Line x1={x} x2={Math.min(56, x + GLINT_LEN)} y1={7} y2={7} stroke={p.ink} strokeOpacity={0.5 * ends(t)} strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx={40} cy={7} r={4} fill={colour} stroke={p.bg} strokeWidth={1.5} />
    </Svg>
  );
}

/** Three trunk-line links: dim at rest, a pulse lighting each whole link in turn. */
function TrunkSample({ p }: { p: Palette }) {
  const { frac } = useCycle();
  const xs = [6, 22, 38, 54];
  return (
    <Svg width={60} height={14}>
      {[0, 1, 2].map((h) => {
        const k = (((frac - h * HOP_DELAY * 2) % 1) + 1) % 1;
        const glow = flashGlow(k);
        return (
          <G key={h}>
            <Line x1={xs[h]} x2={xs[h + 1]} y1={7} y2={7} stroke={p.ink} strokeOpacity={0.06 + 0.1 * glow} strokeWidth={5} strokeLinecap="round" />
            <Line x1={xs[h]} x2={xs[h + 1]} y1={7} y2={7} stroke={p.ink} strokeOpacity={0.32 + 0.38 * glow} strokeWidth={1} />
          </G>
        );
      })}
      {xs.map((x) => <Circle key={x} cx={x} cy={7} r={2.5} fill={p.ink} />)}
    </Svg>
  );
}

export function mapKeyItems(k: MapKeyInput): MapKeyItem[] {
  const { view, states, layers, palette: p, colour: c, puckColour } = k;
  const any = (f: (s: MapState) => boolean) => states.some(f);
  const narrator = view.chapter.narrator;
  const system = view.chapter.system;
  const hopsVia = (via: 'wormhole' | 'transmitted') => any((s) => s.hops.some((h) => h.via === via) || s.ghosts.some((g) => g.via === via));
  const volume = layers.scut === 'volume' && view.scut.length > 0;
  return [
    { id: 'puck', label: 'Narrator', detail: 'Where he is on the chapter date. Drag across to turn the map, up or down to tilt.', sample: <NarratorPuck colour={puckColour} size={32} />, beside: true, show: !!narrator && any((s) => s.places.some((x) => x.narrator) || s.voyages.some((v) => v.who === narrator)) },
    { id: 'globe', label: 'Floor and globe', detail: 'The globe turns with the map. The grey floor is level with the centre of view; its rings are one scale bar apart. A line drops from each star to the floor, dashed if the star is below it.', sample: <Svg width={60} height={44}><Rect x={0} y={0} width={60} height={44} fill={p.ink} fillOpacity={0.03} /><Ellipse cx={30} cy={22} rx={20} ry={11} fill={p.ink} fillOpacity={0.06} /><Path d="M0 22h10M50 22h10M30 0v11M30 33v11" stroke={p.ink} strokeOpacity={0.12} strokeWidth={0.75} /><Path d="M10 22h40M30 11v22" stroke={p.ink} strokeOpacity={0.22} strokeWidth={0.75} /><Ellipse cx={30} cy={22} rx={10} ry={5.5} fill="none" stroke={p.ink} strokeOpacity={0.25} strokeWidth={0.75} /><Ellipse cx={30} cy={22} rx={28} ry={15.5} fill="none" stroke={p.ink} strokeOpacity={0.14} strokeWidth={0.75} /><Circle cx={30} cy={22} r={20} fill="none" stroke={p.ink} strokeOpacity={0.16} strokeWidth={0.75} /><Path d="M10 22a20 11 0 0 0 40 0" fill="none" stroke={p.ink} strokeOpacity={0.3} strokeWidth={0.75} /><Path d="M10 22a20 11 0 0 1 40 0" fill="none" stroke={p.ink} strokeOpacity={0.18} strokeWidth={0.75} strokeDasharray="2 2.5" /><Line x1={42} x2={42} y1={9} y2={26} stroke={p.ink} strokeOpacity={0.45} strokeWidth={1} /><Ellipse cx={42} cy={26} rx={3} ry={1.4} fill="none" stroke={p.ink} strokeOpacity={0.45} strokeWidth={1} /><Circle cx={42} cy={9} r={3.25} fill={p.ink} /><Circle cx={30} cy={22} r={3.25} fill={p.ink} /></Svg>, beside: false, show: true },
    { id: 'galaxy', label: 'Galaxy', detail: 'The Milky Way seen from the same angle as the map. The ring is the Sun, 26,700 ly from the centre; the arrow points to galactic north. Tap it to recentre the map.', sample: <Svg width={44} height={30}><Ellipse cx={22} cy={15} rx={20} ry={11} fill={p.ink} fillOpacity={0.07} /><Path d="M22 15c6-4 13 0 12 5M22 15c-6 4-13 0-12-5M22 15c-2-5 4-9 9-8M22 15c2 5-4 9-9 8" fill="none" stroke={p.ink} strokeOpacity={0.3} strokeWidth={1} /><Ellipse cx={22} cy={15} rx={3} ry={2} fill={p.ink} fillOpacity={0.3} /><Line x1={11} x2={11} y1={20} y2={8} stroke={p.ink} strokeWidth={1.25} /><Circle cx={11} cy={20} r={2.5} fill={p.bg} stroke={p.ink} strokeWidth={1.25} /></Svg>, beside: false, show: true },
    { id: 'milkyway', label: 'Milky Way', detail: 'Tilt to edge-on to see it along the galactic plane, brightest towards the galactic centre.', sample: <Svg width={60} height={24}><Rect x={0} y={9} width={60} height={6} fill={p.ink} fillOpacity={0.06} /><Circle cx={40} cy={12} r={8} fill={p.ink} fillOpacity={0.08} /><Circle cx={12} cy={4} r={0.9} fill={p.ink} fillOpacity={0.4} /><Circle cx={50} cy={20} r={0.9} fill={p.ink} fillOpacity={0.4} /></Svg>, beside: false, show: true },
    { id: 'ring', label: 'Chapter set here', detail: 'Ring round the system the chapter is set in, when the narrator is elsewhere or not a Bob.', sample: <Svg width={24} height={24}><Circle cx={12} cy={12} r={10} fill="none" stroke={p.ink} strokeWidth={1.5} /><Circle cx={12} cy={12} r={4.25} fill={p.ink} /></Svg>, beside: true, show: !!system && any((s) => (!narrator || s.calls.some((x) => x.pov)) && s.places.some((x) => x.id === system && !!x.pos)) },
    { id: 'who', label: 'Who is where', detail: 'Names under each system: colour dot for a Bob, hollow square for another replicant, POV for the narrator, "+2" for more. Tap a name to open him. Turn Names off under Layers for dots only.', sample: <Svg width={60} height={14}><Circle cx={5} cy={7} r={3.5} fill={c} /><Rect x={30} y={4} width={6} height={6} fill="none" stroke={p.ink} strokeWidth={1.25} /><Path d="M12 7h12M40 7h14" stroke={p.ink2} strokeWidth={2} strokeLinecap="round" /></Svg>, beside: true, show: any((s) => s.places.some((x) => x.bobs.length + x.others.length > 0)) },
    { id: 'empty', label: 'Nobody there', detail: 'Small hollow dot: a known system with nobody there on the map date.', sample: <Svg width={20} height={20}><Circle cx={10} cy={10} r={3} fill="none" stroke={p.ink} strokeOpacity={0.7} strokeWidth={1.25} /></Svg>, beside: true, show: any((s) => s.places.some((x) => !!x.pos && !x.guess && !x.scut && x.bobs.length + x.others.length + x.lost.length + x.presence.length === 0)) },
    { id: 'lost', label: 'Lost here', detail: 'Crosses beside a system: lost there by the map date. More than three: one cross and the count.', sample: <Svg width={28} height={20}><Path d="M3.5 4.5l5 5M8.5 4.5l-5 5M10.5 4.5l5 5M15.5 4.5l-5 5" stroke={p.ink} strokeOpacity={0.8} strokeWidth={1.25} /><Circle cx={22} cy={13} r={4.25} fill={p.ink} /></Svg>, beside: true, show: any((s) => s.places.some((x) => x.lost.length > 0)) },
    { id: 'home', label: 'Home system', detail: 'Double ring: where a species or people comes from.', sample: <Svg width={28} height={28}><Circle cx={14} cy={14} r={8.5} fill="none" stroke={p.ink} strokeOpacity={0.75} strokeWidth={1.25} /><Circle cx={14} cy={14} r={12} fill="none" stroke={p.ink} strokeOpacity={0.75} strokeWidth={1.25} /><Circle cx={14} cy={14} r={4.25} fill={p.ink} /></Svg>, beside: true, show: any((s) => s.places.some((x) => x.presence.some((y) => y.kind === 'home'))) },
    { id: 'colony', label: 'Colony', detail: 'Ring round a system.', sample: <Svg width={24} height={24}><Circle cx={12} cy={12} r={8.5} fill="none" stroke={p.ink} strokeOpacity={0.7} strokeWidth={1.25} /><Circle cx={12} cy={12} r={4.25} fill={p.ink} /></Svg>, beside: true, show: any((s) => s.places.some((x) => x.presence.some((y) => y.kind === 'colony'))) },
    { id: 'outpost', label: 'Outpost', detail: 'Square round a system: a base, station or mine.', sample: <Svg width={24} height={24}><Rect x={3.5} y={3.5} width={17} height={17} fill="none" stroke={p.ink} strokeOpacity={0.7} strokeWidth={1} /><Circle cx={12} cy={12} r={4.25} fill={p.ink} /></Svg>, beside: true, show: any((s) => s.places.some((x) => x.presence.some((y) => y.kind === 'outpost'))) },
    { id: 'territory', label: 'Territory', detail: 'Wide dashed ring: a system a group holds.', sample: <Svg width={36} height={36}><Circle cx={18} cy={18} r={15} fill="none" stroke={p.ink} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="3 3" /><Circle cx={18} cy={18} r={4.25} fill={p.ink} /></Svg>, beside: true, show: any((s) => s.places.some((x) => x.presence.some((y) => y.kind === 'territory'))) },
    { id: 'guess', label: 'Best guess', detail: "Dashed ring and ? after the name: the books don't place this system. Tap it for the star chosen and the likely distance.", sample: <Svg width={24} height={24}><Circle cx={12} cy={12} r={4.25} fill="none" stroke={p.ink} strokeWidth={1.5} strokeDasharray="2 2" /></Svg>, beside: true, show: any((s) => s.places.some((x) => !!x.guess && !!x.pos)) },
    { id: 'history', label: 'Travel history', detail: 'Faint line per leg showing how the Bobs at the focus system got there, from where each was made (diamond). Tap a Bob for his full route and ancestors.', sample: <Svg width={60} height={16}><Line x1={12} x2={56} y1={8} y2={8} stroke={c} strokeOpacity={0.35} strokeWidth={1.25} /><Path d="M8 3.5L12.5 8 8 12.5 3.5 8Z" fill={c} fillOpacity={0.6} stroke={p.bg} strokeWidth={1.5} /></Svg>, beside: true, show: k.history.some((r) => r.legs.length > 0) },
    { id: 'made', label: 'Made here', detail: 'Diamond where a Bob was made. Hollow for another replicant.', sample: <Svg width={20} height={20}><Path d="M10 4.5L15.5 10 10 15.5 4.5 10Z" fill={c} stroke={p.bg} strokeWidth={1.5} /></Svg>, beside: true, show: k.history.some((r) => r.made?.place) },
    { id: 'voyage', label: 'Voyage', detail: 'Solid line with arrows towards the destination; a faint glint drifts along it. The dot shows progress on the map date.', sample: <VoyageSample colour={c} p={p} />, beside: true, show: any((s) => s.voyages.some((y) => y.fraction != null)) },
    { id: 'noarrival', label: 'Arrival not known yet', detail: 'Line with arrows, no dot. Labelled with time travelled so far.', sample: <Svg width={60} height={14}><Line x1={4} x2={56} y1={7} y2={7} stroke={c} strokeWidth={2} strokeLinecap="round" /><Path d="M20 3l4.5 4-4.5 4M40 3l4.5 4-4.5 4" stroke={c} strokeWidth={1.75} fill="none" strokeLinecap="round" /></Svg>, beside: true, show: any((s) => s.voyages.some((y) => y.to != null && y.fraction == null)) },
    { id: 'nodest', label: 'Destination not given', detail: 'Short arrow leaving the system he set out from.', sample: <Svg width={60} height={14}><Circle cx={10} cy={7} r={4} fill="none" stroke={p.ink} strokeWidth={1.5} /><Line x1={16} x2={34} y1={7} y2={7} stroke={c} strokeWidth={2} strokeLinecap="round" /><Path d="M40 7l-6.5 -3.5v7Z" fill={c} /></Svg>, beside: true, show: any((s) => s.voyages.some((y) => y.to == null)) },
    { id: 'wormhole', label: 'Wormhole hop', detail: 'Thin arc between two gate rings. Instant, so no dot.', sample: <Svg width={60} height={24}><Path d="M10 18 Q30 0 50 18" fill="none" stroke={c} strokeWidth={1.5} /><Ellipse cx={10} cy={18} rx={8} ry={4.5} fill="none" stroke={p.ink} strokeWidth={1.25} /><Ellipse cx={50} cy={18} rx={8} ry={4.5} fill="none" stroke={p.ink} strokeWidth={1.25} /></Svg>, beside: true, show: hopsVia('wormhole') },
    { id: 'transmitted', label: 'Transmitted', detail: 'Dotted arc: his matrix was sent, not flown.', sample: <Svg width={60} height={24}><Path d="M10 18 Q30 0 50 18" fill="none" stroke={p.ink} strokeWidth={1.5} strokeDasharray="1 3" strokeLinecap="round" /></Svg>, beside: true, show: hopsVia('transmitted') },
    { id: 'ghost', label: 'Known later', detail: `In a flashback chapter, faint double lines ending in a hollow ring show what you know happens by NOW (${monthYear(view.latest)}). Tap one for details.`, sample: <Svg width={60} height={14}><Line x1={4} x2={46} y1={5.5} y2={5.5} stroke={c} strokeOpacity={0.45} strokeWidth={0.75} /><Line x1={4} x2={46} y1={8.5} y2={8.5} stroke={c} strokeOpacity={0.45} strokeWidth={0.75} /><Circle cx={51} cy={7} r={4} fill="none" stroke={c} strokeOpacity={0.6} strokeWidth={1.5} /></Svg>, beside: true, show: any((s) => s.ghosts.length > 0) },
    { id: 'other', label: 'Other replicant', detail: 'Not a Bob. Hollow ink marker and outlined line, never a Bob colour.', sample: <Svg width={60} height={14}><Line x1={4} x2={40} y1={7} y2={7} stroke={p.ink} strokeWidth={3.5} /><Line x1={4} x2={40} y1={7} y2={7} stroke={p.bg} strokeWidth={1.5} /><Path d="M19 3l4.5 4-4.5 4" stroke={p.ink} strokeWidth={1.5} fill="none" strokeLinecap="round" /><Rect x={44} y={2} width={10} height={10} fill={p.bg} stroke={p.ink} strokeWidth={1.5} /></Svg>, beside: true, show: any((s) => s.places.some((x) => x.others.length > 0) || s.voyages.some((y) => y.isOther)) },
    { id: 'calling', label: 'Calling in', detail: 'Ripples drifting from where the narrator is to where the chapter is set: he takes part from another system.', sample: <Ripples colour={puckColour} ring ink={p.ink} big />, beside: true, show: any((s) => s.calls.some((x) => x.pov)) },
    { id: 'called', label: 'Called in', detail: 'Smaller, fainter ripples: someone else in the chapter takes part from another system.', sample: <Ripples colour={c} ring={false} ink={p.ink} big={false} />, beside: true, show: any((s) => s.calls.some((x) => !x.pov)) },
    { id: 'estimate', label: 'Estimated position', detail: 'Dashed ring on a voyage: where someone calling in probably is, from the usual speed of journeys so far. The ripples start there.', sample: <Svg width={60} height={14}><Line x1={4} x2={56} y1={7} y2={7} stroke={c} strokeWidth={1.75} /><Circle cx={30} cy={7} r={5.5} fill={p.bg} /><Circle cx={30} cy={7} r={4.25} fill="none" stroke={p.ink} strokeWidth={1.5} strokeDasharray="2 2" /></Svg>, beside: true, show: any((s) => s.voyages.some((v) => v.fraction == null && v.estimate != null && s.calls.some((x) => x.who === v.who && x.from === null))) },
    { id: 'scut', label: `${k.netLabel} link`, detail: 'Dim trunk line between systems linked by SCUT. Now and then a pulse spreads through the network, lighting each link along its whole length at once: SCUT is instant.', sample: <TrunkSample p={p} />, beside: true, show: layers.scut !== 'hide' && any((s) => s.scutLinks.length > 0) },
    { id: 'volume', label: `${k.netLabel} volume`, detail: `${k.rangeLy ? `Space within SCUT's range (${k.rangeLy} ly) of every system and ship on it` : 'Space round every system and ship on SCUT'} on the map date. Darker on the side nearer you; the far edge is dashed. Hidden while a Bob is selected.`, sample: <Svg width={60} height={30}><Defs><LinearGradient id="net" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={p.ink} stopOpacity={0.02} /><Stop offset="1" stopColor={p.ink} stopOpacity={0.16} /></LinearGradient></Defs><Path d="M8 22Q6 10 18 6L42 4Q54 4 54 14L50 24Q48 28 40 28L16 28Q9 28 8 22Z" fill="url(#net)" /><Path d="M8 22Q6 10 18 6L42 4Q54 4 54 14" fill="none" stroke={p.ink} strokeOpacity={0.3} strokeWidth={1} strokeDasharray="3 3" /><Path d="M54 14L50 24Q48 28 40 28L16 28Q9 28 8 22" fill="none" stroke={p.ink} strokeOpacity={0.5} strokeWidth={1.25} /><Circle cx={18} cy={20} r={2.5} fill={p.ink} /><Circle cx={30} cy={10} r={2.5} fill={p.ink} /><Circle cx={44} cy={18} r={2.5} fill={p.ink} /></Svg>, beside: true, show: volume && any((s) => s.places.some((x) => x.scut)) },
    { id: 'volumenow', label: `${k.netLabel} at NOW`, detail: 'Faint double outline: the same at NOW.', sample: <Svg width={60} height={24}><Path d="M10 20L30 4L52 20Z" fill="none" stroke={p.ink} strokeOpacity={0.3} strokeWidth={0.75} /><Path d="M5 22.5L30 1L57 22.5Z" fill="none" stroke={p.ink} strokeOpacity={0.3} strokeWidth={0.75} /></Svg>, beside: true, show: volume && k.nowDiffers },
  ];
}
