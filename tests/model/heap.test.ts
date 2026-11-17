import { describe, expect, it } from 'vitest';
import { EventHeap, KIND_PRIORITY, type EventKind, type SimEvent } from '../../src/simulation/heap';
import { createGenerator } from '../../src/simulation/random';

const KINDS: EventKind[] = ['service-complete', 'movement-arrival', 'external-arrival'];
const IDS = ['a', 'b', 'c', 'd', 'e'];

function compareExpected(a: SimEvent, b: SimEvent): number {
  const priority = (kind: EventKind) => ({ 'service-complete': 0, 'movement-arrival': 1, 'external-arrival': 2 })[kind];
  if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
  if (priority(a.kind) !== priority(b.kind)) return priority(a.kind) - priority(b.kind);
  if (a.attendeeId !== b.attendeeId) return a.attendeeId < b.attendeeId ? -1 : 1;
  return a.sequence - b.sequence;
}

describe('row 4.1: event heap order', () => {
  it('pops 1,000 events in (timeMs, kind priority, attendeeId, sequence) order', () => {
    const draw = createGenerator('heap-test');
    const heap = new EventHeap();
    for (let i = 0; i < 1_000; i += 1) {
      heap.push({
        timeMs: Math.floor(draw() * 10),
        kind: KINDS[Math.floor(draw() * 3)] as EventKind,
        attendeeId: IDS[Math.floor(draw() * 5)] as string,
      });
    }
    expect(heap.size()).toBe(1_000);
    const popped: SimEvent[] = [];
    for (let expectedSize = 999; expectedSize >= 0; expectedSize -= 1) {
      popped.push(heap.pop() as SimEvent);
      expect(heap.size()).toBe(expectedSize);
    }
    for (let i = 1; i < popped.length; i += 1) {
      expect(compareExpected(popped[i - 1] as SimEvent, popped[i] as SimEvent)).toBeLessThan(0);
    }
    expect(new Set(popped.map((event) => event.sequence)).size).toBe(1_000);
  });

  it('pop and peek on an empty heap are undefined', () => {
    const heap = new EventHeap();
    expect(heap.pop()).toBeUndefined();
    expect(heap.peek()).toBeUndefined();
    expect(heap.size()).toBe(0);
  });

  it('gives completion 0, movement arrival 1, external arrival 2', () => {
    expect([KIND_PRIORITY['service-complete'], KIND_PRIORITY['movement-arrival'], KIND_PRIORITY['external-arrival']]).toEqual([0, 1, 2]);
  });
});