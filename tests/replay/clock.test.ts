import { describe, expect, it } from 'vitest';
import { advance, seek, setSpeed, step, type ClockState } from '../../src/replay/clock';

const clock = (over: Partial<ClockState> = {}): ClockState => ({ ms: 0, playing: true, speed: 1, endMs: 10_000, ...over });

describe('advance (requirements 6.2 and 6.3)', () => {
  it.each([[1, 100], [4, 400], [16, 1600]] as const)('at %d× adds delta × speed (%d ms for 100 real ms)', (speed, expected) => {
    expect(advance(clock({ speed }), 100).ms).toBe(expected);
  });

  it('does not move while paused', () => {
    expect(advance(clock({ playing: false, ms: 500 }), 1000).ms).toBe(500);
  });

  it('clamps at endMs and pauses there', () => {
    const c = advance(clock({ ms: 9_900, speed: 16 }), 1000);
    expect(c.ms).toBe(10_000);
    expect(c.playing).toBe(false);
  });
});

describe('seek, step and setSpeed', () => {
  it('seek clamps to [0, endMs]', () => {
    expect(seek(clock(), -5).ms).toBe(0);
    expect(seek(clock(), 99_999).ms).toBe(10_000);
    expect(seek(clock(), 4321).ms).toBe(4321);
  });

  it('step moves exactly 1,000 ms either way, clamped, and keeps the playing state while inside the range', () => {
    expect(step(clock({ ms: 3000, playing: false }), 1000)).toMatchObject({ ms: 4000, playing: false });
    expect(step(clock({ ms: 3000 }), -1000)).toMatchObject({ ms: 2000, playing: true });
    expect(step(clock({ ms: 500 }), -1000).ms).toBe(0);
    expect(step(clock({ ms: 9_500 }), 1000).ms).toBe(10_000);
  });

  it('setSpeed changes the speed and nothing else', () => {
    expect(setSpeed(clock({ ms: 1234 }), 16)).toEqual(clock({ ms: 1234, speed: 16 }));
  });
});
