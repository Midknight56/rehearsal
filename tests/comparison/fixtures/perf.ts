import type { Scenario } from '../../../src/domain/scenario';
import { baseline } from '../../model/fixtures/harbor-hall';

/** Harbor Hall baseline with `count` attendees; 5,000 attendees also get 20 servers at both stations so the drain completes. */
export function perfScenario(count: number): Scenario {
  const big = count >= 5_000;
  return {
    ...baseline,
    id: `perf-${count}`,
    stations: baseline.stations.map((station) => (big ? { ...station, servers: 20 } : station)),
    cohorts: baseline.cohorts.map((cohort) => (cohort.id === 'doors' ? { ...cohort, count } : cohort)),
  };
}
