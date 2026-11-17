import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkProperty } from '../ui/property';
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

describe('P11 clock bounds (requirements 6.2 and 6.3)', () => {
  type Op = { op: 'advance'; by: number } | { op: 'seek'; to: number } | { op: 'step'; by: 1000 | -1000 } | { op: 'speed'; to: 1 | 4 | 16 } | { op: 'play' };
  const ops = fc.array(
    fc.oneof(
      fc.record({ op: fc.constant('advance' as const), by: fc.double({ min: 0, max: 100_000, noNaN: true }) }),
      fc.record({ op: fc.constant('seek' as const), to: fc.double({ min: -50_000, max: 50_000, noNaN: true }) }),
      fc.record({ op: fc.constant('step' as const), by: fc.constantFrom(1000 as const, -1000 as const) }),
      fc.record({ op: fc.constant('speed' as const), to: fc.constantFrom(1 as const, 4 as const, 16 as const) }),
      fc.constant<Op>({ op: 'play' }),
    ),
    { maxLength: 60 },
  );

  it('ms stays in [0, endMs], moves while paused only by seek or step, and playing is false at endMs', async () => {
    await checkProperty('P11 clock bounds', fc.tuple(fc.integer({ min: 0, max: 60_000 }), ops), ([endMs, sequence]) => {
      let c = clock({ endMs, playing: false });
      for (const step_ of sequence) {
        const before = c;
        if (step_.op === 'advance') c = advance(c, step_.by);
        else if (step_.op === 'seek') c = seek(c, step_.to);
        else if (step_.op === 'step') c = step(c, step_.by);
        else if (step_.op === 'speed') c = setSpeed(c, step_.to);
        else c = { ...c, playing: c.ms < c.endMs };
        expect(c.ms).toBeGreaterThanOrEqual(0);
        expect(c.ms).toBeLessThanOrEqual(endMs);
        if (!before.playing && (step_.op === 'advance' || step_.op === 'speed')) expect(c.ms).toBe(before.ms);
        if (c.ms === endMs) expect(c.playing).toBe(false);
      }
    });
  });
});