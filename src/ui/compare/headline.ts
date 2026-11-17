// The Compare headline, built from the paired mean queue wait metric only: the size of the mean change in seconds and the
// count of runs from the same metric. Nothing here is typed in; an undefined change has no headline.
import type { Unit } from '../../simulation/metrics';

export type HeadlineMetric = {
  label: string;
  unit: Unit;
  meanChange: number | null;
  improved: number | null;
  worsened: number | null;
  n: number;
  conditioned: boolean;
  note: string | null;
};

export type Headline = { headline: string; detail: string | null; note: string | null };

/** `improved` counts runs where the candidate is lower (the metric's better direction is lower), `worsened` where it is higher. */
export function compareHeadline(metric: HeadlineMetric): Headline | null {
  if (metric.meanChange === null || metric.unit !== 'ms') return null;
  const note = metric.conditioned && metric.note !== null ? `* ${metric.note}` : null;
  if (metric.meanChange === 0) return { headline: `${metric.label} does not change.`, detail: null, note };
  const size = (Math.abs(metric.meanChange) / 1000).toFixed(1);
  const lower = metric.meanChange < 0;
  const runs = lower ? metric.improved : metric.worsened;
  return {
    headline: `${metric.label} ${lower ? 'drops' : 'rises'} by ${size} s.`,
    detail: runs === null ? null : `${lower ? 'Lower' : 'Higher'} in ${runs} of ${metric.n} runs.`,
    note,
  };
}