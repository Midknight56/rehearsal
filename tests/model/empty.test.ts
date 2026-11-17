import { describe, expect, it } from 'vitest';
import type { Scenario } from '../../src/domain/scenario';
import { formatMetricValue } from '../../src/simulation/metrics';
import { runOnce } from './helpers/run';
import { scenario } from './helpers/build-scenario';

const station = { id: 's', label: 'Station', cell: [0, 0] as [number, number], servers: 2, service: { kind: 'constant' as const, seconds: 10 } };

async function check(input: Scenario) {
  const { metrics } = await runOnce(input, 0, false);
  expect(metrics.admitted).toBe(0);
  expect(metrics.completedByClosing.value).toBe(0);
  for (const metric of [metrics.queueWait.total, metrics.queueWait.mean, metrics.queueWait.p95, metrics.journeyTime.mean, metrics.journeyTime.p95, metrics.walkingTime.mean]) {
    expect(metric.value).toBeNull();
    expect(metric.n).toBe(0);
    expect(formatMetricValue(metric)).toBe('n/a');
  }
  expect(metrics.stations[0]?.utilization.value).toBe(0);
  expect(metrics.staffHours.value).toBeCloseTo((2 * 180_000) / 3_600_000, 12);
}

describe('row 11: nothing to measure', () => {
  it('a scenario with no cohorts', async () => {
    await check(scenario({ stations: [station] }));
  });

  it('a cohort with count 0', async () => {
    await check(scenario({ stations: [station], cohorts: [{ id: 'none', startMs: 0, endMs: 1_000, count: 0, arrivals: 'even', route: ['s'] }] }));
  });
});