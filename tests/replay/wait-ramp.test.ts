import { describe, expect, it } from 'vitest';
import { sampleAt } from '../../src/replay/sampler';
import { buildIndex } from '../../src/replay/traceIndex';
import { WAIT_RAMP, longestWaitMs, waitColour, waitedMsAt } from '../../src/replay/waitRamp';
import { loadTraceFixture, makeTrace } from './generators';

const three = () => {
  const f = loadTraceFixture('three-people');
  return buildIndex(f.trace, f.stations);
};
const channels = (c: number): number[] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

describe('the wait ramp', () => {
  it('runs sage, straw, pumpkin, ember and is continuous in between', () => {
    expect(WAIT_RAMP).toEqual([0x9fd8b4, 0xf2d377, 0xff9a3d, 0xff7f61]);
    expect(waitColour(0, 1000)).toBe(0x9fd8b4);
    expect(waitColour(1000, 1000)).toBe(0xff7f61);
    expect(waitColour(1000 / 3, 1000)).toBe(0xf2d377);
    expect(waitColour((2 * 1000) / 3, 1000)).toBe(0xff9a3d);
    const half = channels(waitColour(1000 / 6, 1000));
    channels(0x9fd8b4).forEach((c, i) => expect(Math.abs((half[i] as number) - (c + (channels(0xf2d377)[i] as number)) / 2)).toBeLessThanOrEqual(1));
  });

  it('clamps below 0 and above the longest wait, and a run with no waiting stays sage', () => {
    expect(waitColour(-5, 1000)).toBe(0x9fd8b4);
    expect(waitColour(5000, 1000)).toBe(0xff7f61);
    expect(waitColour(0, 0)).toBe(0x9fd8b4);
    expect(waitColour(10, 0)).toBe(0x9fd8b4);
  });

  it('never gets colder as the wait grows', () => {
    const warmth = (c: number): number => channels(c)[0]! - channels(c)[2]! * 0.1;
    let last = -Infinity;
    for (let w = 0; w <= 1000; w += 50) {
      const next = warmth(waitColour(w, 1000));
      expect(next).toBeGreaterThanOrEqual(last - 1);
      last = next;
    }
  });
});

describe('time waited so far in the current visit, read from the trace', () => {
  it('a#0001 joins at 3,000 ms and starts service at 5,000 ms', () => {
    const index = three();
    expect(waitedMsAt(index, 'a#0001', 2500)).toBe(0);
    expect(waitedMsAt(index, 'a#0001', 3000)).toBe(0);
    expect(waitedMsAt(index, 'a#0001', 4000)).toBe(1000);
    expect(waitedMsAt(index, 'a#0001', 4999)).toBe(1999);
    expect(waitedMsAt(index, 'a#0001', 5500)).toBe(2000);
    expect(waitedMsAt(index, 'a#0001', 9000)).toBe(0);
    expect(waitedMsAt(index, 'nobody', 4000)).toBe(0);
  });

  it('agrees with the sampler: a waiting attendee has waited the time since the join', () => {
    const made = makeTrace({ attendees: 40, stations: 2, seed: 11 });
    const index = buildIndex(made.trace, made.stations);
    for (const t of [5000, 15_000, 30_000]) {
      for (const a of sampleAt(index, t).attendees) {
        const waited = waitedMsAt(index, a.id, t);
        if (a.phase === 'waiting') expect(waited).toBeGreaterThanOrEqual(0);
        if (a.phase === 'not-arrived' || a.phase === 'exited') expect(waited).toBe(0);
      }
    }
  });

  it('the longest wait of the run is the largest wait recorded in the trace', () => {
    const made = makeTrace({ attendees: 40, stations: 2, seed: 11 });
    const index = buildIndex(made.trace, made.stations);
    const recorded = Math.max(...made.trace.events.flatMap((e) => (e.kind === 'start' ? [e.waitMs] : [])));
    expect(longestWaitMs(index)).toBe(recorded);
    const f = loadTraceFixture('three-people');
    expect(longestWaitMs(three())).toBe(Math.max(...f.trace.events.flatMap((e) => (e.kind === 'start' ? [e.waitMs] : []))));
  });

  it('does not change the trace', () => {
    const f = loadTraceFixture('three-people');
    const before = JSON.stringify(f.trace);
    const index = buildIndex(f.trace, f.stations);
    waitedMsAt(index, 'a#0001', 4000);
    longestWaitMs(index);
    expect(JSON.stringify(f.trace)).toBe(before);
  });
});