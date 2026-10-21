// Data-file checks, ported from the web version's validateTree(). Errors show as a maintainer notice in About.
import type { Reveal, TreeData } from './types';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const CONFIDENCE = ['high', 'medium', 'low'];
const NETWORKS = ['pgf', 'bob', 'other'];

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
    if (s.network != null && !NETWORKS.includes(s.network)) err(`${label}: network must be "pgf", "bob" or "other".`);
    if (s.reveal != null) checkReveal(s.reveal, label);
    checkProv(s, label);
  });
  // Chapter settings and cast (all optional): known systems and people, and nobody in a chapter before he is met.
  const bobIds = new Set(data.bobs.map((b) => b.id));
  const otherIds = new Map((data.others ?? []).map((o) => [o.id, o]));
  const VIA = ['vr', 'android', 'comms'];
  const isSystem = (id: string) => systemIds.has(id) || !(data.systems?.length);
  data.books.forEach((b) => b.chapters?.forEach((c) => {
    const label = `Book ${b.id} ch ${c.n}`;
    for (const k of ['system', 'narratorFrom'] as const) {
      const v = c[k];
      if (v != null && (typeof v !== 'string' || !isSystem(v))) err(`${label}: ${k} "${v}" is not a known system.`);
    }
    if (c.narratorFrom != null && c.narratorFrom === c.system) warn(`${label}: narratorFrom is the chapter's own system (leave it null).`);
    if (c.narratorVia != null && !VIA.includes(c.narratorVia)) err(`${label}: narratorVia must be "vr", "android" or "comms".`);
    if (c.cast == null) return;
    if (!Array.isArray(c.cast)) return err(`${label}: "cast" must be an array.`);
    const here = rk({ book: b.id, chapter: c.n });
    c.cast.forEach((m, i) => {
      const who = `${label} cast #${i + 1} (${m?.id})`;
      if (!m?.id) return err(`${label} cast #${i + 1}: needs "id".`);
      const rec = byId.get(m.id) ?? otherIds.get(m.id);
      if (!rec) err(`${who}: not a known Bob or other.`);
      else if (exists(rec.reveal) && rk(rec.reveal) > here) warn(`${who}: in the chapter before he is revealed.`);
      if (m.from != null && (typeof m.from !== 'string' || !isSystem(m.from))) err(`${who}: from "${m.from}" is not a known system.`);
      if (m.via != null && m.via !== 'present' && !VIA.includes(m.via)) err(`${who}: via must be "present", "vr", "android" or "comms".`);
      if (bobIds.has(m.id) && m.id === (data.settings?.povAliases?.[c.pov ?? ''] ?? c.pov)) warn(`${who}: the narrator is listed in his own cast.`);
    });
  }));
  for (const s of data.systems ?? []) if (s.kind === 'near' && s.near && !systemIds.has(s.near)) err(`System "${s.id}": near "${s.near}" is not a known system.`);
  const range = data.settings?.scutRange;
  for (const r of Array.isArray(range) ? range : range ? [range] : []) {
    if (typeof r?.ly !== 'number' || !(r.ly > 0)) err('settings.scutRange: ly must be a positive number.');
    if (!r?.reveal || typeof r.reveal.book !== 'number' || typeof r.reveal.chapter !== 'number') err('settings.scutRange: needs a reveal (book, chapter).');
  }
  for (const s of data.systems ?? []) {
    if (s.alias != null && (typeof s.alias !== 'object' || !systemIds.has(s.alias.of))) err(`System "${s.id}": alias.of must name a known system.`);
    if (s.guess != null) {
      if (typeof s.guess !== 'object') err(`System "${s.id}": guess must be an object.`);
      else {
        if (!s.pos && s.kind !== 'near') err(`System "${s.id}": a guess needs "pos" (or a place it is near).`);
        const r = s.guess.distSolLy95;
        if (r != null && !(Array.isArray(r) && r.length === 2 && r.every((n) => typeof n === 'number' && Number.isFinite(n)) && r[0] <= r[1])) err(`System "${s.id}": guess.distSolLy95 must be [low, high].`);
      }
    }
  }
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
  const groupById = new Map<string, NonNullable<TreeData['groups']>[number]>();
  (data.groups ?? []).forEach((g, i) => {
    const label = `Group #${i + 1} (${g.id})`;
    if (!g.id || !g.label) return err(`Group #${i + 1}: needs "id" and "label".`);
    if (groupById.has(g.id)) err(`Duplicate group "${g.id}".`);
    groupById.set(g.id, g);
    if (typeof g.human !== 'boolean') err(`${label}: "human" must be true or false.`);
    if (g.short != null && (typeof g.short !== 'string' || !g.short)) err(`${label}: "short" must be a non-empty string.`);
    checkReveal(g.reveal, label);
    checkProv(g, label);
  });
  (data.presence ?? []).forEach((p, i) => {
    const label = `Presence #${i + 1} (${p.group} at ${p.system})`;
    const g = groupById.get(p.group);
    if (!g) err(`${label}: unknown group "${p.group}".`);
    if (!systemIds.has(p.system)) err(`${label}: unknown system "${p.system}".`);
    if (!['home', 'colony', 'outpost', 'territory'].includes(p.kind)) err(`${label}: kind must be "home", "colony", "outpost" or "territory".`);
    const ok = checkReveal(p.reveal, label);
    checkProv(p, label);
    if (g && ok && exists(g.reveal) && rk(p.reveal) < rk(g.reveal)) err(`${label}: revealed before the group itself.`);
    if (p.ended && checkReveal(p.ended.reveal, `${label} ended`) && ok && rk(p.ended.reveal) < rk(p.reveal)) err(`${label}: ends before it is revealed.`);
  });
  // Wormhole links: known ends, and never revealed before a place it joins (an end with its own reveal).
  const sysById = new Map((data.systems ?? []).map((s) => [s.id, s]));
  (data.wormholes ?? []).forEach((w, i) => {
    const label = `Wormhole #${i + 1} (${w.a} – ${w.b})`;
    if (!NETWORKS.includes(w.network)) err(`${label}: network must be "pgf", "bob" or "other".`);
    if (w.a === w.b) err(`${label}: joins a system to itself.`);
    const ok = checkReveal(w.reveal, label);
    checkProv(w, label);
    if (w.built != null && typeof w.built !== 'number') err(`${label}: "built" must be a year or null.`);
    for (const end of [w.a, w.b]) {
      const s = sysById.get(end);
      if (!s) err(`${label}: unknown system "${end}".`);
      else if (ok && s.reveal && exists(s.reveal) && rk(w.reveal) < rk(s.reveal)) err(`${label}: revealed before "${end}".`);
    }
    if (w.through != null && !Array.isArray(w.through)) err(`${label}: "through" must be a list.`);
    for (const [j, th] of (Array.isArray(w.through) ? w.through : []).entries()) {
      const tl = `${label} through #${j + 1} (${th?.id})`;
      const s = th?.id ? sysById.get(th.id) : undefined;
      if (!s) err(`${tl}: unknown system.`);
      if (!checkReveal(th?.reveal, tl)) continue;
      if (ok && rk(th.reveal) < rk(w.reveal)) err(`${tl}: revealed before the link.`);
      if (s?.reveal && exists(s.reveal) && rk(th.reveal) < rk(s.reveal)) err(`${tl}: revealed before the system itself.`);
      if (th.id === w.a || th.id === w.b) err(`${tl}: is an end of the link.`);
    }
  });
  return { errors, warnings };
}
