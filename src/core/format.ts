// Small formatting helpers for years, chapter codes and labels.
import type { Book, Chapter, Reveal } from './types';
import { chapterAt, type Model } from './model';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2171.54 → "2171". Null → "?". */
export function yearText(y: number | null | undefined): string {
  return y == null ? '?' : String(Math.floor(y));
}

/** 2171.54 → "Jul 2171". */
export function monthYear(y: number | null | undefined): string {
  if (y == null) return 'date not given';
  const m = Math.min(11, Math.max(0, Math.floor((y - Math.floor(y)) * 12)));
  return `${MONTHS[m]} ${Math.floor(y)}`;
}

/** "B2·7" style tag for a reveal point. */
export function revealTag(r: Reveal): string {
  return `B${r.book}·${r.chapter}`;
}

/** Chapter label for display, honouring Book 4's part numbering ("Part 2 · Ch 7"). */
export function chapterLabel(ch: Chapter): string {
  return ch.label ?? `Ch ${ch.n}`;
}

/** Chapter label for screen readers: "Chapter 34", or "Part 2, Chapter 7" in Book 4. */
export function chapterSpoken(ch: Chapter): string {
  return chapterLabel(ch).replace(/ · /g, ', ').replace(/\bCh (\d+)/, 'Chapter $1');
}

/** One-line spoken summary of a chapter heading: "Book 2, Chapter 34, narrated by Bill". */
export function chapterHeadingSpoken(book: Book, ch: Chapter): string {
  return [`Book ${book.id}`, chapterSpoken(ch), ch.pov ? `narrated by ${ch.pov}` : null].filter(Boolean).join(', ');
}

/** The chapter's date as shown in headings: the data's date text, else the month and year, else null. */
export function chapterDate(ch: Chapter): string | null {
  return ch.date ?? (ch.year != null ? monthYear(ch.year) : null);
}

export function chapterCode(book: Book, ch: Chapter): string {
  return `B${book.id} · ${chapterLabel(ch).toUpperCase()}`;
}

export function revealLong(model: Model, r: Reveal): string {
  const c = chapterAt(model, r);
  return c ? `Book ${r.book} · ${chapterLabel(c.chapter)}` : `Book ${r.book} · Ch ${r.chapter}`;
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The data's "when" field can carry research notes in brackets; keep the date part for display. */
export function whenShort(when: string | null | undefined): string | null {
  if (!when) return null;
  const short = when.replace(/\s*\(.*$/, '').trim();
  return short || null;
}

/** True when a "when" string marks the date as estimated or approximate. */
export function whenEstimated(when: string | null | undefined): boolean {
  return !!when && /\b(est|c\.|approx|unknown|not given)/i.test(when);
}

/** Rough length of a span of story time: "~12 years", "~5 months"; null under a month. */
export function durationText(years: number): string | null {
  if (!(years >= 1 / 12 - 0.001)) return null;
  if (years < 1) {
    const m = Math.round(years * 12);
    return `~${m} ${m === 1 ? 'month' : 'months'}`;
  }
  const y = Math.round(years);
  return `~${y} ${y === 1 ? 'year' : 'years'}`;
}
