import { describe, expect, it } from 'vitest';
import { createPool } from '../../src/replay/pool';
import { buildIndex } from '../../src/replay/traceIndex';
import { sampleAt, visibleSet } from '../../src/replay/sampler';
import { cap1200 } from './generators';

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
