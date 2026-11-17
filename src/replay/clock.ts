// Replay clock, display state only (requirements 6.2 and 6.3). Nothing here advances model state: the ticker passes the
// elapsed real time, the clock adds it multiplied by the speed, and the sampler reads the trace at that time. This file
// imports nothing from the engine folders (invariant I6).

export type ClockState = { ms: number; playing: boolean; speed: 1 | 4 | 16; endMs: number };

const clamp = (ms: number, endMs: number): number => Math.min(endMs, Math.max(0, ms));

/** A clock at the end of the trace is paused, whatever moved it there. */
function settle(c: ClockState): ClockState {
  return c.playing && c.ms >= c.endMs ? { ...c, playing: false } : c;
}

/** ms + delta * speed while playing, clamped to [0, endMs]; pauses at endMs. */
export function advance(c: ClockState, deltaRealMs: number): ClockState {
  if (!c.playing) return c;
  return settle({ ...c, ms: clamp(c.ms + deltaRealMs * c.speed, c.endMs) });
}

export function seek(c: ClockState, ms: number): ClockState {
  return settle({ ...c, ms: clamp(Number.isFinite(ms) ? ms : 0, c.endMs) });
}

/** Exactly 1,000 ms either way, clamped; the playing state is kept while the clock stays inside the range. */
export function step(c: ClockState, delta: 1000 | -1000): ClockState {
  return settle({ ...c, ms: clamp(c.ms + delta, c.endMs) });
}

export function setSpeed(c: ClockState, speed: 1 | 4 | 16): ClockState {
  return { ...c, speed };
}
