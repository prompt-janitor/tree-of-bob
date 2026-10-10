// Data-file checks, ported from the web version's validateTree(). Errors show as a maintainer notice in About.
import type { Reveal, TreeData } from './types';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const CONFIDENCE = ['high', 'medium', 'low'];

export function validateData(data: TreeData): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);
  const warn = (m: string) => warnings.push(m);
  for (const k of ['books', 'bobs', 'moves', 'fates'] as const) if (!Array.isArray(data[k])) err(`"${k}" must be an array.`);
  if (errors.length) return { errors, warnings };

  const chapterCount = new Map<number, number>();
  data.books.forEach((b, i) => {
    if (b.id !== i + 1) err(`Book ${b.id} is out of order: books must be numbered 1, 2, 3… in reading order.`);
    if (!b.chapters?.length) return err(`Book ${b.id} has no chapters.`);
    chapterCount.set(b.id, b.chapters.length);
    b.chapters.forEach((c, j) => {
      if (c.n !== j + 1) err(`Book ${b.id}: chapters out of order at position ${j + 1} (n=${c.n}).`);
      if (c.year != null && typeof c.year !== 'number') err(`Book ${b.id} ch ${c.n}: "year" must be a number or null.`);
      // Chapter titles are book text: the app shows the chapter number, narrator, date and place instead.
      if ('title' in c) err(`Book ${b.id} ch ${c.n}: chapters must not carry a "title".`);
    });
  });
  const exists = (r: Reveal | null | undefined) =>
    !!r && chapterCount.has(r.book) && Number.isInteger(r.chapter) && r.chapter >= 1 && r.chapter <= chapterCount.get(r.book)!;
  const rk = (r: Reveal) => r.book * 10000 + r.chapter;
  const checkReveal = (r: Reveal | null | undefined, label: string) => {
    if (!r) return err(`${label}: missing "reveal".`), false;
    if (!exists(r)) return err(`${label}: reveal ${JSON.stringify(r)} points at a chapter that does not exist.`), false;
    return true;
  };
  const checkProv = (rec: { confidence?: string; sources?: string[] }, label: string) => {
    if (!Array.isArray(rec.sources) || !rec.sources.length) err(`${label}: missing "sources".`);
    if (!CONFIDENCE.includes(rec.confidence ?? '')) warn(`${label}: confidence should be high, medium or low.`);
  };

  const byId = new Map<string, (typeof data.bobs)[number]>();
  for (const b of data.bobs) {
    const label = `Bob "${b.id}"`;
    if (!b.id) { err('A Bob has no "id".'); continue; }
    if (byId.has(b.id)) err(`Duplicate id "${b.id}".`);
    byId.set(b.id, b);
    checkReveal(b.reveal, label);
    checkProv(b, label);
    if (b.madeBy?.reveal) checkReveal(b.madeBy.reveal, `${label} madeBy`);
    b.alt?.forEach((a, i) => a.reveal && checkReveal(a.reveal, `${label} alt #${i + 1}`));
  }
  for (const b of data.bobs) {
    const label = `Bob "${b.id}"`;
    if (b.madeBy?.id && !byId.has(b.madeBy.id)) err(`${label}: madeBy "${b.madeBy.id}" is not a known Bob id.`);
    if (b.parent == null) continue;
    const p = byId.get(b.parent);
    if (!p) { err(`${label}: parent "${b.parent}" is not a known Bob id.`); continue; }
    if (exists(b.reveal) && exists(p.reveal) && rk(b.reveal) < rk(p.reveal)) err(`${label} is revealed before his parent "${p.id}".`);
    const seen = new Set<string>();
    let cur: typeof b | undefined = b;
    while (cur && cur.parent != null) {
      if (seen.has(cur.id)) { err(`${label}: parent chain loops back on itself.`); break; }
      seen.add(cur.id);
      cur = byId.get(cur.parent);
    }
  }
  const root = data.settings?.root ?? 'Bob';
  if (!byId.has(root)) err(`settings.root is "${root}", but there is no Bob with that id.`);

  const otherById = new Map((data.others ?? []).map((o) => [o.id, o]));
  const checkEvent = (e: { bob: string; reveal: Reveal; year: number | null; confidence?: string; sources?: string[] }, label: string, othersAllowed = false) => {
    const b = byId.get(e.bob);
    const o = othersAllowed && !b ? otherById.get(e.bob) : undefined;
    if (!b && !o) err(`${label}: unknown ${othersAllowed ? 'Bob or other' : 'Bob'} "${e.bob}".`);
    if (o && exists(e.reveal) && exists(o.reveal) && rk(e.reveal) < rk(o.reveal)) err(`${label}: revealed before ${o.id} himself.`);
    const ok = checkReveal(e.reveal, label);
    checkProv(e, label);
    if (b && ok && exists(b.reveal) && rk(e.reveal) < rk(b.reveal)) err(`${label}: revealed before ${b.id} himself.`);
  };
  data.moves.forEach((m, i) => {
    checkEvent(m, `Move #${i + 1} (${m.bob})`, true);
    if (m.kind !== 'depart' && m.kind !== 'arrive') err(`Move #${i + 1}: kind must be "depart" or "arrive".`);
    if (m.kind === 'arrive' && !m.to) err(`Move #${i + 1}: an arrival needs "to".`);
    if (m.via != null && !['voyage', 'wormhole', 'transmitted'].includes(m.via)) err(`Move #${i + 1}: via must be "voyage", "wormhole" or "transmitted".`);
  });
  const systemIds = new Set<string>();
  (data.systems ?? []).forEach((s, i) => {
    const label = `System #${i + 1} (${s.id})`;
    if (!s.id) return err(`System #${i + 1} has no "id".`);
    if (systemIds.has(s.id)) err(`Duplicate system "${s.id}".`);
    systemIds.add(s.id);
    if (!['star', 'far', 'near', 'direction', 'network', 'fictional'].includes(s.kind)) err(`${label}: unknown kind "${s.kind}".`);
    if ((s.kind === 'star' || s.kind === 'far') && !s.pos) err(`${label}: a ${s.kind} needs "pos".`);
    if (s.pos && ![s.pos.x, s.pos.y, s.pos.z].every((n) => typeof n === 'number' && Number.isFinite(n))) err(`${label}: pos needs numeric x, y, z.`);
    if (s.kind === 'near' && !s.near) err(`${label}: kind "near" needs "near".`);
    checkProv(s, label);
  });
  for (const s of data.systems ?? []) if (s.kind === 'near' && s.near && !systemIds.has(s.near)) err(`System "${s.id}": near "${s.near}" is not a known system.`);
  if (data.systems?.length) {
    const named = new Set<string>();
    for (const b of data.bobs) if (b.where) named.add(b.where);
    for (const m of data.moves) for (const p of [m.from, m.to]) if (p) named.add(p);
    for (const n of named) if (!systemIds.has(n)) warn(`"${n}" is used as a place but has no entry in "systems" (not on the map).`);
  }
  (data.stars ?? []).forEach((s, i) => {
    if (!s.id || ![s.x, s.y, s.z].every((n) => typeof n === 'number' && Number.isFinite(n))) err(`Star #${i + 1}: needs id and numeric x, y, z.`);
  });
  data.fates.forEach((f, i) => checkEvent(f, `Fate #${i + 1} (${f.bob})`, true));
  (data.scut ?? []).forEach((s, i) => checkEvent(s, `SCUT #${i + 1} (${s.bob})`));
  (data.milestones ?? []).forEach((m, i) => checkReveal(m.reveal, `Milestone #${i + 1}`));
  (data.others ?? []).forEach((o) => checkReveal(o.reveal, `Other "${o.id}"`));
  return { errors, warnings };
}
