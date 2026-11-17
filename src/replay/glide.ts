// The glide of a ghost between cells: when the place a ghost should be drawn at jumps (a queue moves up, a guest steps
// to a service slot, a Step button moves the clock a second), it slides there in a straight line at constant speed instead of
// jumping. Display only: the target is always what sampleAt returned for the replay clock, and the glide ends exactly on it.

type State = { at: [number, number]; from: [number, number]; startMs: number; durationMs: number; active: boolean };
export type GlideOptions = { durationMs: number; snap: boolean };

/** A move longer than this many cells is a jump and glides; a walker's frame to frame change is far smaller. */
export const GLIDE_THRESHOLD_CELLS = 0.75;

export type Glide = {
  /** The position to draw `id` at, given where it should be at `nowMs`. */
  at(id: string, target: [number, number], nowMs: number, options: GlideOptions): [number, number];
  /** True while at least one glide has not reached its target. */
  active(nowMs: number): boolean;
  clear(): void;
};

export function createGlide(): Glide {
  const states = new Map<string, State>();
  return {
    at(id, target, nowMs, { durationMs, snap }) {
      const s = states.get(id);
      if (s === undefined || snap || durationMs <= 0) {
        states.set(id, { at: [target[0], target[1]], from: [target[0], target[1]], startMs: nowMs, durationMs: 0, active: false });
        return [target[0], target[1]];
      }
      if (!s.active && Math.hypot(target[0] - s.at[0], target[1] - s.at[1]) > GLIDE_THRESHOLD_CELLS) {
        s.active = true;
        s.from = [s.at[0], s.at[1]];
        s.startMs = nowMs;
        s.durationMs = durationMs;
      }
      if (s.active) {
        const p = (nowMs - s.startMs) / s.durationMs;
        if (p >= 1) {
          s.active = false;
          s.at = [target[0], target[1]];
        } else {
          const t = Math.max(0, p);
          s.at = [s.from[0] + (target[0] - s.from[0]) * t, s.from[1] + (target[1] - s.from[1]) * t];
        }
      } else {
        s.at = [target[0], target[1]];
      }
      return [s.at[0], s.at[1]];
    },
    active(nowMs) {
      for (const s of states.values()) if (s.active && nowMs < s.startMs + s.durationMs) return true;
      return false;
    },
    clear() {
      states.clear();
    },
  };
}
