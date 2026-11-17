import { describe, expect, it } from 'vitest';
import type { Scenario } from '../../src/domain/scenario';
import { validateScenario, type IssueCode } from '../../src/domain/validate';
import { MODEL_VERSION } from '../../src/simulation/version';
import { scenario } from './helpers/build-scenario';

/** A valid 5 × 3 scenario: entrance (0,0), exit (4,0), one station "desk" at (2,1), cohort "c" of 5 attendees. */
function base(): Scenario {
  return scenario({
    horizonMs: 120_000,
    layout: { cols: 5, rows: 3, cellSizeM: 0.5, blockedCells: [], entrance: [0, 0], exit: [4, 0] },
    stations: [{ id: 'desk', label: 'Desk', cell: [2, 1], servers: 1, service: { kind: 'constant', seconds: 10 } }],
    cohorts: [{ id: 'c', startMs: 0, endMs: 60_000, count: 5, arrivals: 'even', route: ['desk'] }],
  });
}

type Mutator = (s: Record<string, any>) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
const cases: [IssueCode, Mutator, string][] = [
  ['SCHEMA_VERSION', (s) => { s.schemaVersion = 2; }, 'Unsupported schemaVersion 2; this build reads version 1.'],
  ['MODEL_VERSION_FORMAT', (s) => { s.modelVersion = 'v1'; }, 'modelVersion must look like 0.1.0; got "v1".'],
  ['SEED_FORMAT', (s) => { s.baseSeed = 'a|b'; }, 'Base seed must be 1–64 characters and must not contain "|".'],
  ['ID_FORMAT', (s) => { s.stations[0].id = 'a#b'; }, 'Station id "a#b" must be 1–64 characters and must not contain "|" or "#".'],
  ['DUPLICATE_ID', (s) => { s.stations.push({ ...s.stations[0] }); }, 'Duplicate station id "desk".'],
  ['HORIZON_RANGE', (s) => { s.horizonMs = 0; }, 'Observation window must be a whole number of milliseconds between 1 and 21,600,000 (6 hours); got 0.'],
  ['GRID_SIZE', (s) => { s.layout.cols = 81; }, 'Grid must be a whole number of cells, between 1 × 1 and 80 × 80; got 81 × 3.'],
  ['CELL_SIZE', (s) => { s.layout.cellSizeM = 0; }, 'Cell size must be a positive number of meters; got 0.'],
  ['WALK_SPEED', (s) => { s.walkSpeedMps = 0; }, 'Walking speed must be a positive number of meters per second; got 0.'],
  ['CELL_OUT_OF_BOUNDS', (s) => { s.layout.entrance = [9, 0]; }, 'Entrance cell (9,0) is outside the 5 × 3 grid or has a coordinate that is not a whole number.'],
  ['CELL_BLOCKED', (s) => { s.layout.blockedCells = [[2, 1]]; }, 'Station "desk" cell (2,1) is blocked.'],
  ['DUPLICATE_BLOCKED_CELL', (s) => { s.layout.blockedCells = [[1, 1], [1, 1]]; }, 'Blocked cell (1,1) is listed more than once.'],
  ['SERVERS_RANGE', (s) => { s.stations[0].servers = 21; }, 'Station "desk": servers must be a whole number from 1 to 20; got 21.'],
  ['SERVICE_RANGE', (s) => { s.stations[0].service.seconds = 0; }, 'Station "desk": service seconds must be greater than 0 and at most 86,400; got 0.'],
  ['SERVICE_RANGE', (s) => { s.stations[0].service = { kind: 'triangular', minS: 5, modeS: 3, maxS: 9 }; }, 'Station "desk": triangular service needs 0 < min ≤ mode ≤ max (seconds, at most 86,400); got 5/3/9.'],
  ['COHORT_WINDOW', (s) => { s.cohorts[0].startMs = 60_000; }, 'Cohort "c": start and end must be whole milliseconds, start at or after 0 and before end, and end at or before the horizon; got start 60000 ms, end 60000 ms, horizon 120000 ms.'],
  ['COUNT_RANGE', (s) => { s.cohorts[0].count = -1; }, 'Cohort "c": count must be a whole number of 0 or more; got -1.'],
  ['ARRIVAL_PATTERN', (s) => { s.cohorts[0].arrivals = 'random'; }, 'Cohort "c": arrival pattern must be "even" or "uniform"; got "random".'],
  ['ROUTE_LENGTH', (s) => { s.cohorts[0].route = Array(7).fill('desk'); }, 'Cohort "c": route has 7 visits; the limit is 6.'],
  ['ROUTE_UNKNOWN_STATION', (s) => { s.cohorts[0].route = ['nope']; }, 'Cohort "c": route names unknown station "nope".'],
  ['ROUTE_REPEAT', (s) => { s.cohorts[0].route = ['desk', 'desk']; }, 'Cohort "c": route visits station "desk" more than once.'],
  ['ATTENDEE_LIMIT', (s) => { s.cohorts[0].count = 5_001; }, 'Total attendees 5001 exceed the limit of 5,000.'],
  ['STATION_LIMIT', (s) => { for (let i = 0; i < 10; i += 1) s.stations.push({ ...s.stations[0], id: `s${i}` }); }, '11 stations exceed the limit of 10.'],
  ['NON_FINITE', (s) => { s.walkSpeedMps = Number.NaN; }, 'walkSpeedMps must be a finite number; got NaN.'],
  ['UNREACHABLE', (s) => { s.layout.blockedCells = [[2, 0], [2, 1], [2, 2]]; s.stations[0].cell = [3, 1]; }, 'No walkable path between entrance (0,0) and station "desk" (3,1).'],
];

describe('rows 1.3 to 1.8: one exact message per code', () => {
  it('the unmodified base scenario is valid with no warning', () => {
    const result = validateScenario(base());
    expect(result).toMatchObject({ ok: true, warnings: [] });
  });

  for (const [code, mutate, message] of cases) {
    it(`${code}: ${message}`, () => {
      const input = structuredClone(base()) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      mutate(input);
      const result = validateScenario(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues.some((issue) => issue.code === code && issue.message === message)).toBe(true);
    });
  }

  it('UNSAFE_MS: a walking duration beyond the safe integers is an issue', () => {
    const input = base();
    input.layout.cellSizeM = 1e300;
    input.walkSpeedMps = 1e-300;
    const result = validateScenario(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain('UNSAFE_MS');
  });

  it('collects three defects in one result', () => {
    const input = base();
    input.baseSeed = 'a|b';
    input.walkSpeedMps = 0;
    input.stations[0] = { ...input.stations[0]!, servers: 0 };
    const result = validateScenario(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.code).sort()).toEqual(['SEED_FORMAT', 'SERVERS_RANGE', 'WALK_SPEED']);
  });

  it('never mutates a frozen input', () => {
    const input = base();
    const snapshot = JSON.stringify(input);
    const freeze = (value: unknown): void => {
      if (typeof value === 'object' && value !== null) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
    };
    freeze(input);
    expect(validateScenario(input).ok).toBe(true);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('a different modelVersion is valid with one MODEL_VERSION_MISMATCH warning', () => {
    const input = base();
    input.modelVersion = '0.9.0';
    expect(MODEL_VERSION).not.toBe('0.9.0');
    const result = validateScenario(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings.map((warning) => warning.code)).toEqual(['MODEL_VERSION_MISMATCH']);
  });
});