import * as fc from 'fast-check';
import { buildComparison, type Comparison } from '../../../src/comparison/comparison';
import { REPLICATION_INDICES } from '../../../src/comparison/replications';
import type { Cohort, Scenario, Station } from '../../../src/domain/scenario';
import type { MetricValue, Metrics, Population, Unit } from '../../../src/simulation/metrics';
import type { RunResult } from '../../../src/simulation/simulate';
import { tenStations } from '../fixtures/ten-stations';

/*
 * Arbitraries of the design's Property-based tests. Result values are built from a few generated numbers per side
 * (a base value per metric, a scale per replication, a few null cells, a few drain-capped replications) so a case
 * stays cheap: 200 cases of 60 full random Metrics objects would dominate the suite's run time.
 */

type Column = { unit: Unit; population: Population; nullable: boolean };
// Order of METRIC_KEYS.
const GLOBAL_COLUMNS: Column[] = [
  { unit: 'count', population: 'admitted', nullable: false },
  { unit: 'people', population: 'admitted', nullable: false },
  { unit: 'ms', population: 'completedJourney', nullable: true },
  { unit: 'ms', population: 'completedJourney', nullable: true },
  { unit: 'ms', population: 'completedJourney', nullable: true },
  { unit: 'ms', population: 'completedJourney', nullable: true },
  { unit: 'ms', population: 'completedJourney', nullable: true },
  { unit: 'ms', population: 'admitted', nullable: true },
  { unit: 'people', population: 'closingWindow', nullable: false },
  { unit: 'people', population: 'closingWindow', nullable: false },
  { unit: 'hours', population: 'closingWindow', nullable: false },
];
// Order of STATION_METRIC_KEYS.
const STATION_COLUMNS: Column[] = [
  { unit: 'ratio', population: 'closingWindow', nullable: false },
  { unit: 'people', population: 'closingWindow', nullable: false },
  { unit: 'people', population: 'closingWindow', nullable: false },
  { unit: 'count', population: 'closingWindow', nullable: false },
];

const mv = (value: number | null, column: Column): MetricValue => ({
  value, unit: column.unit, population: column.population, n: value === null ? 0 : 30, conditioned: false, note: null,
});

function metricsOf(values: (number | null)[], stationIds: string[], horizonMs: number): Metrics {
  const g = (i: number): MetricValue => mv(values[i] ?? null, GLOBAL_COLUMNS[i] as Column);
  return {
    horizonMs,
    admitted: 120,
    completedByClosing: g(0),
    activeAtClosing: { total: g(1), walking: mv(0, GLOBAL_COLUMNS[1] as Column), waiting: mv(0, GLOBAL_COLUMNS[1] as Column), inService: mv(0, GLOBAL_COLUMNS[1] as Column) },
    queueWait: { total: g(2), mean: g(3), p95: g(4) },
    journeyTime: { mean: g(5), p95: g(6) },
    walkingTime: { mean: g(7) },
    queues: { averageLength: g(8), maxLength: g(9) },
    stations: stationIds.map((id, s) => {
      const at = (c: number): number | null => values[GLOBAL_COLUMNS.length + s * STATION_COLUMNS.length + c] ?? null;
      return {
        id, servers: 1,
        busyMs: mv(0, { unit: 'ms', population: 'closingWindow', nullable: false }),
        utilization: mv(at(0), STATION_COLUMNS[0] as Column),
        averageQueueLength: mv(at(1), STATION_COLUMNS[1] as Column),
        maxQueueLength: mv(at(2), STATION_COLUMNS[2] as Column),
        served: mv(at(3), STATION_COLUMNS[3] as Column),
      };
    }),
    staffHours: g(10),
  };
}

const value = fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true });
const scale = fc.double({ min: 0.5, max: 1.5, noNaN: true, noDefaultInfinity: true });

