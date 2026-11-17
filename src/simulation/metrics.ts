import type { Scenario } from '../domain/scenario';
import type { PathCache } from '../spatial/path-cache';
import type { ScheduleOutput } from './scheduler';
function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}
export type Unit = 'count' | 'ms' | 'ratio' | 'people' | 'hours';
export type Population = 'admitted' | 'completedJourney' | 'closingWindow';
export type MetricValue = { value: number | null; unit: Unit; population: Population; n: number; conditioned: boolean; note: string | null };
export type StationMetrics = {
  id: string; servers: number;
  busyMs: MetricValue; utilization: MetricValue; averageQueueLength: MetricValue; maxQueueLength: MetricValue; served: MetricValue;
};
export type Metrics = {
  horizonMs: number; admitted: number;
  completedByClosing: MetricValue;
  activeAtClosing: { total: MetricValue; walking: MetricValue; waiting: MetricValue; inService: MetricValue };
  queueWait: { total: MetricValue; mean: MetricValue; p95: MetricValue };
  journeyTime: { mean: MetricValue; p95: MetricValue };
  walkingTime: { mean: MetricValue };
  queues: { averageLength: MetricValue; maxLength: MetricValue };
  stations: StationMetrics[];
  staffHours: MetricValue;
};

export function computeMetrics(out: ScheduleOutput, scenario: Scenario, cache: PathCache): Metrics {
  return notImplemented('computeMetrics');
}

export function p95Index(n: number): number {
  return notImplemented('p95Index');
}

export function percentile95(values: number[]): number | null {
  return notImplemented('percentile95');
}

export function formatMetricValue(m: MetricValue): string {
  return notImplemented('formatMetricValue');
}