import * as fc from 'fast-check';
import type { Cell, Cohort, Scenario, Service, Station } from '../../../src/domain/scenario';
import { MODEL_VERSION } from '../../../src/simulation/version';
import { createPathCache } from '../../../src/spatial/path-cache';

/*
 * Valid-scenario arbitraries of the design's Property-based tests: grid 2 x 2 to 8 x 8; blocked cells chosen from
 * the cells no node uses, then kept only when every node stays reachable; 0-3 stations; 0-3 cohorts with count 0-20
 * and a total of at most 40; H 60,000-600,000 ms; a uniform window is at least 1,000 ms long; constant or
 * triangular service of 1-120 s with minS < maxS; servers 1-3; walkSpeedMps 0.5-2; cellSizeM 0.5; routes of 0-3
 * distinct stations. Property P0 asserts that each one passes validateScenario; the filter here tests reachability
 * only, so a validation defect is not hidden by it.
 */

const cellKey = (cell: Cell): string => `${cell[0]},${cell[1]}`;

const service: fc.Arbitrary<Service> = fc.oneof(
  fc.integer({ min: 1, max: 120 }).map((seconds): Service => ({ kind: 'constant', seconds })),
  fc.integer({ min: 1, max: 119 }).chain((minS) =>
    fc.integer({ min: minS + 1, max: 120 }).chain((maxS) =>
      fc.integer({ min: minS, max: maxS }).map((modeS): Service => ({ kind: 'triangular', minS, modeS, maxS })),
    ),
  ),
);

const cohortSpec = fc.record({
  count: fc.integer({ min: 0, max: 20 }),
  arrivals: fc.constantFrom('even' as const, 'uniform' as const),
  startPerMille: fc.integer({ min: 0, max: 900 }),
  spanPerMille: fc.integer({ min: 0, max: 1_000 }),
  route: fc.uniqueArray(fc.integer({ min: 0, max: 2 }), { minLength: 0, maxLength: 3 }),
});

const grid = fc.tuple(fc.integer({ min: 2, max: 8 }), fc.integer({ min: 2, max: 8 }));

function cellIn(cols: number, rows: number): fc.Arbitrary<Cell> {
  return fc.tuple(fc.integer({ min: 0, max: cols - 1 }), fc.integer({ min: 0, max: rows - 1 }));
}

const scenarioCandidate: fc.Arbitrary<Scenario> = grid.chain(([cols, rows]) =>
  fc.integer({ min: 60_000, max: 600_000 }).chain((horizonMs) =>
    fc.record({
      entrance: cellIn(cols, rows),
      exit: cellIn(cols, rows),
      stationCells: fc.array(cellIn(cols, rows), { minLength: 0, maxLength: 3 }),
      stationSpecs: fc.array(fc.record({ service, servers: fc.integer({ min: 1, max: 3 }) }), { minLength: 3, maxLength: 3 }),
      blockedPick: fc.array(cellIn(cols, rows), { maxLength: 6 }),
      cohorts: fc.array(cohortSpec, { minLength: 0, maxLength: 3 }),
      walkSpeedMps: fc.constantFrom(0.5, 0.75, 1, 1.25, 1.5, 2),
      baseSeed: fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), { minLength: 1, maxLength: 8 }).map((chars) => chars.join('')),
    }).map((parts): Scenario => {
      const used = new Set<string>([cellKey(parts.entrance), cellKey(parts.exit), ...parts.stationCells.map(cellKey)]);
      const blockedCells: Cell[] = [];
      for (const cell of parts.blockedPick) {
        const key = cellKey(cell);
        if (!used.has(key)) {
          used.add(key);
          blockedCells.push(cell);
        }
      }
      const stations: Station[] = parts.stationCells.map((cell, i) => ({
        id: `s${i}`,
        label: `Station ${i}`,
        cell,
        servers: parts.stationSpecs[i]!.servers,
        service: parts.stationSpecs[i]!.service,
      }));
      const cohorts: Cohort[] = parts.cohorts.map((spec, i) => {
        const startMs = Math.floor((horizonMs * spec.startPerMille) / 1_000);
        const endMs = Math.min(horizonMs, startMs + 1_000 + Math.floor((horizonMs * spec.spanPerMille) / 1_000));
        return {
          id: `c${i}`,
          startMs,
          endMs,
          count: spec.count,
          arrivals: spec.arrivals,
          route: spec.route.filter((index) => index < stations.length).map((index) => `s${index}`),
        };
      });
      return {
        schemaVersion: 1,
        id: 'property',
        revision: 0,
        title: 'property scenario',
        modelVersion: MODEL_VERSION,
        baseSeed: parts.baseSeed,
        horizonMs,
        layout: { cols, rows, cellSizeM: 0.5, blockedCells, entrance: parts.entrance, exit: parts.exit },
        walkSpeedMps: parts.walkSpeedMps,
        stations,
        cohorts,
        notes: '',
      };
    }),
  ),
);

/** Every node pair is connected and the total attendee count is at most 40. */
function usable(scenario: Scenario): boolean {
  const total = scenario.cohorts.reduce((sum, cohort) => sum + cohort.count, 0);
  return total <= 40 && createPathCache(scenario).unreachable.length === 0;
}

export const validScenario: fc.Arbitrary<Scenario> = scenarioCandidate.filter(usable);
export const replicationIndex: fc.Arbitrary<number> = fc.integer({ min: 0, max: 5 });
export const scenarioAndReplication: fc.Arbitrary<[Scenario, number]> = fc.tuple(validScenario, replicationIndex);

/** A grid, some blocked cells and two unblocked cells for the path-geometry property. */
export const pathCase = grid.chain(([cols, rows]) =>
  fc.record({
    cols: fc.constant(cols),
    rows: fc.constant(rows),
    blockedPick: fc.array(cellIn(cols, rows), { maxLength: 12 }),
    a: cellIn(cols, rows),
    b: cellIn(cols, rows),
  }).map(({ blockedPick, a, b, ...size }) => {
    const free = new Set<string>();
    const blockedCells: Cell[] = [];
    for (const cell of blockedPick) {
      const key = cellKey(cell);
      if (key !== cellKey(a) && key !== cellKey(b) && !free.has(key)) {
        free.add(key);
        blockedCells.push(cell);
      }
    }
    return { ...size, blockedCells, a, b };
  }),
);

/** A scenario with a mutation that property 8 applies to one station, and rotations for property 14. */
export const mutationSpec = fc.record({
  servers: fc.integer({ min: 1, max: 20 }),
  stationPick: fc.nat({ max: 2 }),
  moveX: fc.nat({ max: 7 }),
  moveY: fc.nat({ max: 7 }),
});
export const rotations = fc.record({ stations: fc.nat({ max: 5 }), cohorts: fc.nat({ max: 5 }), blocked: fc.nat({ max: 12 }) });

export const ARBITRARIES = {
  implemented: true,
  validScenario,
  scenarioAndReplication,
  pathCase,
  mutationSpec,
  rotations,
} as const;
