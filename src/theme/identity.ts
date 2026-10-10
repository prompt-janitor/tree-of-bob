// Identity palette: 26 narrator slots, each with a light-mode and dark-mode value (all ≥ 3:1 on their surface).
// Slots are handed out in order of each narrator's first chapter (see core/model.ts slotOf). Slots 1–13 step five
// places round a 13-hue OKLCH wheel; slots 14–26 reuse the hues at a deeper lightness and always appear with a
// monogram. Beyond 26 narrators, slots wrap with a golden-angle fallback.

export const IDENTITY: readonly [light: string, dark: string][] = [
  ['#1f7dcf', '#7ac3ff'], ['#c35044', '#ff9c8e'], ['#009567', '#5ad8ac'], ['#905fc0', '#d2a8ff'],
  ['#a46f00', '#e5b650'], ['#008bb9', '#44d0fa'], ['#be4d75', '#ff99b9'], ['#458e2f', '#91d280'],
  ['#676ed1', '#aab5ff'], ['#ba5d00', '#fda767'], ['#009495', '#2ad7d7'], ['#ad54a0', '#f09de1'],
  ['#7e8100', '#c1c65c'], ['#2c5a9d', '#77a0dc'], ['#913d26', '#d48872'], ['#006f57', '#50b39b'],
  ['#72438a', '#b58ccb'], ['#735700', '#b59c51'], ['#006591', '#55aad1'], ['#91394d', '#d48492'],
  ['#1e6c2f', '#73b07a'], ['#564e9a', '#9995da'], ['#884900', '#ca9159'], ['#006d78', '#40b1b9'],
  ['#863c6e', '#c985b1'], ['#536300', '#97a85e'],
];

export function identityColour(slot: number, scheme: 'light' | 'dark'): string {
  const entry = IDENTITY[slot];
  if (entry) return entry[scheme === 'dark' ? 1 : 0];
  const hue = Math.round((slot * 137.508 + 20) % 360);
  return scheme === 'dark' ? `hsl(${hue} 72% 70%)` : `hsl(${hue} 60% 38%)`;
}

/** Adds alpha to a #rrggbb colour. Used for the 14% narrator row tint. */
export function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + a;
}
