// Per-attendee index of a trace (requirements 6.2, 6.3, 7.4). This is the only file that reads the raw Trace fields; the
// sampler and the timeline work on the index. Building it never mutates the trace.
import type { Cell, Scenario } from '../domain/scenario';
import type { CachedPath } from '../spatial/path-cache';
import type { Trace, TraceEvent } from '../simulation/trace';

/** An event that belongs to one attendee (every kind except `cap`). */
export type AttendeeEvent = Exclude<TraceEvent, { kind: 'cap' }>;

export type IndexedAttendee = {
  id: string;
  /** This attendee's events in the trace's processing order (so equal times keep the engine's order). */
  events: AttendeeEvent[];
  /** The cell the attendee appears at before arriving and when arriving: the first cell of its first path. */
  entranceCell: Cell;
  /** The cell the attendee rests on after exiting: the last cell of its last path. */
  exitCell: Cell;
};

export type TraceIndex = {
  trace: Trace;
  stations: Scenario['stations'];
  /** The last event time of the trace (the `cap` event included); the default end of the replay clock. */
  endMs: number;
  /** One record per trace attendee, in the trace's order (arrival time, then id). */
  attendees: IndexedAttendee[];
  byId: Map<string, IndexedAttendee>;
  /** Paths by id: `trace.paths` holds only the referenced paths, so they are not addressable by array index. */
  paths: Map<number, CachedPath>;
  stationCells: Map<string, Cell>;
  /** The time of the `cap` event, or null when the run did not reach the drain cap. */
  capMs: number | null;
};

export function buildIndex(trace: Trace, stations: Scenario['stations']): TraceIndex {
  const paths = new Map<number, CachedPath>();
  for (const path of trace.paths) paths.set(path.id, path);
  const eventsOf = new Map<string, AttendeeEvent[]>();
  let endMs = 0;
  let capMs: number | null = null;
  for (const event of trace.events) {
    if (event.timeMs > endMs) endMs = event.timeMs;
    if (event.kind === 'cap') {
      capMs = event.timeMs;
      continue;
    }
    const list = eventsOf.get(event.attendeeId);
    if (list === undefined) eventsOf.set(event.attendeeId, [event]);
    else list.push(event);
  }
  const fallback: Cell = trace.paths[0]?.cells[0] ?? [0, 0];
  const attendees = trace.attendees.map((a): IndexedAttendee => {
    const events = eventsOf.get(a.id) ?? [];
    const departs = events.filter((e): e is Extract<AttendeeEvent, { kind: 'depart' }> => e.kind === 'depart');
    const first = departs[0] === undefined ? undefined : paths.get(departs[0].pathId);
    const last = departs[departs.length - 1] === undefined ? undefined : paths.get((departs[departs.length - 1] as { pathId: number }).pathId);
    return {
      id: a.id,
      events,
      entranceCell: first?.cells[0] ?? fallback,
      exitCell: last?.cells[last.cells.length - 1] ?? fallback,
    };
  });
  return {
    trace,
    stations,
    endMs,
    attendees,
    byId: new Map(attendees.map((a) => [a.id, a])),
    paths,
    stationCells: new Map(stations.map((s) => [s.id, s.cell])),
    capMs,
  };
}
