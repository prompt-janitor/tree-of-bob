// Screen areas the system reserves over the app (iOS 27.1 reserved regions), such as the iPhone Duo's status
// indicator. Native on iOS only; elsewhere, and in Expo Go, the module is absent and the safe area applies.
import { requireOptionalNativeModule } from 'expo';

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

const Native = requireOptionalNativeModule<{ occlusions(): Promise<Region[] | null> }>('ReservedRegions');

/** Occlusion regions in window points (margins included), or null when the system can't say. */
export async function occlusions(): Promise<Region[] | null> {
  if (!Native) return null;
  try {
    return await Native.occlusions();
  } catch {
    return null;
  }
}
