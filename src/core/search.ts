// Search over revealed things only: Bobs, systems with someone in them, other replicants.
import type { ProgressView } from './view';

export type SearchHit =
  | { kind: 'bob'; id: string; score: number }
  | { kind: 'system'; name: string; score: number }
  | { kind: 'other'; id: string; score: number };

function score(name: string, q: string): number {
  const n = name.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.split(/[\s-]+/).some((w) => w.startsWith(q))) return 2;
  if (n.includes(q)) return 3;
  return -1;
}

export function search(view: ProgressView, query: string, limit = 20): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const id of view.ids) {
    const s = score(id, q);
    if (s >= 0) hits.push({ kind: 'bob', id, score: s });
  }
  const systems = new Set<string>();
  for (const id of view.ids) {
    const I = view.info.get(id)!;
    if (I.loc) systems.add(I.loc);
    if (I.bob.where) systems.add(I.bob.where);
  }
  for (const name of systems) {
    const s = score(name, q);
    if (s >= 0) hits.push({ kind: 'system', name, score: s + 0.5 });
  }
  for (const o of view.others) {
    const s = score(o.id, q);
    if (s >= 0) hits.push({ kind: 'other', id: o.id, score: s + 0.7 });
  }
  return hits.sort((a, b) => a.score - b.score).slice(0, limit);
}
