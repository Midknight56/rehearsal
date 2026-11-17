import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/domain/hash';
import type { Scenario } from '../../src/domain/scenario';
import { toDurationMs, validateScenario } from '../../src/domain/validate';
import { DRAIN_CAP_MS } from '../../src/domain/limits';
import { compileAttendees } from '../../src/simulation/arrivals';
import { formatMetricValue, type MetricValue } from '../../src/simulation/metrics';
import { arrivalKey, createGenerator, serviceKey } from '../../src/simulation/random';
import { compileServiceSampler, serviceDurationMs, triangular } from '../../src/simulation/sampling';
import { simulate, type RunResult } from '../../src/simulation/simulate';
import type { TraceEvent } from '../../src/simulation/trace';
import { findPath } from '../../src/spatial/grid';
import { ARBITRARIES, mutationSpec, pathCase, rotations, scenarioAndReplication, validScenario } from './helpers/arbitraries';
import { checkProperty } from './helpers/property';

const TIMEOUT_MS = 120_000;
const run = (scenario: Scenario, replication: number): RunResult => simulate(scenario, replication, { trace: true, scenarioHash: 'property' });
const eventsOf = (result: RunResult): TraceEvent[] => result.trace?.events ?? [];
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function groupByAttendee(events: TraceEvent[]): Map<string, TraceEvent[]> {
  const groups = new Map<string, TraceEvent[]>();
  for (const event of events) {
    if (event.kind === 'cap') continue;
    const list = groups.get(event.attendeeId) ?? [];
    list.push(event);
    groups.set(event.attendeeId, list);
  }
  return groups;
}

function allMetricValues(value: unknown, found: MetricValue[] = []): MetricValue[] {
  if (Array.isArray(value)) value.forEach((item) => allMetricValues(item, found));
  else if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if ('unit' in record && 'value' in record && 'n' in record) found.push(record as unknown as MetricValue);
    else Object.values(record).forEach((item) => allMetricValues(item, found));
  }
  return found;
}

