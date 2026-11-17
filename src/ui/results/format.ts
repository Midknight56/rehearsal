// Result formatting (requirement 9.1, plan section 7). Every MetricValue goes through the engine's formatMetricValue;
// this file adds only the labels around it and the trace timestamp.
import type { Population } from '../../simulation/metrics';

/** Trace timestamps only: 'mm:ss.mmm' from integer milliseconds. One implementation, shared with the replay sampler. */
export { formatTimestamp } from '../../replay/format';

/** The population a metric is computed over, in words. */
export function populationText(population: Population): string {
  switch (population) {
    case 'admitted':
      return 'admitted attendees';
    case 'completedJourney':
      return 'attendees who completed the journey';
    case 'closingWindow':
      return 'attendees admitted by closing';
  }
}
