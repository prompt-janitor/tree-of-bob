// Named places inside each star system (planets, moons, habitats), taken only from chapters the reader has read
// ("Vulcan, Omicron² Eridani") and from revealed moves ("arrives at … (Poseidon)"). In order of first mention.
import { systemIn } from './model';
import type { ProgressView } from './view';

/** "Delta Eridani 4 (Eden)" → "Eden"; "Valhalla (moon of Asgard)" → "Valhalla"; "Earth orbit, with …" → "Earth". */
function placeName(raw: string, system: string): string | null {
  const paren = raw.match(/\(([^)]*)\)/)?.[1]?.trim() ?? null;
  let base = raw.replace(/\s*\([^)]*\)/g, '').split(',')[0].trim();
  const planet = base.match(/^planet\s+(\S+)/i);
  if (planet) base = planet[1];
  else if (!/^\p{Lu}/u.test(base)) return null;
  if (base.toLowerCase().startsWith(system.toLowerCase())) {
    // The system's own name with a number or letter; keep the planet name given in brackets, if any.
    return paren && /^\p{Lu}[\p{L}'’ -]*$/u.test(paren) && paren.split(' ').length <= 3 ? paren : null;
  }
  base = base.replace(/\s+orbit$/i, '');
  return base && base.toLowerCase() !== system.toLowerCase() ? base : null;
}

export function placesBySystem(view: ProgressView): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (system: string | null | undefined, name: string | null) => {
    if (!system || !name) return;
    const list = out.get(system) ?? [];
    if (!list.some((n) => n.toLowerCase() === name.toLowerCase())) list.push(name);
    out.set(system, list);
  };
  const model = view.model;
  for (const ref of model.chapters.slice(0, view.index + 1)) {
    for (const part of (ref.chapter.place ?? '').split(' / ')) {
      const i = part.lastIndexOf(', ');
      if (i < 0) continue;
      const system = systemIn(model, part.slice(i + 2));
      if (system && part.slice(i + 2).trim().toLowerCase() === system.toLowerCase()) add(system, placeName(part.slice(0, i), system));
    }
  }
  for (const m of view.moves) {
    const system = m.kind === 'arrive' ? m.to : m.from;
    if (m.at && system) add(system, placeName(m.at, system));
  }
  return out;
}
