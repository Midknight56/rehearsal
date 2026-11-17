import { describe, expect, it } from 'vitest';
import type { Scenario } from '../../src/domain/scenario';
import { runOnce } from './helpers/run';
import { baseline } from './fixtures/harbor-hall';
import { scenario } from './helpers/build-scenario';

describe('row 10: determinism (engine side)', () => {
  it('three runs of baseline replication 0 are byte-identical', async () => {
    const first = JSON.stringify(await runOnce(baseline, 0, true));
    const second = JSON.stringify(await runOnce(baseline, 0, true));
    const roundTripped = JSON.stringify(await runOnce(JSON.parse(JSON.stringify(baseline)) as Scenario, 0, true));
    expect(second).toBe(first);
    expect(roundTripped).toBe(first);
  });

  it('trace false gives identical metrics', async () => {
    const withTrace = await runOnce(baseline, 0, true);
    const withoutTrace = await runOnce(baseline, 0, false);
    expect(withoutTrace.trace).toBeUndefined();
    expect(JSON.stringify(withoutTrace.metrics)).toBe(JSON.stringify(withTrace.metrics));
  });
});

describe('task 11: trace shape', () => {
  it('every segment lasts as long as its path, and paths are the referenced ones in id order', async () => {
    const trace = (await runOnce(baseline, 0, true)).trace;
    expect(trace?.version).toBe(1);
    const paths = trace?.paths ?? [];
    for (const segment of trace?.segments ?? []) {
      expect(segment.endMs - segment.startMs).toBe(paths.find((path) => path.id === segment.pathId)?.durationMs);
    }
    const referenced = [...new Set((trace?.segments ?? []).map((segment) => segment.pathId))].sort((a, b) => a - b);
    expect(paths.map((path) => path.id)).toEqual(referenced);
  });

  it('attendees are sorted by (arrivalMs, id) and carry their exit time', async () => {
    const attendees = (await runOnce(baseline, 0, true)).trace?.attendees ?? [];
    expect(attendees).toHaveLength(120);
    for (let i = 1; i < attendees.length; i += 1) {
      const a = attendees[i - 1]!;
      const b = attendees[i]!;
      expect(a.arrivalMs < b.arrivalMs || (a.arrivalMs === b.arrivalMs && a.id < b.id)).toBe(true);
    }
    expect(attendees.every((attendee) => attendee.exitMs !== null)).toBe(true);
  });

  it('per attendee at most 3 + 4 * visits events and visits + 1 segments', async () => {
    const trace = (await runOnce(baseline, 0, true)).trace;
    const visits = 2;
    const events = new Map<string, number>();
    for (const event of trace?.events ?? []) {
      if ('attendeeId' in event) events.set(event.attendeeId, (events.get(event.attendeeId) ?? 0) + 1);
    }
    const segments = new Map<string, number>();
    for (const segment of trace?.segments ?? []) segments.set(segment.attendeeId, (segments.get(segment.attendeeId) ?? 0) + 1);
    for (const attendee of trace?.attendees ?? []) {
      expect(events.get(attendee.id)).toBeLessThanOrEqual(3 + 4 * visits);
      expect(segments.get(attendee.id)).toBeLessThanOrEqual(visits + 1);
    }
  });

  it('the cap event appears only past the 7,260 s boundary', async () => {
    const one = (seconds: number) => scenario({
      horizonMs: 60_000,
      stations: [{ id: 's', label: 'Station', cell: [0, 0], servers: 1, service: { kind: 'constant', seconds } }],
      cohorts: [{ id: 'x', startMs: 0, endMs: 1, count: 1, arrivals: 'even', route: ['s'] }],
    });
    const exact = (await runOnce(one(7_260), 0, true)).trace?.events ?? [];
    expect(exact.some((event) => event.kind === 'cap')).toBe(false);
    expect(exact[exact.length - 1]).toMatchObject({ kind: 'exit', timeMs: 7_260_000 });
    const late = (await runOnce(one(7_260.001), 0, true)).trace?.events ?? [];
    expect(late[late.length - 1]).toMatchObject({ kind: 'cap', timeMs: 7_260_000 });
  });
});
