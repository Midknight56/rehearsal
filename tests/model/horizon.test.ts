import { describe, expect, it } from 'vitest';
import { runOnce } from './helpers/run';
import { row6Scenario, row7Scenario } from './fixtures/rows';

describe('row 6: service still running at the closing time', () => {
  it('counts busy time to H, one person in service, journey n 1', async () => {
    const result = await runOnce(row6Scenario, 0, true);
    const m = result.metrics;
    expect(m.stations[0]?.busyMs.value).toBe(60_000);
    expect(m.stations[0]?.utilization.value).toBe(1);
    expect(m.completedByClosing.value).toBe(0);
    expect(m.activeAtClosing.inService.value).toBe(1);
    expect(m.journeyTime.mean.n).toBe(1);
    expect(result.completion).toBe('complete');
  });
});

describe('row 7: drain cap', () => {
  it('arrivals at 15,000 and 45,000; one unfinished; conditioned metrics; cap event', async () => {
    const result = await runOnce(row7Scenario, 0, true);
    const arrivals = (result.trace?.events ?? []).filter((e) => e.kind === 'arrive').map((e) => e.timeMs);
    expect(arrivals).toEqual([15_000, 45_000]);
    expect(result.completion).toBe('drain-capped');
    expect(result.unfinished).toEqual(['late#0001']);
    for (const metric of [result.metrics.queueWait.mean, result.metrics.queueWait.p95, result.metrics.queueWait.total, result.metrics.journeyTime.mean, result.metrics.journeyTime.p95]) {
      expect(metric.conditioned).toBe(true);
      expect(metric.n).toBe(1);
    }
    const last = result.trace?.events[(result.trace?.events.length ?? 1) - 1];
    expect(last).toMatchObject({ kind: 'cap', timeMs: 7_260_000 });
  });
});