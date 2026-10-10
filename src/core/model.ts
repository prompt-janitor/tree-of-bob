// Static indexes built once from the data file. Nothing here depends on reading progress.
import type { BobRecord, Book, Chapter, Reveal, TreeData } from './types';

export interface ChapterRef {
  /** Position in reading order, 0-based across all books. */
  index: number;
  book: Book;
  chapter: Chapter;
}

export interface Model {
  data: TreeData;
  root: string;
  recentYears: number;
  chapters: ChapterRef[];
  bobById: Map<string, BobRecord>;
  /** Reading-order rank of each narrator's first chapter. */
  povFirst: Map<string, number>;
  /** Identity colour slot per narrator, in order of first narration. Root is always slot 0. */
  slotOf: Map<string, number>;
  /** Highest chapter year read up to each chapter index (the "NOW" date). */
  latestYearAt: (number | null)[];
  /** Every star system named anywhere in the data, longest first (for matching chapter places). */
  systems: string[];
}

/** Rank of a reveal point in reading order. Missing reveal points sort after everything. */
export function rank(r: Reveal | null | undefined): number {
  return r ? r.book * 10000 + r.chapter : Number.POSITIVE_INFINITY;
}

export function buildModel(data: TreeData): Model {
  const settings = data.settings ?? {};
  const root = settings.root ?? 'Bob';
  const aliases = settings.povAliases ?? {};
  const bobById = new Map(data.bobs.map((b) => [b.id, b]));

  const chapters: ChapterRef[] = [];
  for (const book of data.books) for (const chapter of book.chapters) chapters.push({ index: chapters.length, book, chapter });

  const latestYearAt: (number | null)[] = [];
  let run: number | null = null;
  for (const c of chapters) {
    if (typeof c.chapter.year === 'number') run = run == null ? c.chapter.year : Math.max(run, c.chapter.year);
    latestYearAt.push(run);
  }

  const povFirst = new Map<string, number>();
  for (const c of chapters) {
    const id = povBobId(c.chapter, aliases, bobById);
    if (id && !povFirst.has(id)) povFirst.set(id, rank({ book: c.book.id, chapter: c.chapter.n }));
  }
  const narrators = [...povFirst.keys()].sort((a, b) => povFirst.get(a)! - povFirst.get(b)!);
  const order = narrators.includes(root) ? narrators.filter((n) => n !== root) : narrators;
  const slotOf = new Map<string, number>([[root, 0]]);
  order.forEach((n, i) => slotOf.set(n, i + 1));

  const sys = new Set<string>();
  for (const b of data.bobs) if (b.where) sys.add(b.where);
  for (const m of data.moves) {
    if (m.from) sys.add(m.from);
    if (m.to) sys.add(m.to);
  }
  const systems = [...sys].sort((a, b) => b.length - a.length);

  return {
    data,
    root,
    recentYears: typeof settings.recentYears === 'number' ? settings.recentYears : 40,
    chapters,
    bobById,
    povFirst,
    slotOf,
    latestYearAt,
    systems,
  };
}

function povBobId(ch: Chapter, aliases: Record<string, string>, bobById: Map<string, BobRecord>): string | null {
  if (!ch.pov) return null;
  const id = aliases[ch.pov] ?? ch.pov;
  return bobById.has(id) ? id : null;
}

/** The Bob who narrates a chapter, or null when the narrator is not a Bob or not given. */
export function narratorOf(model: Model, ch: Chapter): string | null {
  return povBobId(ch, model.data.settings?.povAliases ?? {}, model.bobById);
}

export function chapterIndex(model: Model, book: number, chapter: number): number {
  return model.chapters.findIndex((c) => c.book.id === book && c.chapter.n === chapter);
}

export function chapterAt(model: Model, r: Reveal): ChapterRef | undefined {
  const i = chapterIndex(model, r.book, r.chapter);
  return i >= 0 ? model.chapters[i] : undefined;
}

/** Story year of the chapter where a record is revealed; used when the record itself has no year. */
export function revealYear(model: Model, r: Reveal | null | undefined): number | null {
  if (!r) return null;
  const c = chapterAt(model, r);
  return c && typeof c.chapter.year === 'number' ? c.chapter.year : null;
}

/** The star system named in a chapter's place string, e.g. "Vulcan, Omicron² Eridani" → "Omicron² Eridani". */
/**
 * How a chapter heading places its narrator. "Approaching X" is a way into a chapter set at X, so it counts as being
 * there; "En route to X" is a voyage towards X; "Interstellar Space" is a voyage with no destination given.
 */
export type Setting = { kind: 'system' | 'approach' | 'enroute'; system: string } | { kind: 'deep'; system: null };

export function headingSetting(model: Model, place: string | null | undefined): Setting | null {
  if (!place) return null;
  const p = place.trim();
  if (/interstellar space/i.test(p)) return { kind: 'deep', system: null };
  const approach = p.match(/^(?:approaching|arriving at|arriving in)\s+(.+)$/i);
  if (approach) {
    const system = systemIn(model, approach[1]);
    return system ? { kind: 'approach', system } : null;
  }
  const enroute = p.match(/^(?:en|on) route to\s+(.+)$/i);
  if (enroute) {
    const system = systemIn(model, enroute[1]);
    return system ? { kind: 'enroute', system } : { kind: 'deep', system: null };
  }
  const system = systemIn(model, p);
  return system ? { kind: 'system', system } : null;
}

export function systemIn(model: Model, place: string | null | undefined): string | null {
  if (!place) return null;
  const p = place.toLowerCase();
  return model.systems.find((s) => p.includes(s.toLowerCase())) ?? null;
}
