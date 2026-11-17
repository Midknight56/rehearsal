// One paired metric (requirement 12.2). Every number and sentence comes from the Comparison and src/comparison/labels.ts.
import type { ReactElement } from 'react';
import { RANGE_LABEL, countSentence } from '../../comparison/labels';
import { formatChange, formatMean } from '../../comparison/paired';
import type { CompareView } from './view';

type Metric = CompareView['metrics'][number];
const star = (m: Metric): string => (m.conditioned ? '*' : '');

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
    <article className="metric-card" data-testid={`metric-card-${metric.key}`} aria-label={metric.label}>
      <h4>{metric.label}</h4>
      <p>
        {'Mean change: '}
        <strong data-field="mean-change">{formatChange(metric.meanChange, metric.unit)}</strong>
        {star(metric)}
      </p>
      <p data-field="range">{`${formatChange(metric.rangeP10, metric.unit)} to ${formatChange(metric.rangeP90, metric.unit)}, ${RANGE_LABEL}`}</p>
      <p data-field="runs">{runs}</p>
      <p className="muted">
        {`Baseline ${formatMean(metric.baselineMean, metric.unit)}${star(metric)} \u00b7 Candidate ${formatMean(metric.candidateMean, metric.unit)}${star(metric)} \u00b7 n = ${metric.n}`}
      </p>
      {metric.conditioned && metric.note !== null ? <p className="muted">{`* ${metric.note}`}</p> : null}
    </article>
  );
}