function sideArb(stationIds: string[], horizonMs: number): fc.Arbitrary<RunResult[]> {
  const columns = GLOBAL_COLUMNS.length + stationIds.length * STATION_COLUMNS.length;
  const nullable = GLOBAL_COLUMNS.map((c, i) => (c.nullable ? i : -1)).filter((i) => i >= 0);
  return fc.record({
    base: fc.array(value, { minLength: columns, maxLength: columns }),
    scales: fc.array(scale, { minLength: 30, maxLength: 30 }),
    nulls: fc.array(fc.tuple(fc.nat(29), fc.constantFrom(...nullable)), { maxLength: 5 }),
    capped: fc.subarray([...REPLICATION_INDICES], { maxLength: 6 }),
  }).map(({ base, scales, nulls, capped }) =>
    REPLICATION_INDICES.map((replication): RunResult => {
      const values: (number | null)[] = base.map((b, k) => b * (scales[(replication + k) % 30] as number));
      for (const [r, k] of nulls) if (r === replication) values[k] = null;
      const isCapped = capped.includes(replication);
      return {
        scenarioHash: 'h', modelVersion: '0.1.0', baseSeed: 'seed', replication, horizonMs,
        completion: isCapped ? 'drain-capped' : 'complete',
        unfinished: isCapped ? [`x#${String(replication).padStart(4, '0')}`] : [],
        metrics: metricsOf(values, stationIds, horizonMs),
      };
    }));
}

export type ResultsPair = { baseline: RunResult[]; candidate: RunResult[]; stationIds: string[] };

/** 30 `RunResult`-shaped objects per side with the engine's `Metrics` shape, 5-ish% null mean-type cells, some drain-capped. */
export function metricsArb(stationIds: string[] = ['s0', 's1']): fc.Arbitrary<ResultsPair> {
  return fc.tuple(sideArb(stationIds, 600_000), sideArb(stationIds, 600_000)).map(([baseline, candidate]) => ({ baseline, candidate, stationIds }));
}

export const stationsOf = (ids: string[]): Station[] =>
  ids.map((id) => ({ id, label: `Station ${id}`, cell: [0, 0], servers: 1, service: { kind: 'constant', seconds: 5 } }));

/** Unicode strings of length 0-40 including characters that matter to HTML and spreadsheets. */
export const stringArb: fc.Arbitrary<string> = fc.oneof(
  fc.string({ unit: 'binary', minLength: 0, maxLength: 40 }),
  fc.array(fc.constantFrom('<', '>', '&', '"', "'", '=', '+', '-', '@', '|', ' ', 'a', 'é', '\t', '\n'), { maxLength: 40 }).map((chars) => chars.join('')),
);

type EditKind = 'horizon' | 'seed' | 'speed' | 'servers' | 'service' | 'cell' | 'window' | 'arrivals' | 'route' | 'count';
const EDIT_KINDS: EditKind[] = ['horizon', 'seed', 'speed', 'servers', 'service', 'cell', 'window', 'arrivals', 'route', 'count'];

export type EditedPair = { baseline: Scenario; candidate: Scenario; expectedPaths: string[]; metadataEdited: boolean; populationEdited: boolean };

