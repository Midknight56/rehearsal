// One paired metric (requirement 12.2). Every number and sentence comes from the Comparison and src/comparison/labels.ts.
import type { ReactElement } from 'react';
import { RANGE_LABEL, countSentence } from '../../comparison/labels';
import { formatChange, formatMean } from '../../comparison/paired';
import { NoBreak } from '../noBreak';
import type { CompareView } from './view';

type Metric = CompareView['metrics'][number];
const star = (m: Metric): string => (m.conditioned ? '*' : '');

/** Width of a thin comparison bar: this mean as a share of the larger of the two means (nothing when it is undefined or both are 0). */
function barWidth(value: number | null, metric: Metric): string {
  const top = Math.max(Math.abs(metric.baselineMean ?? 0), Math.abs(metric.candidateMean ?? 0));
  return value === null || top === 0 ? '0%' : `${(Math.abs(value) / top) * 100}%`;
}

/** True when the paired mean change moves in the metric's better direction. */
function improvedDirection(metric: Metric): boolean {
  if (metric.meanChange === null || metric.meanChange === 0) return false;
  return metric.betterDirection === 'lower' ? metric.meanChange < 0 : metric.betterDirection === 'higher' ? metric.meanChange > 0 : false;
}

export function MetricCard({ metric, view }: { metric: Metric; view: CompareView }): ReactElement {
  const runs = countSentence({
    direction: metric.betterDirection,
    metricLabel: metric.label.toLowerCase(),
    improved: metric.improved,
    n: metric.n,
    languageMode: view.languageMode,
    baselineCount: view.population.baselineCount,
    candidateCount: view.population.candidateCount,
  });
  return (
    <article className={metric.key === 'queueWait.mean' ? 'metric-card highlight' : 'metric-card'} data-testid={`metric-card-${metric.key}`} aria-label={metric.label}>
      <h4>{metric.label}</h4>
      <p>
        {'Mean change: '}
        <strong data-field="mean-change" className={improvedDirection(metric) ? 'better' : undefined}>{formatChange(metric.meanChange, metric.unit)}</strong>
        {star(metric)}
      </p>
      <p data-field="range"><NoBreak text={`${formatChange(metric.rangeP10, metric.unit)} to ${formatChange(metric.rangeP90, metric.unit)}, ${RANGE_LABEL}`} /></p>
      <p data-field="runs"><NoBreak text={runs} /></p>
      <div className="bars" aria-hidden="true">
        <span className="bar bar-baseline" style={{ width: barWidth(metric.baselineMean, metric) }} />
        <span className="bar bar-candidate" style={{ width: barWidth(metric.candidateMean, metric) }} />
      </div>
      <p className="muted">
        <NoBreak text={`Baseline ${formatMean(metric.baselineMean, metric.unit)}${star(metric)} \u00b7 Candidate ${formatMean(metric.candidateMean, metric.unit)}${star(metric)} \u00b7 n = ${metric.n}`} />
      </p>
      {metric.conditioned && metric.note !== null ? <p className="muted"><NoBreak text={`* ${metric.note}`} /></p> : null}
    </article>
  );
}