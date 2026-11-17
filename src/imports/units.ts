// Display units to model units, converted once at the import boundary (units-and-determinism.md).
// Minutes become integer milliseconds here; service seconds stay seconds in the scenario (the validator converts them).
import type { Service } from '../domain/scenario';

export function minutesToMs(minutes: number): number {
  return Math.round(minutes * 60_000);
}

/** Equal min, mode and max collapse to a constant service. */
export function serviceFromSeconds(minS: number, modeS: number, maxS: number): Service {
  return minS === modeS && modeS === maxS ? { kind: 'constant', seconds: minS } : { kind: 'triangular', minS, modeS, maxS };
}
