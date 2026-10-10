// Marker key. Lists only the marker types that occur at the reader's current position: the timeline marks, then
// the Systems map marks, which are checked on both map dates (the chapter date and NOW).
import { View } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';

import { mapState, monthYear, routes } from '@/core';
import { NarratorPuck } from '@/components/map/narrator-puck';

import { Card, Tag } from '@/components/bits';
import { Icon } from '@/components/icon';
import { SheetFrame } from '@/components/sheet';
import { T } from '@/components/text';
import { useApp } from '@/state/app';
import { identityColour } from '@/theme/identity';

export default function KeySheet() {
  const { view, palette: p, colourOf } = useApp();
  const infos = [...view.info.values()];
  const c = identityColour(0, p.scheme);
  // The map can show the chapter date or NOW, so a map mark is listed if it occurs on either.
  const dates = [...new Set([view.chapter.time, view.latest].filter((t): t is number => t != null))];
  const states = dates.map((t) => mapState(view, t));
  const anyState = (f: (s: (typeof states)[number]) => boolean) => states.some(f);
  const narrator = view.chapter.narrator;
  const puckColour = narrator ? colourOf(narrator) : c;
  const hist = view.chapter.time != null ? [...routes(view, view.chapter.time).values()] : [];
  const hopsVia = (via: 'wormhole' | 'transmitted') =>
    anyState((s) => s.hops.some((h) => h.via === via) || s.ghosts.some((g) => g.via === via));
  type Item = { show: boolean; label: string; detail: string; sample: React.ReactNode };
  const items: Item[] = [
    { show: true, label: 'Colour', detail: 'Each narrator has a colour from his first chapter. Other Bobs take the colour of the narrator who introduced them.', sample: <View style={{ width: 8, height: 24, borderRadius: 3, backgroundColor: c }} /> },
    { show: true, label: 'At a system', detail: 'Solid bar: in a star system.', sample: <Svg width={60} height={12}><Rect x={4} y={3} width={52} height={6} rx={3} fill={c} /></Svg> },
    { show: infos.some((i) => i.moves.some((m) => m.kind === 'depart')), label: 'In transit', detail: 'Dashed line: between systems.', sample: <Svg width={60} height={12}><Line x1={4} x2={56} y1={6} y2={6} stroke={c} strokeWidth={2} strokeDasharray="4 3" /></Svg> },
    { show: infos.some((i) => i.bornEstimated), label: 'Estimated date', detail: 'Hatched: creation date not given.', sample: <Svg width={60} height={12}><Line x1={4} x2={56} y1={6} y2={6} stroke={c} strokeWidth={6} strokeDasharray="3 3" /></Svg> },
    { show: true, label: 'NOW', detail: 'Latest story date reached. Timelines stop here.', sample: <View style={{ backgroundColor: p.ink, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}><T variant="tag" color={p.inv}>NOW</T></View> },
    { show: view.chapter.flashbackYear != null, label: 'Chapter date (CH)', detail: 'Dashed rule: this chapter is set before NOW. Rings mark the narrator and Bobs in his system then.', sample: <View style={{ borderWidth: 1.5, borderColor: p.ink, borderRadius: 3, paddingHorizontal: 3 }}><T variant="tag">CH</T></View> },
    { show: !!view.chapter.narrator, label: 'Narrator', detail: 'Tells this chapter. Tinted row, POV tag.', sample: <Tag text="POV" /> },
    { show: view.newHere.bobs.length > 0, label: 'New', detail: 'First appeared in the chapter you just finished.', sample: <Tag text="NEW" /> },
    { show: infos.some((i) => i.status === 'lost'), label: 'Lost', detail: 'Destroyed or dead. Lane ends in a cross.', sample: <Icon name="lost" color={p.ink} size={14} strokeWidth={2.6} /> },
    { show: infos.some((i) => i.status === 'missing'), label: 'Missing', detail: 'Whereabouts unknown.', sample: <T variant="tag">?</T> },
    { show: !!view.scut.length, label: 'SCUT', detail: 'Faster-than-light link between systems.', sample: <Icon name="link" color={p.ink} size={16} strokeWidth={2} /> },
  ];
  // Map samples: Bobs in the neutral identity colour, everything else ink and told apart by shape.
  const mapItems: Item[] = [
    { show: true, label: 'Narrator', detail: 'Where he is on the chapter date. Drag across to turn the map, up or down to tilt.', sample: <NarratorPuck colour={puckColour} size={32} /> },
    { show: true, label: 'Floor and globe', detail: 'The globe turns with the map. The grey floor is level with the centre of view; its rings are one scale bar apart. A line drops from each star to the floor, dashed if the star is below it.', sample: <Svg width={60} height={44}><Rect x={0} y={0} width={60} height={44} fill={p.ink} fillOpacity={0.03} /><Ellipse cx={30} cy={22} rx={20} ry={11} fill={p.ink} fillOpacity={0.06} /><Path d="M0 22h10M50 22h10M30 0v11M30 33v11" stroke={p.ink} strokeOpacity={0.12} strokeWidth={0.75} /><Path d="M10 22h40M30 11v22" stroke={p.ink} strokeOpacity={0.22} strokeWidth={0.75} /><Ellipse cx={30} cy={22} rx={10} ry={5.5} fill="none" stroke={p.ink} strokeOpacity={0.25} strokeWidth={0.75} /><Ellipse cx={30} cy={22} rx={28} ry={15.5} fill="none" stroke={p.ink} strokeOpacity={0.14} strokeWidth={0.75} /><Circle cx={30} cy={22} r={20} fill="none" stroke={p.ink} strokeOpacity={0.16} strokeWidth={0.75} /><Path d="M10 22a20 11 0 0 0 40 0" fill="none" stroke={p.ink} strokeOpacity={0.3} strokeWidth={0.75} /><Path d="M10 22a20 11 0 0 1 40 0" fill="none" stroke={p.ink} strokeOpacity={0.18} strokeWidth={0.75} strokeDasharray="2 2.5" /><Line x1={42} x2={42} y1={9} y2={26} stroke={p.ink} strokeOpacity={0.45} strokeWidth={1} /><Ellipse cx={42} cy={26} rx={3} ry={1.4} fill="none" stroke={p.ink} strokeOpacity={0.45} strokeWidth={1} /><Circle cx={42} cy={9} r={3.25} fill={p.ink} /><Circle cx={30} cy={22} r={3.25} fill={p.ink} /></Svg> },
    { show: anyState((s) => s.places.some((x) => x.bobs.length + x.others.length > 0)), label: 'Who is where', detail: 'Names under each system: colour dot for a Bob, hollow square for another replicant, POV for the narrator, "+2" for more. Tap a name to open him. The names button switches to dots only.', sample: <Svg width={60} height={14}><Circle cx={5} cy={7} r={3.5} fill={c} /><Rect x={30} y={4} width={6} height={6} fill="none" stroke={p.ink} strokeWidth={1.25} /><Path d="M12 7h12M40 7h14" stroke={p.ink2} strokeWidth={2} strokeLinecap="round" /></Svg> },
    { show: hist.some((r) => r.legs.length > 0), label: 'Travel history', detail: 'Faint line per leg showing how the Bobs at the focus system got there, from where each was made (diamond). Tap a Bob for his full route and ancestors.', sample: <Svg width={60} height={16}><Line x1={12} x2={56} y1={8} y2={8} stroke={c} strokeOpacity={0.35} strokeWidth={1.25} /><Path d="M8 3.5L12.5 8 8 12.5 3.5 8Z" fill={c} fillOpacity={0.6} stroke={p.bg} strokeWidth={1.5} /></Svg> },
    { show: hist.some((r) => r.made?.place), label: 'Made here', detail: 'Diamond where a Bob was made. Hollow for another replicant.', sample: <Svg width={20} height={20}><Path d="M10 4.5L15.5 10 10 15.5 4.5 10Z" fill={c} stroke={p.bg} strokeWidth={1.5} /></Svg> },
    { show: anyState((s) => s.voyages.some((y) => y.fraction != null)), label: 'Voyage', detail: 'Solid line with arrows toward the destination. The dot shows progress on the map date.', sample: <Svg width={60} height={14}><Line x1={4} x2={56} y1={7} y2={7} stroke={c} strokeWidth={2} strokeLinecap="round" /><Path d="M14 3l4.5 4-4.5 4" stroke={c} strokeWidth={1.75} fill="none" strokeLinecap="round" /><Circle cx={40} cy={7} r={4} fill={c} stroke={p.bg} strokeWidth={1.5} /></Svg> },
    { show: anyState((s) => s.voyages.some((y) => y.to != null && y.fraction == null)), label: 'Arrival not known yet', detail: 'Line with arrows, no dot. Labelled with time travelled so far.', sample: <Svg width={60} height={14}><Line x1={4} x2={56} y1={7} y2={7} stroke={c} strokeWidth={2} strokeLinecap="round" /><Path d="M20 3l4.5 4-4.5 4M40 3l4.5 4-4.5 4" stroke={c} strokeWidth={1.75} fill="none" strokeLinecap="round" /></Svg> },
    { show: anyState((s) => s.voyages.some((y) => y.to == null)), label: 'Destination not given', detail: 'Short arrow leaving the system he set out from.', sample: <Svg width={60} height={14}><Circle cx={10} cy={7} r={4} fill="none" stroke={p.ink} strokeWidth={1.5} /><Line x1={16} x2={34} y1={7} y2={7} stroke={c} strokeWidth={2} strokeLinecap="round" /><Path d="M40 7l-6.5 -3.5v7Z" fill={c} /></Svg> },
    { show: hopsVia('wormhole'), label: 'Wormhole hop', detail: 'Thin arc between two gate rings. Instant, so no dot.', sample: <Svg width={60} height={24}><Path d="M10 18 Q30 0 50 18" fill="none" stroke={c} strokeWidth={1.5} /><Ellipse cx={10} cy={18} rx={8} ry={4.5} fill="none" stroke={p.ink} strokeWidth={1.25} /><Ellipse cx={50} cy={18} rx={8} ry={4.5} fill="none" stroke={p.ink} strokeWidth={1.25} /></Svg> },
    { show: hopsVia('transmitted'), label: 'Transmitted', detail: 'Dotted arc: his matrix was sent, not flown.', sample: <Svg width={60} height={24}><Path d="M10 18 Q30 0 50 18" fill="none" stroke={p.ink} strokeWidth={1.5} strokeDasharray="1 3" strokeLinecap="round" /></Svg> },
    { show: anyState((s) => s.ghosts.length > 0), label: 'Known later', detail: `In a flashback chapter, faint double lines ending in a hollow ring show what you know happens by NOW (${monthYear(view.latest)}). Tap one for details.`, sample: <Svg width={60} height={14}><Line x1={4} x2={46} y1={5.5} y2={5.5} stroke={c} strokeOpacity={0.45} strokeWidth={0.75} /><Line x1={4} x2={46} y1={8.5} y2={8.5} stroke={c} strokeOpacity={0.45} strokeWidth={0.75} /><Circle cx={51} cy={7} r={4} fill="none" stroke={c} strokeOpacity={0.6} strokeWidth={1.5} /></Svg> },
    { show: anyState((s) => s.places.some((x) => x.others.length > 0) || s.voyages.some((y) => y.isOther)), label: 'Other replicant', detail: 'Not a Bob. Hollow ink marker and outlined line, never a Bob colour.', sample: <Svg width={60} height={14}><Line x1={4} x2={40} y1={7} y2={7} stroke={p.ink} strokeWidth={3.5} /><Line x1={4} x2={40} y1={7} y2={7} stroke={p.bg} strokeWidth={1.5} /><Path d="M19 3l4.5 4-4.5 4" stroke={p.ink} strokeWidth={1.5} fill="none" strokeLinecap="round" /><Rect x={44} y={2} width={10} height={10} fill={p.bg} stroke={p.ink} strokeWidth={1.5} /></Svg> },
    { show: anyState((s) => s.scutLinks.length > 0), label: 'SCUT link', detail: 'Thin ink line with a tick near each end, between systems linked by SCUT on the map date.', sample: <Svg width={60} height={14}><Line x1={8} x2={52} y1={7} y2={7} stroke={p.ink} strokeWidth={1} /><Path d="M17 3.5v7M43 3.5v7" stroke={p.ink} strokeWidth={1} /><Circle cx={8} cy={7} r={3} fill={p.ink} /><Circle cx={52} cy={7} r={3} fill={p.ink} /></Svg> },
  ];
  const sections = [
    { title: null, rows: items.filter((i) => i.show) },
    { title: 'Systems map', rows: mapItems.filter((i) => i.show) },
  ].filter((s) => s.rows.length);
  return (
    <SheetFrame title="Key">
      <T variant="secondary" tone="ink2">Only markers at your current position are listed.</T>
      {sections.map((s) => (
        <View key={s.title ?? 'timeline'} style={{ gap: 8 }}>
          {s.title ? <T variant="overline" tone="ink2" accessibilityRole="header">{s.title.toUpperCase()}</T> : null}
          <Card>
            {s.rows.map((i, n) => (
              <View key={i.label} accessible accessibilityLabel={`${i.label}. ${i.detail}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderTopWidth: n ? 1 : 0, borderColor: p.line2 }}>
                <View style={{ width: 64, alignItems: 'center' }}>{i.sample}</View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="row">{i.label}</T>
                  <T variant="secondary" tone="ink2">{i.detail}</T>
                </View>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </SheetFrame>
  );
}
