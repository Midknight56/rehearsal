import type { Scenario } from '../../../src/domain/scenario';
import type { CompiledAttendee } from '../../../src/simulation/arrivals';
import type { ScheduleInput } from '../../../src/simulation/scheduler';
import { scenario } from '../helpers/build-scenario';

const DRAIN_CAP_MS = 7_200_000;

function attendee(id: string, arrivalMs: number): CompiledAttendee {
  const [cohortId = '', ordinal = '0'] = id.split('#');
  return { id, cohortId, ordinal: Number(ordinal), arrivalMs, route: ['s'] };
}

function schedule(attendees: CompiledAttendee[], servers: number, serviceMs: number, horizonMs = 180_000): ScheduleInput {
  return {
    attendees,
    stations: [{ id: 's', servers, serviceMs: () => serviceMs }],
    travel: () => ({ pathId: 0, durationMs: 0 }),
    horizonMs,
    drainCapMs: DRAIN_CAP_MS,
    trace: true,
  };
}

const rowOneAttendees = [attendee('a#0000', 0), attendee('b#0000', 30_000), attendee('c#0000', 60_000)];

/** Row 1: one server, 60 s service, arrivals at 0, 30 s and 60 s. */
export const row1Schedule: ScheduleInput = schedule(rowOneAttendees, 1, 60_000);
/** Row 2: row 1 with two servers. */
export const row2Schedule: ScheduleInput = schedule(rowOneAttendees, 2, 60_000);
/** Row 3: a#0000 and a#0001 at 0, c#0000 at 10 s; 10 s service. */
export const row3Schedule: ScheduleInput = schedule([attendee('a#0000', 0), attendee('a#0001', 0), attendee('c#0000', 10_000)], 1, 10_000);

const desk = (servers: number, seconds: number) => ({
  id: 's', label: 'Station', cell: [0, 0] as [number, number], servers, service: { kind: 'constant' as const, seconds },
});
const cohort = (id: string, startMs: number, endMs: number, count: number) => ({
  id, startMs, endMs, count, arrivals: 'even' as const, route: ['s'],
});

/** Rows 1 and 2 as scenarios on the one-cell layout. */
export const row1Scenario: Scenario = scenario({
  stations: [desk(1, 60)],
  cohorts: [cohort('a', 0, 1, 1), cohort('b', 30_000, 30_001, 1), cohort('c', 60_000, 60_001, 1)],
});
export const row2Scenario: Scenario = scenario({ ...row1Scenario, stations: [desk(2, 60)] });
/** Row 3: cohort a has two attendees in [0, 1), c arrives at 10 s. */
export const row3Scenario: Scenario = scenario({
  stations: [desk(1, 10)],
  cohorts: [cohort('a', 0, 1, 2), cohort('c', 10_000, 10_001, 1)],
});
/** Row 6: one arrival at 0, 100 s service, closing at 60 s. */
export const row6Scenario: Scenario = scenario({
  horizonMs: 60_000,
  stations: [desk(1, 100)],
  cohorts: [cohort('x', 0, 1, 1)],
});
/** Row 7: two even arrivals at 15 s and 45 s, 4,000 s service, closing at 60 s (drain-capped). */
export const row7Scenario: Scenario = scenario({
  horizonMs: 60_000,
  stations: [desk(1, 4_000)],
  cohorts: [cohort('late', 0, 60_000, 2)],
});