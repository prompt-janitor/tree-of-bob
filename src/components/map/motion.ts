// Timing of what moves on the Systems map, shared by the map's motion layer and the animated samples in the key.

/** One cycle of the motion layer, and how many cycles its phase runs before it starts again. */
export const MOTION_MS = 3000;
export const MOTION_CYCLES = 1000;
/** Calling in: a ripple moves one gap every 1/RIPPLES_PER_CYCLE of the cycle. */
export const RIPPLES_PER_CYCLE = 2;
/** Voyages: a glint every GLINT_GAP pt, GLINT_LEN long, moving one gap a cycle. */
export const GLINT_GAP = 72;
export const GLINT_LEN = 10;
/** A trunk-line flash: rises over this share of the cycle, gone by FLASH_LEN. */
export const FLASH_RISE = 0.04;
export const FLASH_LEN = 0.22;
/** The pulse reaches the next hop this share of the cycle later. */
export const HOP_DELAY = 0.05;

/** How bright a trunk line's flash is (0 to 1) at k, the share of the cycle since its pulse arrived. */
export function flashGlow(k: number): number {
  'worklet';
  return k < FLASH_RISE ? k / FLASH_RISE : k < FLASH_LEN ? (FLASH_LEN - k) / (FLASH_LEN - FLASH_RISE) : 0;
}
