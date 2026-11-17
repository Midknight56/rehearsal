import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { badgeLines } from '../../src/replay/badges';
import { queueColour, queueSlot } from '../../src/replay/queueLine';
import { checkProperty } from '../ui/property';
import { createPool } from '../../src/replay/pool';
import { buildIndex } from '../../src/replay/traceIndex';
import { sampleAt, visibleSet } from '../../src/replay/sampler';
import { cap1200, makeTrace } from './generators';

describe('visibleSet (requirement 6.4)', () => {
  it('with 1,200 attendees arrived and none exited draws the 1,000 lexically smallest and aggregates 200', () => {
    const made = cap1200();
    const sample = sampleAt(buildIndex(made.trace, made.stations), 30_000);
    expect(sample.arrived).toBe(1200);
    const { drawn, aggregated } = visibleSet(sample, 1000);
    expect(drawn).toHaveLength(1000);
    expect(drawn.map((a) => a.id)).toEqual(Array.from({ length: 1000 }, (_, i) => `a#${String(i).padStart(4, '0')}`));
    const hidden = aggregated.reduce((n, g) => n + g.waiting + g.inService + g.walking, 0);
    expect(hidden).toBe(200);
    expect(aggregated.every((g) => g.stationId === 'st0' || g.stationId === 'entrance')).toBe(true);
  });

  it('with 500 on screen per layer (ghost loaded) draws 500', () => {
    const made = cap1200();
    const sample = sampleAt(buildIndex(made.trace, made.stations), 30_000);
    expect(visibleSet(sample, 500).drawn).toHaveLength(500);
  });
});

describe('sprite pool (invariant I7)', () => {
  it('allocates every slot up front and never allocates again', () => {
    let made = 0;
    const pool = createPool(1000, () => ({ id: (made += 1) }));
    expect(made).toBe(1000);
    expect(pool.allocated).toBe(1000);
    const ids = Array.from({ length: 1000 }, (_, i) => `a#${i}`);
    expect(pool.sync(ids).size).toBe(1000);
    expect(pool.used).toBe(1000);
    pool.sync(ids.slice(500).concat(Array.from({ length: 500 }, (_, i) => `b#${i}`)));
    expect(made).toBe(1000);
    expect(pool.used).toBe(1000);
  });

  it('keeps the slot of an id that stays and frees the slots of ids that leave', () => {
    const pool = createPool(4, () => ({}));
    const first = pool.sync(['a', 'b', 'c']);
    const second = pool.sync(['b', 'd']);
    expect(second.get('b')).toBe(first.get('b'));
    expect(pool.used).toBe(2);
    pool.releaseAll();
    expect(pool.used).toBe(0);
    expect(pool.allocated).toBe(4);
  });
});

describe('P10 sprite cap (requirement 6.4)', () => {
  it('draws min(present, cap) of the lexically smallest ids and counts every other attendee in exactly one aggregate', async () => {
    const inputs = fc.record({ attendees: fc.integer({ min: 1, max: 60 }), stations: fc.integer({ min: 1, max: 3 }), seed: fc.integer({ min: 0, max: 1_000_000 }), at: fc.double({ min: 0, max: 1, noNaN: true }), cap: fc.integer({ min: 1, max: 40 }) });
    await checkProperty('P10 sprite cap', inputs, ({ attendees, stations, seed, at, cap }) => {
      const made = makeTrace({ attendees, stations, seed });
      const sample = sampleAt(buildIndex(made.trace, made.stations), Math.floor(at * made.endMs));
      const present = sample.arrived - sample.exited;
      const { drawn, aggregated } = visibleSet(sample, cap);
      expect(drawn).toHaveLength(Math.min(present, cap));
      const ids = sample.attendees.filter((a) => a.phase === 'walking' || a.phase === 'waiting' || a.phase === 'in-service').map((a) => a.id).sort();
      expect(drawn.map((a) => a.id)).toEqual(ids.slice(0, cap));
      expect(drawn.length + aggregated.reduce((n, g) => n + g.waiting + g.inService + g.walking, 0)).toBe(present);
    });
  });
});

describe('queue lines and badges (requirements 6.4 and 6.6)', () => {
  it('slots run east of the station in join order and wrap after ten', () => {
    expect(queueSlot([4, 1], 0)).toEqual([5, 1]);
    expect(queueSlot([4, 1], 1)[0]).toBeGreaterThan(5);
    expect(queueSlot([4, 1], 10)[0]).toBe(5);
    expect(queueSlot([4, 1], 10)[1]).toBeGreaterThan(1);
  });

  it('the colour changes with the waiting count and stops at saturation', () => {
    expect(queueColour(0)).not.toBe(queueColour(10));
    expect(queueColour(10)).not.toBe(queueColour(20));
    expect(queueColour(20)).toBe(queueColour(500));
  });

  it('writes +<n> waiting, +<n> in service and +<n> walking, and nothing for a zero count', () => {
    expect(badgeLines([{ stationId: 'st0', waiting: 199, inService: 1, walking: 0 }, { stationId: 'entrance', waiting: 0, inService: 0, walking: 4 }, { stationId: 'st1', waiting: 0, inService: 0, walking: 0 }])).toEqual([
      { stationId: 'st0', lines: ['+199 waiting', '+1 in service'] },
      { stationId: 'entrance', lines: ['+4 walking'] },
    ]);
  });
});