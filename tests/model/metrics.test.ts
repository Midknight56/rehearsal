import { describe, expect, it } from 'vitest';
import type { Scenario } from '../../src/domain/scenario';
import { toDurationMs } from '../../src/domain/validate';
import { compileAttendees } from '../../src/simulation/arrivals';
import { computeMetrics, formatMetricValue, p95Index, percentile95, type MetricValue } from '../../src/simulation/metrics';
import { runSchedule, type ScheduleInput, type ScheduleOutput } from '../../src/simulation/scheduler';
import { createPathCache } from '../../src/spatial/path-cache';
import { row1Schedule, row1Scenario, row2Schedule, row2Scenario, row6Scenario, row7Scenario } from './fixtures/rows';

const metric = (value: number | null, unit: MetricValue['unit'], conditioned = false): MetricValue => ({
  value, unit, population: 'admitted', n: value === null ? 0 : 1, conditioned, note: conditioned ? 'note' : null,
});

describe('rows 7.3 and 7.5: percentile index and formatting', () => {
  it('p95Index is ceil(0.95 n) - 1', () => {
    expect([p95Index(20), p95Index(1), p95Index(3)]).toEqual([18, 0, 2]);
  });

  it('percentile95 of nothing is null; otherwise the sorted element', () => {
    expect(percentile95([])).toBeNull();
    expect(percentile95([5, 1, 3])).toBe(5);
    expect(percentile95(Array.from({ length: 20 }, (_, i) => 20 - i))).toBe(19);
  });

  it('formats each unit', () => {
    expect(formatMetricValue(metric(null, 'ms'))).toBe('—');
    expect(formatMetricValue(metric(30_000, 'ms'))).toBe('30.0 s');
    expect(formatMetricValue(metric(1, 'ratio'))).toBe('100.0%');
    expect(formatMetricValue(metric(2, 'hours'))).toBe('2.00 h');
    expect(formatMetricValue(metric(8 / 3, 'hours'))).toBe('2.67 h');
    expect(formatMetricValue(metric(3, 'count'))).toBe('3');
    expect(formatMetricValue(metric(3, 'people'))).toBe('3');
  });

  it('appends one asterisk to a conditioned value', () => {
    expect(formatMetricValue(metric(30_000, 'ms', true))).toBe('30.0 s*');
  });
});

/** A ScheduleInput for a one-station row scenario: constant service, zero walking, no simulate needed. */
function scheduleOf(input: Scenario): ScheduleInput {
  const station = input.stations[0]!;
  const serviceMs = station.service.kind === 'constant' ? toDurationMs(station.service.seconds) : 0;
  return {
    attendees: compileAttendees(input, 0),
    stations: [{ id: station.id, servers: station.servers, serviceMs: () => serviceMs }],
    travel: () => ({ pathId: 0, durationMs: 0 }),
    horizonMs: input.horizonMs,
    drainCapMs: 7_200_000,
    trace: false,
  };
}

const metricsOf = (out: ScheduleOutput, input: Scenario) => computeMetrics(out, input, createPathCache(input));

describe('rows 1, 2, 6, 7 and 11: metrics over runSchedule output', () => {
  it('row 1: wait, utilization and queue figures', () => {
    const m = metricsOf(runSchedule(row1Schedule), row1Scenario);
    expect(m.queueWait.mean.value).toBe(30_000);
    expect(m.queueWait.p95.value).toBe(60_000);
    expect(m.stations[0]?.utilization.value).toBe(1);
    expect(m.queues.averageLength.value).toBeCloseTo(0.5, 12);
    expect(m.queues.maxLength.value).toBe(1);
    expect(m.completedByClosing.value).toBe(3);
  });

  it('row 2: half utilization and no waiting', () => {
    const m = metricsOf(runSchedule(row2Schedule), row2Scenario);
    expect(m.stations[0]?.utilization.value).toBeCloseTo(0.5, 12);
    expect(m.queueWait.total.value).toBe(0);
    expect(m.queueWait.p95.value).toBe(0);
  });

  it('row 6: service past closing is clipped to the window', () => {
    const m = metricsOf(runSchedule(scheduleOf(row6Scenario)), row6Scenario);
    expect(m.stations[0]?.busyMs.value).toBe(60_000);
    expect(m.completedByClosing.value).toBe(0);
    expect(m.activeAtClosing.inService.value).toBe(1);
    expect(m.journeyTime.mean.n).toBe(1);
    expect(m.journeyTime.mean.conditioned).toBe(false);
  });

  it('row 7: drain-capped runs mark completed-journey metrics as conditioned', () => {
    const out = runSchedule(scheduleOf(row7Scenario));
    expect(out.completion).toBe('drain-capped');
    const m = metricsOf(out, row7Scenario);
    for (const metric of [m.queueWait.total, m.queueWait.mean, m.queueWait.p95, m.journeyTime.mean, m.journeyTime.p95]) {
      expect(metric.conditioned).toBe(true);
      expect(metric.n).toBe(1);
      expect(metric.note).toBe('from 1 of 2 admitted attendees; 1 unfinished at the drain cap');
    }
    expect(m.walkingTime.mean.conditioned).toBe(false);
  });

  it('row 11: an empty schedule gives nulls, zero utilization and defined staff-hours', () => {
    const empty: Scenario = { ...row1Scenario, cohorts: [] };
    const m = metricsOf(runSchedule({ ...scheduleOf(empty), attendees: [] }), empty);
    expect(m.admitted).toBe(0);
    for (const metric of [m.queueWait.total, m.queueWait.mean, m.queueWait.p95, m.journeyTime.mean, m.journeyTime.p95, m.walkingTime.mean]) {
      expect(metric.value).toBeNull();
      expect(metric.n).toBe(0);
      expect(formatMetricValue(metric)).toBe('—');
    }
    expect(m.stations[0]?.utilization.value).toBe(0);
    expect(m.staffHours.value).toBeCloseTo(180_000 / 3_600_000, 12);
  });
});
