// Event log: births, travel, SCUT and fates in story order, each tagged with its reveal chapter.
import { rank, revealYear } from './model';
import { fateStatus, type ProgressView } from './view';
import type { Reveal } from './types';
import { whenShort } from './format';

export type EventKind = 'birth' | 'travel' | 'scut' | 'fate' | 'milestone';
export type LogScope = 'chapter' | 'book' | 'all';

export interface LogEvent {
  key: string;
  kind: EventKind;
  year: number | null;
  /** Short text for the "when" line, e.g. "c. Apr 2171". */
  when: string | null;
  /** Show the Bob's name before the text (false when the text already names him). */
  lead: boolean;
  bob: string | null;
  text: string;
  reveal: Reveal;
  isCurrent: boolean;
}

export function buildLog(view: ProgressView): LogEvent[] {
  const m = view.model;
  const P = view.P;
  const y = (e: { year: number | null; reveal: Reveal }) => (typeof e.year === 'number' ? e.year : revealYear(m, e.reveal));
  const out: LogEvent[] = [];
  for (const id of view.ids) {
    const I = view.info.get(id)!;
    const b = I.bob;
    const parent = b.parent && view.info.has(b.parent) ? b.parent : null;
    const madeBy = I.madeBy;
    const parts = [`is created${b.where ? ` at ${b.where}` : ''}`];
    if (parent) parts.push(`copied from ${parent}`);
    if (madeBy && madeBy !== parent) parts.push(`made by ${madeBy}`);
    out.push({ key: `b:${id}`, kind: 'birth', year: I.born, when: whenShort(b.when), lead: true, bob: id, text: parts.join(', '), reveal: b.reveal, isCurrent: rank(b.reveal) === P });
  }
  view.moves.forEach((mv, i) => {
    const text = mv.kind === 'depart' ? `leaves ${mv.from ?? 'for'}${mv.from ? ' for ' : ' '}${mv.to ?? 'an unknown destination'}` : `arrives at ${mv.to ?? 'an unknown system'}${mv.at ? ` (${mv.at})` : ''}`;
    out.push({ key: `m:${i}`, kind: 'travel', year: y(mv), when: null, lead: true, bob: mv.bob, text, reveal: mv.reveal, isCurrent: rank(mv.reveal) === P });
  });
  view.fates.forEach((f, i) => {
    const s = fateStatus(f);
    const lead = s === 'lost' ? 'is lost' : s === 'missing' ? 'goes missing' : 'is back';
    out.push({ key: `f:${i}`, kind: 'fate', year: y(f), when: null, lead: true, bob: f.bob, text: f.text ? `${lead}: ${lowerFirst(f.text)}` : lead, reveal: f.reveal, isCurrent: rank(f.reveal) === P });
  });
  view.scut.forEach((s, i) => {
    const named = !!s.text && s.how !== 'born' && s.text.includes(s.bob);
    const text = s.how === 'born' ? 'is created already on SCUT' : named ? s.text! : s.text ? `joins SCUT: ${lowerFirst(s.text)}` : 'joins SCUT';
    out.push({ key: `s:${i}`, kind: 'scut', year: y(s), when: null, lead: !named, bob: s.bob, text, reveal: s.reveal, isCurrent: rank(s.reveal) === P });
  });
  view.milestones.forEach((ms, i) => {
    out.push({ key: `x:${i}`, kind: 'milestone', year: y(ms), when: null, lead: false, bob: null, text: ms.text, reveal: ms.reveal, isCurrent: rank(ms.reveal) === P });
  });
  return out.sort((a, b) => (a.year ?? Number.POSITIVE_INFINITY) - (b.year ?? Number.POSITIVE_INFINITY) || rank(a.reveal) - rank(b.reveal));
}

export function scopeLog(events: LogEvent[], view: ProgressView, scope: LogScope, kinds: Set<EventKind>): LogEvent[] {
  return events.filter((e) => {
    if (!kinds.has(e.kind)) return false;
    if (scope === 'chapter') return e.isCurrent;
    if (scope === 'book') return e.reveal.book === view.progress.book;
    return true;
  });
}

/** Lower-case the first letter unless the first word is an acronym or a name (e.g. "SCUT", "Bill"). */
function lowerFirst(s: string) {
  if (!s) return s;
  const word = s.split(/\s/)[0];
  if (word.length > 1 && word === word.toUpperCase()) return s;
  return s[0].toLowerCase() + s.slice(1);
}
