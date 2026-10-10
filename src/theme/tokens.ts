// Design tokens: colour, type, space, icons, motion.
// Rule: colour means narrator. Everything else is ink (black in light mode, white in dark) and differs by shape.
import { Platform } from 'react-native';

export interface Palette {
  scheme: 'light' | 'dark';
  bg: string;
  surf: string;
  surf2: string;
  line: string;
  line2: string;
  ink: string;
  ink2: string;
  ink3: string;
  /** Text on an ink fill. */
  inv: string;
  /** 5% ink: rows of Bobs in the narrator's system. */
  tintInk: string;
  /** Selected row background. */
  sel: string;
  scrim: string;
  glass: string;
  glassEdge: string;
  /** Text on an identity-colour fill (narrator chip, monogram). */
  onIdentity: string;
}

export const light: Palette = {
  scheme: 'light',
  bg: '#F3F4F6',
  surf: '#FFFFFF',
  surf2: '#EBEDF0',
  line: '#D8DCE2',
  line2: '#E6E9ED',
  ink: '#11151B',
  ink2: '#475060',
  ink3: '#616A78',
  inv: '#FFFFFF',
  tintInk: 'rgba(17,21,27,0.05)',
  sel: 'rgba(17,21,27,0.07)',
  scrim: 'rgba(17,21,27,0.4)',
  glass: 'rgba(255,255,255,0.74)',
  glassEdge: 'rgba(255,255,255,0.9)',
  onIdentity: '#FFFFFF',
};

export const dark: Palette = {
  scheme: 'dark',
  bg: '#0C0F13',
  surf: '#151920',
  surf2: '#1D222A',
  line: '#2B313B',
  line2: '#222730',
  ink: '#E9ECF1',
  ink2: '#AAB2BF',
  ink3: '#8B94A2',
  inv: '#0C0F13',
  tintInk: 'rgba(233,236,241,0.07)',
  sel: 'rgba(233,236,241,0.10)',
  scrim: 'rgba(0,0,0,0.6)',
  glass: 'rgba(32,38,47,0.72)',
  glassEdge: 'rgba(255,255,255,0.10)',
  onIdentity: '#0C0F13',
};

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, x3: 32, x4: 48 } as const;
export const radius = { tag: 4, chip: 10, card: 14, dock: 28, sheet: 28 } as const;

/** Touch row heights. Dense rows are for pointer-driven layouts (iPad with trackpad, web). */
export const rows = { touch: 48, dense: 28, min: 44 } as const;

export const fonts = {
  sans: Platform.select({ web: "'Instrument Sans', system-ui, -apple-system, sans-serif", default: undefined }),
  mono: Platform.select({ ios: 'ui-monospace', android: 'monospace', web: "'IBM Plex Mono', ui-monospace, monospace" }),
};

/** Breakpoints in points. Compact matches iPhone and iPad one-third/one-half Split View. */
export const breakpoints = { regular: 700, inspector: 1000, rail: 1280 } as const;
