import { describe, expect, it } from 'vitest';
import type { Layout } from '../../src/domain/scenario';
import { findPath, pathDistanceM, walkDurationMs } from '../../src/spatial/grid';
import { createPathCache } from '../../src/spatial/path-cache';
import type { NodeRef } from '../../src/simulation/heap';
import { baseline, shorterRoute } from './fixtures/harbor-hall';

const layout3x3 = (blockedCells: [number, number][]): Layout => ({
  cols: 3, rows: 3, cellSizeM: 0.5, blockedCells, entrance: [0, 0], exit: [2, 2],
});

describe('row 4: breadth-first paths with a fixed neighbour order', () => {
  it('walks straight across an open grid', () => {
    const cells = findPath(layout3x3([]), [0, 1], [2, 1]);
    expect(cells).toEqual([[0, 1], [1, 1], [2, 1]]);
    expect(pathDistanceM(cells ?? [], 0.5)).toBe(1);
    expect(walkDurationMs(1, 1)).toBe(1_000);
  });

  it('goes around a blocked cell the same way on every call (north first)', () => {
    const blocked = layout3x3([[1, 1]]);
    const expected = [[0, 1], [0, 0], [1, 0], [2, 0], [2, 1]];
    const first = findPath(blocked, [0, 1], [2, 1]);
    expect(first).toEqual(expected);
    expect(pathDistanceM(first ?? [], 0.5)).toBe(2);
    expect(walkDurationMs(2, 1)).toBe(2_000);
    expect(findPath(blocked, [0, 1], [2, 1])).toEqual(first);
  });

  it('returns [start] for a path from a cell to itself, null when unreachable', () => {
    expect(findPath(layout3x3([]), [1, 1], [1, 1])).toEqual([[1, 1]]);
    expect(findPath(layout3x3([[1, 0], [1, 1], [1, 2]]), [0, 0], [2, 0])).toBeNull();
  });
});

const entrance: NodeRef = { kind: 'entrance' };
const exit: NodeRef = { kind: 'exit' };
const station = (id: string): NodeRef => ({ kind: 'station', id });

describe('row 5.4: Harbor Hall walking values (hand-calculated)', () => {
  it('baseline: 4,167 / 10,000 / 17,500 ms and 38 m', () => {
    const cache = createPathCache(baseline);
    const legs = [cache.lookup(entrance, station('checkin')), cache.lookup(station('checkin'), station('packs')), cache.lookup(station('packs'), exit)];
    expect(legs.map((leg) => leg.durationMs)).toEqual([4_167, 10_000, 17_500]);
    expect(legs.reduce((sum, leg) => sum + leg.distanceM, 0)).toBe(38);
  });

  it('shorter route: 4,167 / 3,334 / 7,500 ms and 18 m, and a different cache key', () => {
    const cache = createPathCache(shorterRoute);
    const legs = [cache.lookup(entrance, station('checkin')), cache.lookup(station('checkin'), station('packs')), cache.lookup(station('packs'), exit)];
    expect(legs.map((leg) => leg.durationMs)).toEqual([4_167, 3_334, 7_500]);
    expect(legs.reduce((sum, leg) => sum + leg.distanceM, 0)).toBe(18);
    expect(cache.key).not.toBe(createPathCache(baseline).key);
  });
});