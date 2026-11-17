import type { Cell, Scenario, Station } from '../../../src/domain/scenario';

const stations: Station[] = Array.from({ length: 10 }, (_, i): Station => ({
  id: `s${i}`,
  label: `Station ${i}`,
  cell: [2 + 3 * (i % 5), 3 + 8 * Math.floor(i / 5)] as Cell,
  servers: 2,
  service: { kind: 'triangular', minS: 5, modeS: 10, maxS: 15 },
}));

/** Ten stations on a 20 × 20 grid, three cohorts of 100 attendees with six-visit routes. Illustrative only. */
export const tenStations: Scenario = {
  schemaVersion: 1,
  id: 'ten-stations',
  revision: 0,
  title: 'Ten stations',
  modelVersion: '0.1.0',
  baseSeed: 'ten-stations',
  horizonMs: 3_600_000,
  layout: { cols: 20, rows: 20, cellSizeM: 0.5, blockedCells: [], entrance: [0, 10], exit: [19, 10] },
  walkSpeedMps: 1.2,
  stations,
  cohorts: [
    { id: 'a', startMs: 0, endMs: 1_800_000, count: 100, arrivals: 'even', route: ['s0', 's1', 's2', 's3', 's4', 's5'] },
    { id: 'b', startMs: 600_000, endMs: 2_400_000, count: 100, arrivals: 'uniform', route: ['s9', 's8', 's7', 's6', 's5', 's4'] },
    { id: 'c', startMs: 0, endMs: 3_000_000, count: 100, arrivals: 'even', route: ['s2', 's4', 's6', 's8', 's1', 's3'] },
  ],
  notes: '',
};

/** The same scenario with one station's servers changed, for a one-edit candidate. */
export const tenStationsPlusOne: Scenario = {
  ...tenStations,
  stations: tenStations.stations.map((station) => (station.id === 's0' ? { ...station, servers: 3 } : station)),
};
