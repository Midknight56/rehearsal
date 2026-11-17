import type { Cell, Scenario } from '../../../src/domain/scenario';
import { baseline, plusOneCheckin, shorterRoute } from '../../model/fixtures/harbor-hall';
import { row1Scenario, row2Scenario } from '../../model/fixtures/rows';

export const rowOnePair: { baseline: Scenario; candidate: Scenario } = { baseline: row1Scenario, candidate: row2Scenario };
export const harborPlusOne: { baseline: Scenario; candidate: Scenario } = { baseline, candidate: plusOneCheckin };
export const harborShorter: { baseline: Scenario; candidate: Scenario } = { baseline, candidate: shorterRoute };

/** Baseline with 130 attendees in the doors cohort instead of 120. */
export const population130: Scenario = {
  ...baseline,
  cohorts: baseline.cohorts.map((cohort) => (cohort.id === 'doors' ? { ...cohort, count: 130 } : cohort)),
};

/** Baseline with the cohort id `gate` instead of `doors`. */
export const renamedCohort: Scenario = {
  ...baseline,
  cohorts: baseline.cohorts.map((cohort) => (cohort.id === 'doors' ? { ...cohort, id: 'gate' } : cohort)),
};

/** Baseline with both the servers change and the position change. */
export const combined: Scenario = {
  ...baseline,
  stations: baseline.stations.map((station) => {
    if (station.id === 'checkin') return { ...station, servers: 2 };
    if (station.id === 'packs') return { ...station, cell: [14, 8] as Cell };
    return station;
  }),
};

export { baseline, plusOneCheckin, shorterRoute };
