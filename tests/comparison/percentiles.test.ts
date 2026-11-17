import { describe, expect, it } from 'vitest';
import { percentile, percentileIndex } from '../../src/comparison/percentiles';
import { METRIC_KEYS, STATION_METRIC_KEYS, readMetric, readStationMetric } from '../../src/comparison/metric-keys';
import { formatChange, formatMean } from '../../src/comparison/paired';
import { p95Index } from '../../src/simulation/metrics';
import { runOnce } from '../model/helpers/run';
import { baseline } from '../model/fixtures/harbor-hall';

describe('percentileIndex (matrix row 26)', () => {
  it('gives the hand-calculated indices', () => {
    expect(percentileIndex(0.95, 20)).toBe(18);
    expect(percentileIndex(0.95, 1)).toBe(0);
    expect(percentileIndex(0.10, 30)).toBe(2);
    expect(percentileIndex(0.90, 30)).toBe(26);
    expect(percentileIndex(0.10, 1)).toBe(0);
    expect(percentileIndex(0.90, 1)).toBe(0);
  });

  it('equals the engine p95Index for n = 1 to 5,000', () => {
    for (let n = 1; n <= 5_000; n += 1) expect(percentileIndex(0.95, n)).toBe(p95Index(n));
  });

  it('picks observed elements and gives null for an empty array', () => {
    const sorted = Array.from({ length: 30 }, (_, i) => i * 10);
    expect(percentile(sorted, 0.1)).toBe(20);
    expect(percentile(sorted, 0.9)).toBe(260);
    expect(percentile([5], 0.9)).toBe(5);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe('formatChange and formatMean', () => {
  it('formats each unit with an ASCII sign', () => {
    expect(formatChange(-30_000, 'ms')).toBe('-30.0 s');
    expect(formatChange(1_500, 'ms')).toBe('+1.5 s');
    expect(formatChange(3, 'count')).toBe('+3');
    expect(formatChange(-2, 'people')).toBe('-2');
    expect(formatChange(-0.5, 'people')).toBe('-0.5');
    expect(formatChange(-0.5, 'ratio')).toBe('-50.0 percentage points');
    expect(formatChange(0.05, 'hours')).toBe('+0.05 h');
  });

  it('marks an exact zero and maps null to an em dash', () => {
    expect(formatChange(0, 'ms')).toBe('0.0 s (no change)');
    expect(formatChange(0, 'count')).toBe('0 (no change)');
    expect(formatChange(0, 'ratio')).toBe('0.0 percentage points (no change)');
    expect(formatChange(0, 'hours')).toBe('0.00 h (no change)');
    expect(formatChange(null, 'count')).toBe('n/a');
    expect(formatMean(null, 'ms')).toBe('n/a');
    expect(formatMean(30_000, 'ms')).toBe('30.0 s');
    expect(formatMean(0.5, 'ratio')).toBe('50.0%');
    expect(formatMean(2, 'hours')).toBe('2.00 h');
  });
});

describe('metric keys', () => {
  it('has 11 global rows and 4 station rows with the none directions', () => {
    expect(METRIC_KEYS).toHaveLength(11);
    expect(METRIC_KEYS.find((m) => m.key === 'staffHours')?.direction).toBe('none');
    expect(METRIC_KEYS.find((m) => m.key === 'completedByClosing')?.direction).toBe('higher');
    expect(METRIC_KEYS.find((m) => m.key === 'queueWait.mean')).toMatchObject({ label: 'Mean queue wait', direction: 'lower' });
    expect(METRIC_KEYS.filter((m) => m.direction === 'none')).toHaveLength(1);
    expect(STATION_METRIC_KEYS).toHaveLength(4);
    expect(STATION_METRIC_KEYS.find((m) => m.key === 'utilization')?.direction).toBe('none');
    expect(STATION_METRIC_KEYS.find((m) => m.key === 'served')?.direction).toBe('higher');
  });

  it('reads every key from real metrics and returns null for an absent station', async () => {
    const { metrics } = await runOnce(baseline, 0, false);
    for (const { key } of METRIC_KEYS) expect(readMetric(metrics, key)).toBeDefined();
    expect(readMetric(metrics, 'queueWait.mean')).toBe(metrics.queueWait.mean);
    expect(readMetric(metrics, 'activeAtClosing.total')).toBe(metrics.activeAtClosing.total);
    expect(readMetric(metrics, 'queues.maxLength')).toBe(metrics.queues.maxLength);
    expect(readMetric(metrics, 'staffHours')).toBe(metrics.staffHours);
    expect(readStationMetric(metrics, 'checkin', 'utilization')).toBe(metrics.stations.find((s) => s.id === 'checkin')?.utilization);
    expect(readStationMetric(metrics, 'nope', 'served')).toBeNull();
  });
});
