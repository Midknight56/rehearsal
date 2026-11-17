// People waiting, minute by minute: the number of attendees waiting in a line at each whole simulated minute, read through
// sampleAt so it agrees with the canvas, the tables and the queue inspector. Display only.
import { formatMinutesSeconds } from './format';
import { sampleAt } from './sampler';
import type { TraceIndex } from './traceIndex';

const MINUTE_MS = 60_000;

/** One value per simulated minute from 0 to the last event of the trace. */
export function waitingPerMinute(index: TraceIndex, endMs: number = index.endMs): number[] {
  const minutes = Math.floor(endMs / MINUTE_MS) + 1;
  return Array.from({ length: minutes }, (_, minute) => {
    const sample = sampleAt(index, minute * MINUTE_MS);
    return Object.values(sample.perStation).reduce((total, station) => total + station.waiting, 0);
  });
}

/** The text alternative of the chart: the peak and the last minute, from the same numbers. */
export function waitingSummary(series: number[]): string {
  const peak = Math.max(0, ...series);
  if (peak === 0) return 'Nobody is waiting at any simulated minute.';
  const at = series.indexOf(peak);
  const last = series.length - 1;
  return `Most people waiting: ${peak}, at ${formatMinutesSeconds(at * MINUTE_MS)}. Waiting at ${formatMinutesSeconds(last * MINUTE_MS)}: ${series[last]}.`;
}