// Replay clock, display state only (task 10.1). Task 1 writes the type and the signatures.

export type ClockState = { ms: number; playing: boolean; speed: 1 | 4 | 16; endMs: number };

export function advance(_c: ClockState, _deltaRealMs: number): ClockState {
  throw new Error('not implemented: advance');
}

export function seek(_c: ClockState, _ms: number): ClockState {
  throw new Error('not implemented: seek');
}

export function step(_c: ClockState, _delta: 1000 | -1000): ClockState {
  throw new Error('not implemented: step');
}

export function setSpeed(_c: ClockState, _speed: 1 | 4 | 16): ClockState {
  throw new Error('not implemented: setSpeed');
}
