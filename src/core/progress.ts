// Reading position: the chapter the reader is about to read. Stepping past a book's end continues into the next
// book; stepping past the last chapter of the series sets `finished`, which reveals that chapter too.
import { chapterIndex, type Model } from './model';
import type { Progress } from './view';

export function defaultProgress(model: Model): Progress {
  const s = model.data.settings ?? {};
  const p = { book: s.defaultBook ?? model.chapters[0].book.id, chapter: s.defaultChapter ?? model.chapters[0].chapter.n };
  return clampProgress(model, p);
}

export function clampProgress(model: Model, p: Partial<Progress> | null | undefined): Progress {
  if (p && typeof p.book === 'number' && typeof p.chapter === 'number') {
    const i = chapterIndex(model, p.book, p.chapter);
    if (i >= 0) return p.finished && i === model.chapters.length - 1 ? { book: p.book, chapter: p.chapter, finished: true } : { book: p.book, chapter: p.chapter };
  }
  const first = model.chapters[0];
  return { book: first.book.id, chapter: first.chapter.n };
}

/** Position in reading order: 0 = about to read the first chapter, chapters.length = finished the series. */
export function positionOf(model: Model, p: Progress): number {
  const i = Math.max(0, chapterIndex(model, p.book, p.chapter));
  return p.finished && i === model.chapters.length - 1 ? i + 1 : i;
}

function atPosition(model: Model, pos: number): Progress {
  const n = model.chapters.length;
  const c = model.chapters[Math.min(pos, n - 1)];
  return pos >= n ? { book: c.book.id, chapter: c.chapter.n, finished: true } : { book: c.book.id, chapter: c.chapter.n };
}

export function stepProgress(model: Model, p: Progress, delta: number): Progress {
  return atPosition(model, Math.min(model.chapters.length, Math.max(0, positionOf(model, p) + delta)));
}

/** Number of chapters between two positions in reading order (positive = forward). */
export function distance(model: Model, from: Progress, to: Progress): number {
  return positionOf(model, to) - positionOf(model, from);
}

export function isFirst(model: Model, p: Progress) {
  return positionOf(model, p) <= 0;
}

export function isLast(model: Model, p: Progress) {
  return positionOf(model, p) >= model.chapters.length;
}
