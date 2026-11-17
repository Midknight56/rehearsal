import { describe, expect, it } from 'vitest';
import type { Scenario } from '../../src/domain/scenario';
import type { RunResult } from '../../src/simulation/simulate';
import { runOnce } from './helpers/run';
import { row1Scenario, row2Scenario, row3Scenario } from './fixtures/rows';

async function trace(input: Scenario) {
  const result: RunResult = await runOnce(input, 0, true);
  const events = result.trace?.events ?? [];
  const starts = events.filter((e) => e.kind === 'start').map((e) => e.timeMs);
  const exits = events.filter((e) => e.kind === 'exit').map((e) => e.timeMs);
  return { result, starts, exits, events };
}

describe('rows 1 to 3 through simulate', () => {
  it('row 1: starts, exits and metrics', async () => {
    const { result, starts, exits } = await trace(row1Scenario);
    expect(starts).toEqual([0, 60_000, 120_000]);
    expect(exits).toEqual([60_000, 120_000, 180_000]);
    const m = result.metrics;
    expect(m.queueWait.mean.value).toBe(30_000);
    expect(m.queueWait.p95.value).toBe(60_000);
    expect(m.stations[0]?.utilization.value).toBe(1);
    expect(m.queues.averageLength.value).toBeCloseTo(0.5, 12);
    expect(m.queues.maxLength.value).toBe(1);
    expect(m.completedByClosing.value).toBe(3);
  });

  it('row 2: two servers', async () => {
    const { result, starts, exits } = await trace(row2Scenario);
    expect(starts).toEqual([0, 30_000, 60_000]);
    expect(exits).toEqual([60_000, 90_000, 120_000]);
    expect(result.metrics.stations[0]?.utilization.value).toBeCloseTo(0.5, 12);
    expect(result.metrics.completedByClosing.value).toBe(3);
  });

  it('row 3: equal-time arrivals are served in attendee id order', async () => {
    const { starts, events } = await trace(row3Scenario);
    expect(starts).toEqual([0, 10_000, 20_000]);
    const order = events.filter((e) => e.kind === 'start').map((e) => ('attendeeId' in e ? e.attendeeId : ''));
    expect(order).toEqual(['a#0000', 'a#0001', 'c#0000']);
  });
});