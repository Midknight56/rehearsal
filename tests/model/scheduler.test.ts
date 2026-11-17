import { describe, expect, it } from 'vitest';
import { runSchedule, type ScheduleOutput } from '../../src/simulation/scheduler';
import { row1Schedule, row2Schedule, row3Schedule } from './fixtures/rows';

function startsOf(out: ScheduleOutput): number[] {
  return out.attendees.map((a) => a.visits[0]?.serviceStartMs ?? -1);
}
function exitsOf(out: ScheduleOutput): (number | null)[] {
  return out.attendees.map((a) => a.exitMs);
}
function waitsOf(out: ScheduleOutput): number[] {
  return out.attendees.map((a) => (a.visits[0]?.serviceStartMs ?? 0) - (a.visits[0]?.queueJoinMs ?? 0));
}

describe('row 1: one server, 60 s service, arrivals at 0, 30 s, 60 s', () => {
  it('starts, exits, waits and join positions', () => {
    const out = runSchedule(row1Schedule);
    expect(startsOf(out)).toEqual([0, 60_000, 120_000]);
    expect(exitsOf(out)).toEqual([60_000, 120_000, 180_000]);
    expect(waitsOf(out)).toEqual([0, 30_000, 60_000]);
    const joins = out.events.filter((e) => e.kind === 'join');
    expect(joins.map((e) => (e.kind === 'join' ? e.position : -1))).toEqual([0, 0, 1]);
    expect(joins.map((e) => e.timeMs)).toEqual([0, 30_000, 60_000]);
    expect(out.completion).toBe('complete');
  });
});

describe('row 2: row 1 with two servers', () => {
  it('starts 0, 30,000, 60,000; exits 60,000, 90,000, 120,000; no waiting', () => {
    const out = runSchedule(row2Schedule);
    expect(startsOf(out)).toEqual([0, 30_000, 60_000]);
    expect(exitsOf(out)).toEqual([60_000, 90_000, 120_000]);
    expect(waitsOf(out)).toEqual([0, 0, 0]);
  });
});

describe('row 3: equal-time ties by attendee id', () => {
  it('serves a#0000, a#0001, c#0000 at 0, 10,000, 20,000', () => {
    const out = runSchedule(row3Schedule);
    const order = out.events.filter((e) => e.kind === 'start').map((e) => ('attendeeId' in e ? e.attendeeId : ''));
    expect(order).toEqual(['a#0000', 'a#0001', 'c#0000']);
    expect(out.events.filter((e) => e.kind === 'start').map((e) => e.timeMs)).toEqual([0, 10_000, 20_000]);
  });
});