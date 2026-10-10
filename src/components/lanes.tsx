// Life lanes on a shared time axis. Names stay pinned on the left so they never scroll off screen.
import { memo } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { Tag } from '@/components/bits';
import { Icon } from '@/components/icon';
import { T } from '@/components/text';
import { laneFor, type Axis, type TreeRow, frac } from '@/core';
import { useApp, usePalette } from '@/state/app';
import { withAlpha } from '@/theme/identity';

/** A vertical dashed rule (chapter date). Drawn with SVG because one-sided dashed borders don't render on iOS. */
export function DashedRule({ height, color, width = 1.5 }: { height: number; color: string; width?: number }) {
  return (
    <View style={{ position: 'absolute', top: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={2} height={height}>
        <Line x1={1} x2={1} y1={0} y2={height} stroke={color} strokeWidth={width} strokeDasharray="3 3" />
      </Svg>
    </View>
  );
}

export function TimeAxisBar({ axis, nameWidth, rightPad, label, onLabelPress }: { axis: Axis; nameWidth: number; rightPad: number; label: string; onLabelPress?: () => void }) {
  const p = usePalette();
  return (
    <View style={{ height: 32, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: p.line, backgroundColor: p.bg }}>
      <Pressable onPress={onLabelPress} disabled={!onLabelPress} accessibilityRole="button" accessibilityLabel={`Time range: ${label}`}
        style={{ width: nameWidth, height: 32, paddingLeft: 16, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <T variant="data" numberOfLines={1}>{label}</T>
        {onLabelPress ? <Icon name="chevronDown" color={p.ink} size={12} strokeWidth={2.4} /> : null}
      </Pressable>
      <View style={{ flex: 1, height: 32, marginRight: rightPad }}>
        {axis.ticks.map((t, i) => {
          const f = frac(axis, t.year);
          if (f > 0.9 || (axis.ch != null && Math.abs(f - frac(axis, axis.ch)) < 0.08)) return null;
          return (
            <View key={i} style={{ position: 'absolute', left: `${f * 100}%`, top: 9 }}>
              <T variant="data" tone="ink3" style={{ fontSize: 10, transform: [{ translateX: f < 0.02 ? 0 : -14 }] }}>{t.label}</T>
            </View>
          );
        })}
        {axis.ch != null ? (
          <View style={{ position: 'absolute', left: `${frac(axis, axis.ch) * 100}%`, top: 7, transform: [{ translateX: -14 }], borderWidth: 1.5, borderColor: p.ink, borderRadius: 3, paddingHorizontal: 3, backgroundColor: p.bg }}>
            <T variant="tag">CH</T>
          </View>
        ) : null}
        <View style={{ position: 'absolute', right: 0, top: 7, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1, backgroundColor: p.ink }}>
          <T variant="tag" color={p.inv}>NOW</T>
        </View>
      </View>
    </View>
  );
}

const INDENT = 14;
/** x of the line that joins a row at depth d + 1 to its parent at depth d (centre of the parent's chevron). */
const railX = (d: number) => 10 + d * INDENT + 6;

/** Lineage lines in the name column: rails for open branches above, an elbow into this row, and a line down to
 * his own children. */
function Connectors({ row, color }: { row: { depth: number; rails: boolean[]; last: boolean; openBelow?: boolean; hasKids?: boolean }; color: string }) {
  const w = 1.5;
  const d = row.depth;
  const line = { position: 'absolute' as const, backgroundColor: color, opacity: 0.55 };
  return (
    <>
      {row.rails.map((on, k) => (on ? <View key={k} style={{ ...line, left: railX(k) - w / 2, top: 0, bottom: 0, width: w }} /> : null))}
      {d > 0 ? (
        <>
          <View style={{ ...line, left: railX(d - 1) - w / 2, top: 0, width: w, ...(row.last ? { height: '50%' } : { bottom: 0 }) }} />
          <View style={{ ...line, left: railX(d - 1), top: '50%', width: 10 + d * INDENT - railX(d - 1) + (row.hasKids ? -1 : 14), height: w }} />
        </>
      ) : null}
      {row.openBelow ? <View style={{ ...line, left: railX(d) - w / 2, top: '50%', marginTop: 8, bottom: 0, width: w }} /> : null}
    </>
  );
}

export interface LaneRowProps {
  row: Extract<TreeRow, { kind: 'bob' }>;
  axis: Axis;
  nameWidth: number;
  rightPad: number;
  dense: boolean;
  largeText: boolean;
  /** Bobs that get a ring on the chapter-date rule (narrator + Bobs in his system). */
  ringIds: Set<string>;
  /** When a Bob is selected: him and his ancestors. Null when nothing is selected. */
  lineage: Set<string> | null;
  /** Width of the lane track in points, measured by the list. SVG percentages don't resolve reliably on iOS, so
   * lanes are drawn in points. */
  trackWidth: number;
  onPress: (id: string) => void;
  /** Collapse or expand the branch under this row (by row key). */
  onToggle: (key: string) => void;
}

export const LaneRow = memo(function LaneRow({ row, axis, nameWidth, rightPad, dense, largeText, ringIds, lineage, trackWidth, onPress, onToggle }: LaneRowProps) {
  const { view, palette: p, colourOf, selected } = useApp();
  const I = view.info.get(row.id)!;
  const ch = view.chapter;
  const c = colourOf(row.id);
  const isNarrator = ch.narrator === row.id;
  const inSystem = ch.here.includes(row.id) || ch.travelling.includes(row.id) || ch.lostHere.includes(row.id);
  const lane = laneFor(view, row.id, axis, ringIds);
  const h = dense ? 28 : 48;
  const dim = (lineage && !lineage.has(row.id)) || row.ancestorOnly;
  const bg = row.id === selected ? p.sel : lineage ? 'transparent' : isNarrator ? withAlpha(c, 0.14) : inSystem ? p.tintInk : 'transparent';
  const sub = I.status === 'lost' ? `Lost ${Math.floor(I.end)}` : I.status === 'missing' ? 'Missing' : I.inTransit ? `→ ${I.inTransit.to ?? '?'}` : I.loc ?? '';
  const tag = isNarrator ? 'POV' : I.isNew ? 'NEW' : null;
  const a11y = [
    row.id,
    I.generation ? `generation ${I.generation}` : 'parent not known',
    I.bob.parent && view.info.has(I.bob.parent) ? `copied from ${I.bob.parent}` : null,
    I.status === 'lost' ? `lost ${Math.floor(I.end)}` : I.status === 'missing' ? 'missing' : I.inTransit ? `in transit to ${I.inTransit.to ?? 'an unknown destination'}` : I.loc ? `at ${I.loc}` : null,
    isNarrator ? 'narrating this chapter' : null,
    I.isNew ? 'new in the last chapter' : null,
    row.hidden ? `${row.hidden} more in collapsed branch` : null,
  ].filter(Boolean).join(', ');

  const track = (
    <View style={{ flex: largeText ? undefined : 1, height: h, marginRight: rightPad, marginLeft: largeText ? 16 : 0 }}>
      {trackWidth > 0 ? (
        <Svg width={trackWidth} height={h}>
          {axis.ch != null ? <Line x1={frac(axis, axis.ch) * trackWidth} x2={frac(axis, axis.ch) * trackWidth} y1={0} y2={h} stroke={p.ink3} strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="3 3" /> : null}
          <Line x1={trackWidth - 0.75} x2={trackWidth - 0.75} y1={0} y2={h} stroke={p.ink} strokeWidth={1.5} />
          {lane.segments.map((s, i) => {
            const x = s.start * trackWidth;
            const x2 = s.end * trackWidth;
            if (s.kind === 'stay') return <Rect key={i} x={x} y={h / 2 - 3} width={Math.max(x2 - x, 3)} height={6} rx={3} fill={c} />;
            if (s.kind === 'estimated') return <Line key={i} x1={x} x2={x2} y1={h / 2} y2={h / 2} stroke={c} strokeWidth={6} strokeDasharray="3 3" />;
            return <Line key={i} x1={x} x2={x2} y1={h / 2} y2={h / 2} stroke={c} strokeWidth={2} strokeDasharray="4 3" />;
          })}
        </Svg>
      ) : null}
      {lane.ring != null ? (
        <View style={{ position: 'absolute', left: `${lane.ring * 100}%`, top: h / 2 - 7, marginLeft: -7, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: p.ink, backgroundColor: isNarrator ? p.ink : p.surf }} />
      ) : null}
      {lane.lostAt != null ? (
        <View style={{ position: 'absolute', left: `${lane.lostAt * 100}%`, top: h / 2 - 7, marginLeft: -7 }}>
          <Icon name="lost" color={p.ink} size={14} strokeWidth={2.6} />
        </View>
      ) : null}
      {row.hidden ? (
        <View style={{ position: 'absolute', left: 0, top: h / 2 - 11, height: 22, paddingHorizontal: 8, borderRadius: 11, borderWidth: 1, borderColor: p.line, backgroundColor: p.surf, justifyContent: 'center' }}>
          <T variant="data" tone="ink2" style={{ fontSize: 11 }}>{`+${row.hidden} in branch`}</T>
        </View>
      ) : null}
    </View>
  );

  return (
    <Pressable
      onPress={() => onPress(row.id)}
      onLongPress={row.hasKids ? () => onToggle(row.key) : undefined}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint={row.hasKids ? 'Long press to collapse or expand this branch.' : undefined}
      accessibilityActions={row.hasKids ? [{ name: 'activate' }, { name: 'longpress', label: row.hidden ? 'Expand branch' : 'Collapse branch' }] : undefined}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && onToggle(row.key)}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: largeText ? 'column' : 'row', alignItems: largeText ? 'stretch' : 'center', minHeight: h,
        backgroundColor: pressed || hovered ? p.sel : bg, borderBottomWidth: dense ? 0 : 1, borderColor: p.line2, opacity: dim ? 0.32 : 1,
      })}>
      <View style={{ width: largeText ? undefined : nameWidth, minHeight: largeText ? 44 : h, paddingLeft: 10 + row.depth * INDENT, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: dense ? 6 : 7 }}>
        <Connectors row={row} color={p.ink3} />
        {row.hasKids ? (
          <Pressable onPress={() => onToggle(row.key)} hitSlop={10} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 12, alignItems: 'center' }}>
            <View style={{ transform: [{ rotate: row.hidden ? '-90deg' : '0deg' }] }}>
              <Icon name="chevronDown" color={p.ink3} size={12} strokeWidth={2.4} />
            </View>
          </Pressable>
        ) : (
          <View style={{ width: 12 }} />
        )}
        <View style={{ width: dense ? 5 : 6, height: dense ? 16 : 26, borderRadius: 3, backgroundColor: c }} />
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <T variant="row" weight={isNarrator || row.id === selected ? '700' : dense ? '500' : '600'} tone={I.status === 'lost' ? 'ink2' : 'ink'} style={{ fontSize: dense ? 13 : 15 }} numberOfLines={1}>
              {row.id}
            </T>
            {tag && !lineage ? <Tag text={tag} /> : null}
            {/* Dense rows (iPad, web) have room for one line: the location follows the name. */}
            {dense && sub ? <T variant="secondary" tone="ink3" style={{ fontSize: 11, flexShrink: 1 }} numberOfLines={1}>{sub}</T> : null}
          </View>
          {!dense && sub ? <T variant="secondary" tone="ink3" style={{ fontSize: 12, lineHeight: 15 }} numberOfLines={1}>{sub}</T> : null}
        </View>
      </View>
      {track}
    </Pressable>
  );
});

