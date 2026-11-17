// Reduced motion (requirement 9.4): the system setting, unless the Motion toggle says otherwise.
import type { Prefs } from '../../storage/prefs';

export function systemPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** `Reduce` always reduces, `Allow` never does, `System` follows prefers-reduced-motion. */
export function isReducedMotion(prefs: Prefs): boolean {
  if (prefs.motion === 'reduce') return true;
  if (prefs.motion === 'allow') return false;
  return systemPrefersReducedMotion();
}