import type { PathCache, CachedPath } from '../spatial/path-cache';
import type { NodeRef } from './heap';
import type { ScheduleOutput } from './scheduler';
function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}
export type TraceEvent =
  | { kind: 'arrive'; timeMs: number; attendeeId: string }
  | { kind: 'depart'; timeMs: number; attendeeId: string; from: NodeRef; to: NodeRef; pathId: number; arriveMs: number }
  | { kind: 'join'; timeMs: number; attendeeId: string; stationId: string; position: number }
  | { kind: 'start'; timeMs: number; attendeeId: string; stationId: string; server: number; waitMs: number }
  | { kind: 'complete'; timeMs: number; attendeeId: string; stationId: string; server: number }
  | { kind: 'exit'; timeMs: number; attendeeId: string }
  | { kind: 'cap'; timeMs: number };
export type MovementSegment = { attendeeId: string; startMs: number; endMs: number; pathId: number };
export type TraceAttendee = { id: string; cohortId: string; arrivalMs: number; exitMs: number | null };
export type Trace = { version: 1; paths: CachedPath[]; attendees: TraceAttendee[]; events: TraceEvent[]; segments: MovementSegment[] };

export function buildTrace(out: ScheduleOutput, cache: PathCache): Trace {
  return notImplemented('buildTrace');
}