/** A batch of siblings made together, folded into one row in "In this chapter". Tap to open or fold it. */
export const GroupRow = memo(function GroupRow({ row, nameWidth, dense, largeText, lineage, onToggle }: {
  row: Extract<TreeRow, { kind: 'group' }>;
  nameWidth: number;
  dense: boolean;
  largeText: boolean;
  lineage: Set<string> | null;
  onToggle: (key: string) => void;
}) {
  const { palette: p, colourOf } = useApp();
  const h = dense ? 28 : 48;
  const title = `${row.ids.length} copies`;
  const names = row.ids.join(', ');
  const dim = !!lineage && !row.ids.some((id) => lineage.has(id));
  return (
    <Pressable
      onPress={() => onToggle(row.key)}
      accessibilityRole="button"
      accessibilityState={{ expanded: row.expanded }}
      accessibilityLabel={`${row.ids.length} copies of ${row.parent} made in ${Math.floor(row.year)}: ${names}.`}
      accessibilityHint={row.expanded ? 'Folds them into one row.' : 'Shows each of them.'}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: largeText ? 'column' : 'row', alignItems: largeText ? 'stretch' : 'center', minHeight: h,
        backgroundColor: pressed || hovered ? p.sel : p.tintInk, borderBottomWidth: dense ? 0 : 1, borderColor: p.line2, opacity: dim ? 0.32 : 1,
      })}>
      <View style={{ width: largeText ? undefined : nameWidth, minHeight: largeText ? 44 : h, paddingLeft: 10 + row.depth * INDENT, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: dense ? 6 : 7 }}>
        <Connectors row={row} color={p.ink3} />
        <View style={{ width: 12, alignItems: 'center', transform: [{ rotate: row.expanded ? '0deg' : '-90deg' }] }}>
          <Icon name="chevronDown" color={p.ink3} size={12} strokeWidth={2.4} />
        </View>
        <View style={{ flexDirection: 'row', gap: 1.5 }}>
          {row.ids.slice(0, 5).map((id) => <View key={id} style={{ width: 3, height: dense ? 16 : 26, borderRadius: 1.5, backgroundColor: colourOf(id) }} />)}
        </View>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <T variant="row" weight="600" style={{ fontSize: dense ? 13 : 15 }} numberOfLines={1}>{title}</T>
          {!dense ? <T variant="secondary" tone="ink3" style={{ fontSize: 12, lineHeight: 15 }} numberOfLines={1}>{row.expanded ? 'Tap to fold' : `of ${row.parent} · ${Math.floor(row.year)}`}</T> : null}
        </View>
      </View>
      <View style={{ flex: largeText ? undefined : 1, paddingRight: 16, paddingLeft: largeText ? 16 : 0, paddingBottom: largeText ? 8 : 0 }}>
        <T variant="secondary" tone="ink2" style={{ fontSize: dense ? 12 : 13 }} numberOfLines={dense ? 1 : 2}>{names}</T>
      </View>
    </Pressable>
  );
});
