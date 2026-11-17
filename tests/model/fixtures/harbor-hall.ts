import type { Cell, Scenario } from '../../../src/domain/scenario';

/*
 * The Harbor Hall Community Fair fixtures of plan section 5. Fictional and illustrative: the 120 attendees and the
 * 8/15/22 s and 6/10/14 s service assumptions are not measured. modelVersion is written literally ('0.1.0', the value of
 * MODEL_VERSION) so these hash-equal the files of public/examples/harbor-hall/.
 */

const blockedCells: Cell[] = [];
for (let x = 16; x <= 23; x += 1) {
  for (let y = 20; y <= 23; y += 1) blockedCells.push([x, y]);
}

export const baseline: Scenario = {
  schemaVersion: 1,
  id: 'harbor-hall-baseline',
  revision: 0,
  title: 'Harbor Hall Community Fair: baseline',
  modelVersion: '0.1.0',
  baseSeed: 'harbor-hall-2026',
  horizonMs: 2_400_000,
  layout: { cols: 40, rows: 24, cellSizeM: 0.5, blockedCells, entrance: [0, 12], exit: [0, 4] },
  walkSpeedMps: 1.2,
  stations: [
    { id: 'checkin', label: 'Check-in desk', cell: [10, 12], servers: 1, service: { kind: 'triangular', minS: 8, modeS: 15, maxS: 22 } },
    { id: 'packs', label: 'Welcome packs', cell: [34, 12], servers: 2, service: { kind: 'triangular', minS: 6, modeS: 10, maxS: 14 } },
  ],
  cohorts: [{ id: 'doors', startMs: 0, endMs: 1_200_000, count: 120, arrivals: 'uniform', route: ['checkin', 'packs'] }],
  notes: 'Fictional and illustrative.',
};

export const plusOneCheckin: Scenario = {
  ...baseline,
  id: 'harbor-hall-plus-one-checkin',
  title: 'Harbor Hall Community Fair: extra check-in staff',
  stations: baseline.stations.map((station) => (station.id === 'checkin' ? { ...station, servers: 2 } : station)),
};

export const shorterRoute: Scenario = {
  ...baseline,
  id: 'harbor-hall-shorter-route',
  title: 'Harbor Hall Community Fair: shorter walking route',
  stations: baseline.stations.map((station) => (station.id === 'packs' ? { ...station, cell: [14, 8] as Cell } : station)),
};

export const harborHall = { baseline, 'plus-one-checkin': plusOneCheckin, 'shorter-route': shorterRoute } as const;