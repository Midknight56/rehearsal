import { MODEL_VERSION } from '../simulation/version';

// The eight lines of src/ui/plan/AssumptionsPanel.tsx; tests/comparison/assumptions-text.test.ts fails when the two differ.
export const ASSUMPTIONS: readonly string[] = [
  'One station is one service stage: a single FIFO line feeding identical parallel servers.',
  'A cohort follows its ordered station IDs, each at most once, then exits.',
  'Staffing is constant through a run.',
  'Queue capacity is unlimited and nobody leaves early.',
  'Walking is at one constant speed along the computed grid path.',
  'Service durations are constant or triangular.',
  'No personal space, congestion-dependent walking speed, doorway throughput, accessibility clearance, crowd pressure or collisions: queue sprites never block movement.',
  'The output of a run is a scenario result under these assumptions for one seed and one replication: scenario results, not a forecast.',
];

export const LIMITS_TEXT =
  'Limits: at most 5,000 attendees, 10 stations, 6 station visits per route, 80 × 80 cells, a 360-minute observation window, servers 1–20, 10 saved scenarios, a 2 MiB import file.';

export const NOT_A_FORECAST = 'Scenario results, not a forecast.';

export const FORBIDDEN_BADGE_WORDS: readonly string[] = ['optimized', 'optimised', 'optimal', 'safe', 'certified', 'recommended'];

export function modelVersionLine(version?: string): string {
  return `Model version ${version ?? MODEL_VERSION}`;
}