function applyEdit(s: Scenario, kind: EditKind, target: number, salt: number): { scenario: Scenario; path: string } | null {
  const station = s.stations.length === 0 ? undefined : s.stations[target % s.stations.length];
  const cohort = s.cohorts.length === 0 ? undefined : s.cohorts[target % s.cohorts.length];
  const withStation = (id: string, patch: Partial<Station>): Scenario => ({ ...s, stations: s.stations.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const withCohort = (id: string, patch: Partial<Cohort>): Scenario => ({ ...s, cohorts: s.cohorts.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  switch (kind) {
    case 'horizon': return { scenario: { ...s, horizonMs: s.horizonMs + 60_000 * salt }, path: 'horizonMs' };
    case 'seed': return { scenario: { ...s, baseSeed: `${s.baseSeed}x` }, path: 'baseSeed' };
    case 'speed': return { scenario: { ...s, walkSpeedMps: s.walkSpeedMps + 0.25 }, path: 'walkSpeedMps' };
    case 'servers':
      return station === undefined ? null : { scenario: withStation(station.id, { servers: (station.servers % 20) + 1 }), path: `stations.${station.id}.servers` };
    case 'service':
      return station === undefined ? null : { scenario: withStation(station.id, { service: { kind: 'constant', seconds: 100 + salt } }), path: `stations.${station.id}.service` };
    case 'cell':
      return station === undefined ? null : { scenario: withStation(station.id, { cell: [(station.cell[0] + 1) % Math.max(2, s.layout.cols), station.cell[1]] }), path: `stations.${station.id}.cell` };
    case 'window': return cohort === undefined ? null : { scenario: withCohort(cohort.id, { startMs: cohort.startMs + 1 }), path: `cohorts.${cohort.id}.window` };
    case 'arrivals':
      return cohort === undefined ? null : { scenario: withCohort(cohort.id, { arrivals: cohort.arrivals === 'even' ? 'uniform' : 'even' }), path: `cohorts.${cohort.id}.arrivals` };
    case 'route': {
      if (cohort === undefined) return null;
      const route = cohort.route.length > 0 ? cohort.route.slice(1) : s.stations.length > 0 ? [(s.stations[0] as Station).id] : null;
      return route === null ? null : { scenario: withCohort(cohort.id, { route }), path: `cohorts.${cohort.id}.route` };
    }
    case 'count': return cohort === undefined ? null : { scenario: withCohort(cohort.id, { count: cohort.count + 1 }), path: 'cohorts' };
  }
}

/** A scenario from `base` with 0-3 distinct edits of diffable fields and 0-1 metadata edits applied to a copy. */
export function scenarioPairArb(base: fc.Arbitrary<Scenario>, options: { counts?: boolean } = {}): fc.Arbitrary<EditedPair> {
  const kinds = options.counts === true ? EDIT_KINDS : EDIT_KINDS.filter((k) => k !== 'count');
  return fc.tuple(
    base,
    fc.array(fc.record({ kind: fc.constantFrom(...kinds), target: fc.nat(9), salt: fc.integer({ min: 1, max: 50 }) }), { maxLength: 3 }),
    fc.boolean(),
  ).map(([baseline, edits, metadata]) => {
    let candidate = baseline;
    const expected = new Set<string>();
    for (const edit of edits) {
      const applied = applyEdit(candidate, edit.kind, edit.target, edit.salt);
      if (applied === null || expected.has(applied.path)) continue;
      const before = JSON.stringify(candidate);
      if (JSON.stringify(applied.scenario) === before) continue;
      candidate = applied.scenario;
      expected.add(applied.path);
    }
    if (metadata) candidate = { ...candidate, id: `${candidate.id}-b`, title: `${candidate.title}!`, notes: `${candidate.notes}?`, revision: candidate.revision + 1 };
    return {
      baseline, candidate, expectedPaths: [...expected].sort(), metadataEdited: metadata,
      populationEdited: expected.has('cohorts'),
    };
  });
}

/** The ten-station fixture cut to its first k stations (k = 0 to 10); routes keep only the stations that remain. */
export const bigScenarioArb: fc.Arbitrary<Scenario> = fc.integer({ min: 0, max: 10 }).map((k) => {
  const stations = tenStations.stations.slice(0, k);
  const ids = new Set(stations.map((s) => s.id));
  return { ...tenStations, stations, cohorts: tenStations.cohorts.map((c) => ({ ...c, route: c.route.filter((id) => ids.has(id)) })) };
});

const fakeTrace = { version: 1 as const, paths: [], attendees: [], events: [], segments: [] };

/** A `Comparison` assembled from generated results for a generated scenario pair with up to 10 stations and up to 3 edits. */
export const comparisonArb: fc.Arbitrary<Comparison> = scenarioPairArb(bigScenarioArb, { counts: true }).chain((pair) => {
  const ids = pair.baseline.stations.map((s) => s.id);
  return fc.tuple(metricsArb(ids), fc.nat(29)).map(([results, replay]) =>
    buildComparison({
      baseline: pair.baseline, candidate: pair.candidate, baselineHash: 'a'.repeat(64), candidateHash: 'b'.repeat(64),
      baselineResults: results.baseline, candidateResults: results.candidate,
      baselineReplay: { ...results.baseline[replay] as RunResult, trace: fakeTrace },
      candidateReplay: { ...results.candidate[replay] as RunResult, trace: fakeTrace },
      replayReplication: replay, timing: { pairedMs: 1234.5678, replayMs: 98.7654 }, createdAt: '2026-11-20T12:00:00.000Z',
    }));
});
