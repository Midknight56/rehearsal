import type { CompiledAttendee } from './arrivals';
import type { NodeRef } from './heap';
import type { MovementSegment, TraceEvent } from './trace';
function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}
export type ScheduleStation = { id: string; servers: number; serviceMs: (attendeeId: string) => number };
export type TravelLookup = (from: NodeRef, to: NodeRef) => { pathId: number; durationMs: number };
export type ScheduleInput = {
  attendees: CompiledAttendee[]; stations: ScheduleStation[]; travel: TravelLookup;
  horizonMs: number; drainCapMs: number; trace: boolean;
};
export type Visit = { stationId: string; queueJoinMs: number; serviceStartMs: number | null; completeMs: number | null; server: number | null };
export type AttendeeRecord = {
  id: string; cohortId: string; arrivalMs: number; route: string[]; visits: Visit[]; walkingMs: number; exitMs: number | null;
  state: 'pending' | 'walking' | 'waiting' | 'inService' | 'exited';
};
export type SettledSample = {
  timeMs: number; admitted: number; walking: number; waiting: number; inService: number; exited: number;
  waitingByStation: Record<string, number>;
};
export type ScheduleOutput = {
  attendees: AttendeeRecord[]; settled: SettledSample[];
  events: TraceEvent[]; segments: MovementSegment[]; // empty arrays when trace is false
  completion: 'complete' | 'drain-capped'; unfinished: string[]; capMs: number;
};

export function runSchedule(input: ScheduleInput): ScheduleOutput {
  return notImplemented('runSchedule');
}