// The replay state without a renderer: the loaded trace index, the clock, the follow and selection state and the listeners.
// It is what stays alive when the canvas cannot start (requirement 6.8), so the scrubber, the step controls, the timeline and
// the queue inspector read the sampler through it. The clock is display state only: nothing here advances model state, and
// no file in this folder calls the simulation (invariant I6).
import type { Scenario } from '../domain/scenario';
import type { Trace } from '../simulation/trace';
import { advance, seek as seekClock, setSpeed as setClockSpeed, step as stepClock, type ClockState } from './clock';
import { sampleAt, type Sample } from './sampler';
import { buildIndex, type TraceIndex } from './traceIndex';

export type Hit = { kind: 'attendee'; id: string } | { kind: 'station'; id: string };
export type LoadInput = { trace: Trace; layout: Scenario['layout']; stations: Scenario['stations']; label: string; endMs?: number };

export const CLOCK_EMIT_INTERVAL_MS = 100;

export type ReplayCore = {
  load(input: LoadInput): void;
  play(): void;
  pause(): void;
  setSpeed(s: 1 | 4 | 16): void;
  step(delta: 1000 | -1000): void;
  seek(ms: number): void;
  follow(attendeeId: string | null): void;
  select(target: Hit | null): void;
  setGhost(trace: Trace | null): void;
  onHit(cb: (hit: Hit) => void): () => void;
  onClock(cb: (ms: number, playing: boolean) => void): () => void;
  onFollowEnd(cb: (id: string, exitedAtMs: number) => void): () => void;
  sampleNow(): Sample;
  /** Called by the ticker with the elapsed real time; throttles the clock listeners to one call per 100 ms. */
  tick(deltaRealMs: number, nowMs: number): void;
  emitHit(hit: Hit): void;
  /** Called after every change a renderer must redraw for (load, play, pause, seek, step, speed, follow, select, ghost). */
  onChange(cb: () => void): () => void;
  state(): {
    input: LoadInput | null;
    index: TraceIndex | null;
    ghost: TraceIndex | null;
    clock: ClockState;
    follow: string | null;
    selected: Hit | null;
  };
};

const EMPTY_SAMPLE: Sample = { tMs: 0, attendees: [], perStation: {}, arrived: 0, exited: 0 };

function listeners<A extends unknown[]>(): { add(cb: (...args: A) => void): () => void; call(...args: A): void } {
  const set = new Set<(...args: A) => void>();
  return {
    add(cb) {
      set.add(cb);
      return () => set.delete(cb);
    },
    call(...args) {
      for (const cb of [...set]) cb(...args);
    },
  };
}

/** `autoplay` is read at every load: false under reduced motion, and false when no ticker exists to advance the clock. */
export function createReplayCore(options: { autoplay: boolean }): ReplayCore {
  let input: LoadInput | null = null;
  let index: TraceIndex | null = null;
  let ghost: TraceIndex | null = null;
  let clock: ClockState = { ms: 0, playing: false, speed: 1, endMs: 0 };
  let following: string | null = null;
  let selected: Hit | null = null;
  let lastEmitAt = Number.NEGATIVE_INFINITY;
  const clockListeners = listeners<[number, boolean]>();
  const hitListeners = listeners<[Hit]>();
  const followEndListeners = listeners<[string, number]>();
  const changeListeners = listeners<[]>();

  const emitClock = (nowMs?: number): void => {
    if (nowMs !== undefined) lastEmitAt = nowMs;
    clockListeners.call(clock.ms, clock.playing);
  };

  /** Releases the follow when the followed attendee has exited at the clock time (7.2). */
  const checkFollowEnd = (): void => {
    if (following === null || index === null) return;
    const a = index.byId.get(following);
    const last = a?.events[a.events.length - 1];
    if (a !== undefined && last !== undefined && last.kind === 'exit' && last.timeMs <= clock.ms) {
      const id = following;
      following = null;
      followEndListeners.call(id, last.timeMs);
    }
  };

  const changed = (): void => {
    checkFollowEnd();
    changeListeners.call();
  };

  const core: ReplayCore = {
    load(next) {
      input = next;
      index = buildIndex(next.trace, next.stations);
      clock = { ms: 0, playing: options.autoplay, speed: clock.speed, endMs: next.endMs ?? index.endMs };
      if (clock.endMs <= 0) clock = { ...clock, playing: false };
      following = null;
      selected = null;
      emitClock();
      changeListeners.call();
    },
    play() {
      if (index === null) return;
      clock = clock.ms >= clock.endMs ? { ...seekClock(clock, 0), playing: true } : { ...clock, playing: true };
      emitClock();
      changed();
    },
    pause() {
      clock = { ...clock, playing: false };
      emitClock();
      changed();
    },
    setSpeed(speed) {
      clock = setClockSpeed(clock, speed);
      emitClock();
      changed();
    },
    step(delta) {
      clock = stepClock(clock, delta);
      emitClock();
      changed();
    },
    seek(ms) {
      clock = seekClock(clock, ms);
      emitClock();
      changed();
    },
    follow(id) {
      following = id !== null && index !== null && index.byId.has(id) ? id : null;
      changed();
    },
    select(target) {
      selected = target;
      changeListeners.call();
    },
    setGhost(trace) {
      ghost = trace === null || input === null ? null : buildIndex(trace, input.stations);
      changeListeners.call();
    },
    onHit: hitListeners.add,
    onClock: clockListeners.add,
    onFollowEnd: followEndListeners.add,
    sampleNow: () => (index === null ? EMPTY_SAMPLE : sampleAt(index, clock.ms)),
    tick(deltaRealMs, nowMs) {
      if (index === null) return;
      const before = clock;
      clock = advance(clock, deltaRealMs);
      checkFollowEnd();
      if (clock.playing !== before.playing || nowMs - lastEmitAt >= CLOCK_EMIT_INTERVAL_MS) emitClock(nowMs);
    },
    emitHit: (hit) => hitListeners.call(hit),
    onChange: changeListeners.add,
    state: () => ({ input, index, ghost, clock, follow: following, selected }),
  };
  return core;
}
