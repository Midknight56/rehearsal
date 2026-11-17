import type { GameViewDebug, GameViewHandle, Hit } from '../../src/replay/gameView';
import type { Sample } from '../../src/replay/sampler';

export type FakeCall = { method: string; args: unknown[] };

export type FakeGameView = GameViewHandle & {
  calls: FakeCall[];
  /** Calls of one method, in order. */
  callsOf(method: string): unknown[][];
  /** Test controls: fire the callbacks the panel registered. */
  emitClock(ms: number, playing: boolean): void;
  emitHit(hit: Hit): void;
  emitFollowEnd(id: string, exitedAtMs: number): void;
  setSample(sample: Sample): void;
};

const EMPTY: Sample = { tMs: 0, attendees: [], perStation: {}, arrived: 0, exited: 0 };

/** A GameViewHandle that records every call and returns the sample the test sets. It draws nothing. */
export function createFakeGameView(): FakeGameView {
  const calls: FakeCall[] = [];
  const clockListeners = new Set<(ms: number, playing: boolean) => void>();
  const hitListeners = new Set<(hit: Hit) => void>();
  const followEndListeners = new Set<(id: string, exitedAtMs: number) => void>();
  let sample = EMPTY;
  let destroyed = false;
  const record = (method: string, ...args: unknown[]): void => {
    calls.push({ method, args });
  };
  const debug: GameViewDebug = {
    tickerRunning: false, resolution: 1, clockMs: 0, playing: false, speed: 1, follow: null, spritesDrawn: 0,
    spritesPooled: 1000, aggregatedAttendees: 0, ghostLoaded: false, framesLast2s: 0, rendererStatus: 'ready',
  };
  return {
    calls,
    callsOf: (method) => calls.filter((c) => c.method === method).map((c) => c.args),
    load: (input) => record('load', input),
    play: () => record('play'),
    pause: () => record('pause'),
    setSpeed: (s) => record('setSpeed', s),
    step: (d) => record('step', d),
    seek: (ms) => record('seek', ms),
    follow: (id) => record('follow', id),
    select: (t) => record('select', t),
    setGhost: (t) => record('setGhost', t),
    onHit: (cb) => {
      hitListeners.add(cb);
      return () => hitListeners.delete(cb);
    },
    onClock: (cb) => {
      clockListeners.add(cb);
      return () => clockListeners.delete(cb);
    },
    onFollowEnd: (cb) => {
      followEndListeners.add(cb);
      return () => followEndListeners.delete(cb);
    },
    sampleNow: () => sample,
    debug: () => {
      if (destroyed) throw new Error('Game view destroyed');
      return debug;
    },
    destroy: () => {
      destroyed = true;
      record('destroy');
    },
    emitClock: (ms, playing) => clockListeners.forEach((cb) => cb(ms, playing)),
    emitHit: (hit) => hitListeners.forEach((cb) => cb(hit)),
    emitFollowEnd: (id, at) => followEndListeners.forEach((cb) => cb(id, at)),
    setSample: (s) => {
      sample = s;
    },
  };
}