describe('properties P0 to P16 (task 12)', () => {
  it('exposes checkProperty and the valid-scenario arbitraries', () => {
    expect(typeof checkProperty).toBe('function');
    expect(ARBITRARIES.implemented, 'tests/model/helpers/arbitraries.ts is a placeholder until task 12 writes the properties').toBe(true);
  });

  it('P0 generator validity: every generated scenario validates', async () => {
    await checkProperty('P0 generator validity', validScenario, (scenario) => {
      const result = validateScenario(scenario);
      expect(result.ok, JSON.stringify(result)).toBe(true);
    });
  }, TIMEOUT_MS);

  it('P1 conservation: admitted = walking + waiting + inService + exited at every change of time', async () => {
    await checkProperty('P1 conservation', scenarioAndReplication, ([scenario, replication]) => {
      const state = new Map<string, 'walking' | 'waiting' | 'inService' | 'exited'>();
      const events = eventsOf(run(scenario, replication)).filter((event) => event.kind !== 'cap');
      const check = (): void => {
        const counts = { walking: 0, waiting: 0, inService: 0, exited: 0 };
        for (const value of state.values()) counts[value] += 1;
        expect(counts.walking + counts.waiting + counts.inService + counts.exited).toBe(state.size);
      };
      events.forEach((event, i) => {
        if (event.kind === 'arrive') {
          expect(state.has(event.attendeeId)).toBe(false);
          state.set(event.attendeeId, 'walking');
        } else if (event.kind === 'join') {
          expect(state.get(event.attendeeId)).toBe('walking');
          state.set(event.attendeeId, 'waiting');
        } else if (event.kind === 'start') {
          expect(state.get(event.attendeeId)).toBe('waiting');
          state.set(event.attendeeId, 'inService');
        } else if (event.kind === 'complete') {
          expect(state.get(event.attendeeId)).toBe('inService');
          state.set(event.attendeeId, 'walking');
        } else if (event.kind === 'exit') {
          expect(state.get(event.attendeeId)).toBe('walking');
          state.set(event.attendeeId, 'exited');
        }
        if (events[i + 1]?.timeMs !== event.timeMs) check();
      });
      const admitted = events.filter((event) => event.kind === 'arrive').length;
      expect(state.size).toBe(admitted);
    });
  }, TIMEOUT_MS);

  it('P2 nonnegative waits equal start minus the latest join', async () => {
    await checkProperty('P2 nonnegative waits', scenarioAndReplication, ([scenario, replication]) => {
      const latestJoin = new Map<string, number>();
      for (const event of eventsOf(run(scenario, replication))) {
        if (event.kind === 'join') latestJoin.set(`${event.attendeeId}|${event.stationId}`, event.timeMs);
        if (event.kind === 'start') {
          expect(event.waitMs).toBeGreaterThanOrEqual(0);
          expect(event.waitMs).toBe(event.timeMs - (latestJoin.get(`${event.attendeeId}|${event.stationId}`) ?? Number.NaN));
        }
      }
    });
  }, TIMEOUT_MS);

  it('P3 no overlapping jobs on one server', async () => {
    await checkProperty('P3 no overlapping jobs', scenarioAndReplication, ([scenario, replication]) => {
      const open = new Map<string, number>();
      for (const event of eventsOf(run(scenario, replication))) {
        if (event.kind === 'start') {
          const key = `${event.stationId}|${event.server}`;
          expect(open.has(key), `server ${key} started while busy`).toBe(false);
          open.set(key, event.timeMs);
        } else if (event.kind === 'complete') {
          const key = `${event.stationId}|${event.server}`;
          const startedAt = open.get(key);
          expect(startedAt).toBeDefined();
          expect(event.timeMs).toBeGreaterThan(startedAt ?? Number.POSITIVE_INFINITY);
          open.delete(key);
        }
      }
    });
  }, TIMEOUT_MS);

  it('P4 ordered visit: arrive, (depart, join, start, complete)*, depart, exit, truncated only when unfinished', async () => {
    await checkProperty('P4 ordered visit', scenarioAndReplication, ([scenario, replication]) => {
      const result = run(scenario, replication);
      const exitMs = new Map((result.trace?.attendees ?? []).map((attendee) => [attendee.id, attendee.exitMs]));
      const cohorts = new Map(scenario.cohorts.map((cohort) => [cohort.id, cohort]));
      const cohortOf = new Map((result.trace?.attendees ?? []).map((attendee) => [attendee.id, attendee.cohortId]));
      for (const [id, events] of groupByAttendee(eventsOf(result))) {
        const visits = cohorts.get(cohortOf.get(id) ?? '')?.route.length ?? 0;
        const full: string[] = ['arrive'];
        for (let i = 0; i < visits; i += 1) full.push('depart', 'join', 'start', 'complete');
        full.push('depart', 'exit');
        const kinds = events.map((event) => event.kind as string);
        expect(kinds).toEqual(full.slice(0, kinds.length));
        if (exitMs.get(id) !== null) expect(kinds).toEqual(full);
        for (let i = 1; i < events.length; i += 1) expect(events[i]!.timeMs).toBeGreaterThanOrEqual(events[i - 1]!.timeMs);
      }
    });
  }, TIMEOUT_MS);

  it('P5 valid routing: joins follow the route, departs target the next node, segments last as long as their paths', async () => {
    await checkProperty('P5 valid routing', scenarioAndReplication, ([scenario, replication]) => {
      const result = run(scenario, replication);
      const trace = result.trace!;
      const cohortOf = new Map(trace.attendees.map((attendee) => [attendee.id, attendee.cohortId]));
      const routes = new Map(scenario.cohorts.map((cohort) => [cohort.id, cohort.route]));
      for (const [id, events] of groupByAttendee(trace.events)) {
        const route = routes.get(cohortOf.get(id) ?? '') ?? [];
        const joins = events.flatMap((event) => (event.kind === 'join' ? [event.stationId] : []));
        expect(joins).toEqual(route.slice(0, joins.length));
        const departs = events.flatMap((event) => (event.kind === 'depart' ? [event] : []));
        departs.forEach((depart, index) => {
          const target = route[index];
          expect(depart.to).toEqual(target === undefined ? { kind: 'exit' } : { kind: 'station', id: target });
          const previous = route[index - 1];
          expect(depart.from).toEqual(index === 0 ? { kind: 'entrance' } : { kind: 'station', id: previous });
        });
      }
      for (const segment of trace.segments) {
        expect(segment.endMs - segment.startMs).toBe(trace.paths.find((path) => path.id === segment.pathId)?.durationMs);
      }
    });
  }, TIMEOUT_MS);

  it('P6 serialization equivalence: a JSON round trip gives the same result', async () => {
    await checkProperty('P6 serialization equivalence', scenarioAndReplication, ([scenario, replication]) => {
      const copy = JSON.parse(JSON.stringify(scenario)) as Scenario;
      expect(JSON.stringify(run(copy, replication))).toBe(JSON.stringify(run(scenario, replication)));
    });
  }, TIMEOUT_MS);

  it('P7 determinism: identical reruns; the raw draws of replications 0 and 1 differ when a draw exists', async () => {
    await checkProperty('P7 determinism', validScenario, (scenario) => {
      expect(JSON.stringify(run(scenario, 0))).toBe(JSON.stringify(run(scenario, 0)));
      const drawKeys: [string, string][] = [];
      for (const attendee of compileAttendees(scenario, 0)) {
        const cohort = scenario.cohorts.find((candidate) => candidate.id === attendee.cohortId)!;
        if (cohort.arrivals === 'uniform') {
          drawKeys.push([arrivalKey(scenario.baseSeed, 0, attendee.id), arrivalKey(scenario.baseSeed, 1, attendee.id)]);
        }
        for (const stationId of attendee.route) {
          const station = scenario.stations.find((candidate) => candidate.id === stationId)!;
          if (station.service.kind === 'triangular') {
            drawKeys.push([serviceKey(scenario.baseSeed, 0, attendee.id, stationId), serviceKey(scenario.baseSeed, 1, attendee.id, stationId)]);
          }
        }
      }
      if (drawKeys.length === 0) return; // vacuous: no uniform attendee and no triangular visit
      expect(drawKeys.some(([zero, one]) => createGenerator(zero)() !== createGenerator(one)())).toBe(true);
    });
  }, TIMEOUT_MS);

  it('P8 common random inputs: servers or a station cell change leaves arrivals and service durations alone', async () => {
    await checkProperty('P8 common random inputs', fc.tuple(scenarioAndReplication, mutationSpec), ([[scenario, replication], mutation]) => {
      const snapshot = (input: Scenario) => {
        const sampler = compileServiceSampler(input, replication);
        return compileAttendees(input, replication).map((attendee) => ({
          id: attendee.id,
          arrivalMs: attendee.arrivalMs,
          serviceMs: attendee.route.map((stationId) => sampler(attendee.id, stationId)),
        }));
      };
      if (scenario.stations.length === 0) return;
      const index = mutation.stationPick % scenario.stations.length;
      const before = snapshot(scenario);
      const moreServers: Scenario = {
        ...scenario,
        stations: scenario.stations.map((station, i) => (i === index ? { ...station, servers: mutation.servers } : station)),
      };
      expect(snapshot(moreServers)).toEqual(before);
      const cell: [number, number] = [mutation.moveX % scenario.layout.cols, mutation.moveY % scenario.layout.rows];
      const moved: Scenario = {
        ...scenario,
        stations: scenario.stations.map((station, i) => (i === index ? { ...station, cell } : station)),
      };
      const blocked = scenario.layout.blockedCells.some(([x, y]) => x === cell[0] && y === cell[1]);
      if (!blocked && validateScenario(moved).ok) expect(snapshot(moved)).toEqual(before);
    });
  }, TIMEOUT_MS);

  it('P9 FIFO dispatch: starts at a station are in (queue join time, attendee id) order', async () => {
    await checkProperty('P9 FIFO dispatch', scenarioAndReplication, ([scenario, replication]) => {
      const joined = new Map<string, number>();
      const last = new Map<string, { joinMs: number; id: string }>();
      for (const event of eventsOf(run(scenario, replication))) {
        if (event.kind === 'join') joined.set(`${event.attendeeId}|${event.stationId}`, event.timeMs);
        if (event.kind === 'start') {
          const joinMs = joined.get(`${event.attendeeId}|${event.stationId}`)!;
          const previous = last.get(event.stationId);
          if (previous !== undefined) {
            expect(joinMs > previous.joinMs || (joinMs === previous.joinMs && byCodeUnit(previous.id, event.attendeeId) < 0)).toBe(true);
          }
          last.set(event.stationId, { joinMs, id: event.attendeeId });
        }
      }
    });
  }, TIMEOUT_MS);

  it('P10 horizon bounds', async () => {
    await checkProperty('P10 horizon bounds', scenarioAndReplication, ([scenario, replication]) => {
      const result = run(scenario, replication);
      for (const event of eventsOf(result)) {
        if (event.kind === 'arrive') expect(event.timeMs).toBeLessThan(scenario.horizonMs);
        expect(event.timeMs).toBeLessThanOrEqual(scenario.horizonMs + DRAIN_CAP_MS);
      }
      expect(result.unfinished.length > 0).toBe(result.completion === 'drain-capped');
      expect(result.unfinished).toEqual([...result.unfinished].sort(byCodeUnit));
    });
  }, TIMEOUT_MS);

  it('P11 metric bounds', async () => {
    await checkProperty('P11 metric bounds', scenarioAndReplication, ([scenario, replication]) => {
      const { metrics } = run(scenario, replication);
      for (const station of metrics.stations) {
        expect(station.utilization.value).not.toBeNull();
        expect(station.utilization.value!).toBeGreaterThanOrEqual(0);
        expect(station.utilization.value!).toBeLessThanOrEqual(1 + 1e-12);
        expect(station.busyMs.value!).toBeLessThanOrEqual(station.servers * scenario.horizonMs);
        expect(station.averageQueueLength.value!).toBeGreaterThanOrEqual(0);
        expect(station.averageQueueLength.value!).toBeLessThanOrEqual(station.maxQueueLength.value! + 1e-9);
      }
      expect(metrics.queues.averageLength.value!).toBeGreaterThanOrEqual(0);
      expect(metrics.queues.averageLength.value!).toBeLessThanOrEqual(metrics.queues.maxLength.value! + 1e-9);
      expect(metrics.completedByClosing.value! + metrics.activeAtClosing.total.value!).toBe(metrics.admitted);
      const active = metrics.activeAtClosing;
      expect(active.walking.value! + active.waiting.value! + active.inService.value!).toBe(active.total.value!);
    });
  }, TIMEOUT_MS);

  it('P12 dash rule: undefined means are null, nothing is NaN or infinite, text never reads NaN or null', async () => {
    await checkProperty('P12 dash rule', scenarioAndReplication, ([scenario, replication]) => {
      for (const metric of allMetricValues(run(scenario, replication).metrics)) {
        // busyMs (closingWindow) is a defined total of 0 ms for an idle station (requirement 7.4 and the design's metric notes),\n        // so the null rule covers the means, totals of waits and percentiles of the admitted and completed-journey populations.\n        if (metric.n === 0 && metric.unit === 'ms' && metric.population !== 'closingWindow') expect(metric.value).toBeNull();
        if (metric.value !== null) expect(Number.isFinite(metric.value)).toBe(true);
        const text = formatMetricValue(metric);
        expect(typeof text).toBe('string');
        expect(text).not.toMatch(/NaN|null|undefined|Infinity/);
      }
    });
  }, TIMEOUT_MS);

  it('P13 path geometry', async () => {
    await checkProperty('P13 path geometry', pathCase, ({ cols, rows, blockedCells, a, b }) => {
      const layout = { cols, rows, cellSizeM: 0.5, blockedCells, entrance: a, exit: b };
      const open = findPath({ ...layout, blockedCells: [] }, a, b)!;
      expect(open.length - 1).toBe(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]));
      const path = findPath(layout, a, b);
      const back = findPath(layout, b, a);
      expect(path === null).toBe(back === null);
      if (path === null || back === null) return;
      expect(back.length).toBe(path.length);
      expect(findPath(layout, a, b)).toEqual(path);
      const blocked = new Set(blockedCells.map(([x, y]) => `${x},${y}`));
      path.forEach(([x, y], i) => {
        expect(x >= 0 && y >= 0 && x < cols && y < rows).toBe(true);
        expect(blocked.has(`${x},${y}`)).toBe(false);
        if (i > 0) expect(Math.abs(x - path[i - 1]![0]) + Math.abs(y - path[i - 1]![1])).toBe(1);
      });
    });
  }, TIMEOUT_MS);

  it('P14 hash invariance', async () => {
    await checkProperty('P14 hash invariance', fc.tuple(validScenario, rotations), ([scenario, turn]) => {
      const rotate = <T>(items: T[], by: number): T[] => (items.length === 0 ? items : [...items.slice(by % items.length), ...items.slice(0, by % items.length)]);
      const original = canonicalJson(scenario);
      const reordered: Scenario = {
        ...scenario,
        id: 'other', revision: 9, title: 'another title', notes: 'another note',
        layout: { ...scenario.layout, blockedCells: rotate(scenario.layout.blockedCells, turn.blocked) },
        stations: rotate(scenario.stations, turn.stations),
        cohorts: rotate(scenario.cohorts, turn.cohorts),
      };
      expect(canonicalJson(reordered)).toBe(original);
      const copy = (): Scenario => JSON.parse(JSON.stringify(scenario)) as Scenario;
      const mutations: ((s: Scenario) => void)[] = [
        (s) => { s.baseSeed += 'x'; },
        (s) => { s.horizonMs += 1; },
        (s) => { s.modelVersion = '0.0.1'; },
        (s) => { s.walkSpeedMps += 0.125; },
        (s) => { s.layout.cols += 1; },
        (s) => { s.layout.rows += 1; },
        (s) => { s.layout.cellSizeM += 0.25; },
        (s) => { s.layout.entrance = [s.layout.entrance[0] + 1, s.layout.entrance[1]]; },
        (s) => { s.layout.exit = [s.layout.exit[0] + 1, s.layout.exit[1]]; },
        (s) => { s.layout.blockedCells.push([99, 99]); },
      ];
      scenario.stations.forEach((_, i) => {
        mutations.push(
          (s) => { s.stations[i]!.servers += 1; },
          (s) => { s.stations[i]!.label += 'x'; },
          (s) => { s.stations[i]!.id += 'x'; },
          (s) => { s.stations[i]!.cell = [s.stations[i]!.cell[0] + 1, s.stations[i]!.cell[1]]; },
          (s) => { s.stations[i]!.service = { kind: 'constant', seconds: 999 }; },
        );
      });
      scenario.cohorts.forEach((_, i) => {
        mutations.push(
          (s) => { s.cohorts[i]!.startMs += 1; },
          (s) => { s.cohorts[i]!.endMs += 1; },
          (s) => { s.cohorts[i]!.count += 1; },
          (s) => { s.cohorts[i]!.id += 'x'; },
          (s) => { s.cohorts[i]!.arrivals = s.cohorts[i]!.arrivals === 'even' ? 'uniform' : 'even'; },
          (s) => { s.cohorts[i]!.route = [...s.cohorts[i]!.route, 'extra']; },
        );
      });
      mutations.forEach((mutate, index) => {
        const changed = copy();
        mutate(changed);
        expect(canonicalJson(changed), `mutation ${index}`).not.toBe(original);
      });
    });
  }, TIMEOUT_MS);

  it('P15 arrivals in band, even arrivals nondecreasing, list sorted by (arrivalMs, id)', async () => {
    await checkProperty('P15 arrivals in band', scenarioAndReplication, ([scenario, replication]) => {
      const attendees = compileAttendees(scenario, replication);
      for (const cohort of scenario.cohorts) {
        const own = attendees.filter((attendee) => attendee.cohortId === cohort.id).sort((x, y) => x.ordinal - y.ordinal);
        expect(own).toHaveLength(cohort.count);
        own.forEach((attendee, i) => {
          expect(attendee.arrivalMs).toBeGreaterThanOrEqual(cohort.startMs);
          expect(attendee.arrivalMs).toBeLessThan(cohort.endMs);
          if (cohort.arrivals === 'even' && i > 0) expect(attendee.arrivalMs).toBeGreaterThanOrEqual(own[i - 1]!.arrivalMs);
        });
      }
      for (let i = 1; i < attendees.length; i += 1) {
        const x = attendees[i - 1]!;
        const y = attendees[i]!;
        expect(x.arrivalMs < y.arrivalMs || (x.arrivalMs === y.arrivalMs && byCodeUnit(x.id, y.id) < 0)).toBe(true);
      }
    });
  }, TIMEOUT_MS);

  it('P16 sampler range', async () => {
    const triangle = fc.integer({ min: 0, max: 200 }).chain((a) =>
      fc.integer({ min: a, max: a + 200 }).chain((b) => fc.integer({ min: a, max: b }).map((c) => ({ a, b, c }))),
    );
    await checkProperty('P16 sampler range', fc.tuple(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), triangle), ([u, { a, b, c }]) => {
      const value = triangular(u, a, c, b);
      expect(value).toBeGreaterThanOrEqual(a);
      expect(value).toBeLessThanOrEqual(b);
      expect(triangular(u, a, a, a)).toBe(a);
      for (const service of [
        { kind: 'constant', seconds: a / 1_000_000 },
        { kind: 'triangular', minS: a / 1_000_000, modeS: c / 1_000_000, maxS: b / 1_000_000 },
      ] as const) {
        const ms = serviceDurationMs(service, () => u);
        expect(ms).toBeGreaterThanOrEqual(1);
        expect(Number.isSafeInteger(ms)).toBe(true);
      }
      expect(toDurationMs(0)).toBe(1);
    });
  }, TIMEOUT_MS);
});
