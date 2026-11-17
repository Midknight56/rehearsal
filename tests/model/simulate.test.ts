import { describe, expect, it } from 'vitest';
import type { Scenario } from '../../src/domain/scenario';
import type { RunResult } from '../../src/simulation/simulate';
import { formatMetricValue } from '../../src/simulation/metrics';
import { ScenarioInvalidError, simulate } from '../../src/simulation/simulate';
import { runOnce } from './helpers/run';
import { scenario } from './helpers/build-scenario';
import { baseline, plusOneCheckin, shorterRoute } from './fixtures/harbor-hall';
import { row1Scenario, row2Scenario, row3Scenario, row7Scenario } from './fixtures/rows';

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

describe('task 10: metrics and completion through simulate, without a trace', () => {
  it('rows 1 to 3 give the hand-calculated metrics', async () => {
    const one = (await runOnce(row1Scenario, 0, false)).metrics;
    expect(one.queueWait.mean.value).toBe(30_000);
    expect(one.queueWait.p95.value).toBe(60_000);
    expect(one.stations[0]?.utilization.value).toBe(1);
    expect(one.queues.averageLength.value).toBeCloseTo(0.5, 12);
    expect(one.queues.maxLength.value).toBe(1);
    expect(one.completedByClosing.value).toBe(3);
    const two = (await runOnce(row2Scenario, 0, false)).metrics;
    expect(two.stations[0]?.utilization.value).toBeCloseTo(0.5, 12);
    expect(two.queueWait.total.value).toBe(0);
    const three = (await runOnce(row3Scenario, 0, false)).metrics;
    expect(three.completedByClosing.value).toBe(3);
    expect(three.queueWait.total.value).toBe(20_000);
  });

  it('result carries no trace when trace is false', async () => {
    expect((await runOnce(row1Scenario, 0, false)).trace).toBeUndefined();
  });

  it('row 7 without a trace is drain-capped with late#0001 unfinished', async () => {
    const result = await runOnce(row7Scenario, 0, false);
    expect(result.completion).toBe('drain-capped');
    expect(result.unfinished).toEqual(['late#0001']);
    expect(result.metrics.journeyTime.mean.conditioned).toBe(true);
  });

  it('Harbor Hall staff-hours and walking means', async () => {
    const base = (await runOnce(baseline, 0, false)).metrics;
    const plus = (await runOnce(plusOneCheckin, 0, false)).metrics;
    const shorter = (await runOnce(shorterRoute, 0, false)).metrics;
    expect(formatMetricValue(base.staffHours)).toBe('2.00 h');
    expect(formatMetricValue(plus.staffHours)).toBe('2.67 h');
    expect(base.walkingTime.mean.value).toBe(31_667);
    expect(shorter.walkingTime.mean.value).toBe(15_001);
  });

  it('an invalid scenario throws ScenarioInvalidError with its issues', () => {
    const bad = scenario({ horizonMs: 0 });
    try {
      simulate(bad, 0, { trace: false, scenarioHash: 'x' });
      expect.unreachable('simulate should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ScenarioInvalidError);
      expect((error as ScenarioInvalidError).issues.map((issue) => issue.code)).toContain('HORIZON_RANGE');
    }
  });

  it('an exit exactly at the drain cap is applied; one millisecond later is not', async () => {
    const one = (seconds: number) => scenario({
      horizonMs: 60_000,
      stations: [{ id: 's', label: 'Station', cell: [0, 0], servers: 1, service: { kind: 'constant', seconds } }],
      cohorts: [{ id: 'x', startMs: 0, endMs: 1, count: 1, arrivals: 'even', route: ['s'] }],
    });
    const exact = await runOnce(one(7_260), 0, false);
    expect(exact.completion).toBe('complete');
    expect(exact.unfinished).toEqual([]);
    const late = await runOnce(one(7_260.001), 0, false);
    expect(late.completion).toBe('drain-capped');
    expect(late.unfinished).toEqual(['x#0000']);
  });
});
