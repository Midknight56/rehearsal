import { describe, expect, it } from 'vitest';
import { formatMetricValue, p95Index, percentile95, type MetricValue } from '../../src/simulation/metrics';

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