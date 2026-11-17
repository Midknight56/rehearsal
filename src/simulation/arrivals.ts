import type { Scenario } from '../domain/scenario';
function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}
export type CompiledAttendee = { id: string; cohortId: string; ordinal: number; arrivalMs: number; route: string[] };

export function attendeeId(cohortId: string, ordinal: number): string {
  return notImplemented('attendeeId');
}

export function evenArrivalMs(startMs: number, endMs: number, count: number, j: number): number {
  return notImplemented('evenArrivalMs');
}

export function uniformArrivalMs(startMs: number, endMs: number, u: number): number {
  return notImplemented('uniformArrivalMs');
}

export function compileAttendees(scenario: Scenario, replication: number): CompiledAttendee[] {
  return notImplemented('compileAttendees');
}