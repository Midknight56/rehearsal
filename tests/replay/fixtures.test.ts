import { describe, expect, it } from 'vitest';
import { loadTraceFixture } from './generators';

describe('replay fixtures', () => {
  it('three-people.json has 3 attendees, 21 events, 6 segments and paths 0 and 3', () => {
    const { trace } = loadTraceFixture('three-people');
    expect(trace.attendees).toHaveLength(3);
    expect(trace.events).toHaveLength(21);
    expect(trace.segments).toHaveLength(6);
    expect(trace.paths.map((p) => p.id)).toEqual([0, 3]);
  });

  it('three-people.json segments last as long as the paths they name', () => {
    const { trace } = loadTraceFixture('three-people');
    const byId = new Map(trace.paths.map((p) => [p.id, p]));
    for (const s of trace.segments) expect(s.endMs - s.startMs).toBe(byId.get(s.pathId)?.durationMs);
    expect(byId.get(0)).toMatchObject({ distanceM: 2, durationMs: 2000 });
    expect(byId.get(3)).toMatchObject({ distanceM: 2.5, durationMs: 2500 });
  });

  it('unfinished.json holds one attendee with no exit, a cap event and the drain-capped completion', () => {
    const fixture = loadTraceFixture('unfinished');
    expect(fixture.completion).toBe('drain-capped');
    expect(fixture.unfinished).toEqual(['a#0000']);
    expect(fixture.trace.attendees).toEqual([{ id: 'a#0000', cohortId: 'a', arrivalMs: 0, exitMs: null }]);
    expect(fixture.trace.events.map((e) => e.kind)).toEqual(['arrive', 'depart', 'join', 'start', 'cap']);
  });
});
