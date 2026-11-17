// Result tables (requirements 4.3, 5.2, 9.1; plan section 7). Every number is a MetricValue rendered through the engine's
// formatMetricValue, so an undefined average shows an em dash and a conditioned value shows its mark and note. The tables
// read the stored result, never the canvas, so they work whatever the game view does.
import type { ReactElement } from 'react';
import { formatMetricValue, type MetricValue } from '../../simulation/metrics';
import { STALE_LABEL, resultsStatus } from '../state/selectors';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';
import { populationText } from './format';

type Row = { label: string; metric: MetricValue };

export function ResultTables({ store }: { store: EditorStore }): ReactElement {
  const state = useEditorState(store);
  const results = state.results[state.currentIndex];
  const status = resultsStatus(state, state.currentIndex);

  if (results === undefined || results.status === 'none') {
    return (
      <div>
        <h2>Results</h2>
        <p className="muted">No results yet. Activate Simulate to run replication 0.</p>
      </div>
    );
  }

  const { result, snapshot } = results;
  const m = result.metrics;
  const rows: Row[] = [
    { label: 'Completed by closing', metric: m.completedByClosing },
    { label: 'Active at closing, total', metric: m.activeAtClosing.total },
    { label: 'Active at closing, walking', metric: m.activeAtClosing.walking },
    { label: 'Active at closing, waiting', metric: m.activeAtClosing.waiting },
    { label: 'Active at closing, in service', metric: m.activeAtClosing.inService },
    { label: 'Queue wait, total', metric: m.queueWait.total },
    { label: 'Queue wait, mean', metric: m.queueWait.mean },
    { label: 'Queue wait, 95th percentile', metric: m.queueWait.p95 },
    { label: 'Journey time, mean', metric: m.journeyTime.mean },
    { label: 'Journey time, 95th percentile', metric: m.journeyTime.p95 },
    { label: 'Walking time, mean', metric: m.walkingTime.mean },
    { label: 'Queue length, average over the window (people)', metric: m.queues.averageLength },
    { label: 'Queue length, maximum (people)', metric: m.queues.maxLength },
    { label: 'Staff-hours', metric: m.staffHours },
  ];
  const labelOf = (id: string): string => snapshot.stations.find((s) => s.id === id)?.label ?? id;

  return (
    <div>
      <h2>Results</h2>
      <p>
        {status === 'stale' ? <strong>{STALE_LABEL}</strong> : null}
        {status === 'stale' ? ' ' : null}
        <span>Replication {result.replication}, one example run of the scenario as it was when Simulate was activated.</span>
      </p>
      <p className="muted">
        {`Model version ${result.modelVersion}, seed ${result.baseSeed}, horizon ${result.horizonMs / 60_000} min, completion ${result.completion}, ${m.admitted} attendees admitted.`}
      </p>
      <p className="muted hash">{`Hash of the scenario that produced these results: ${result.scenarioHash}`}</p>
      {result.completion === 'drain-capped' ? (
        <p>{`${result.unfinished.length} attendees were unfinished at the drain cap; values marked * are conditioned on the attendees who finished.`}</p>
      ) : null}
      <div className="table-scroll">
        <table>
          <caption>Result metrics</caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Value</th>
              <th scope="col">Counted over</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{formatMetricValue(row.metric)}</td>
                <td>{`${populationText(row.metric.population)}, n = ${row.metric.n}`}</td>
                <td>{row.metric.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-scroll">
        <table>
          <caption>Station results</caption>
          <thead>
            <tr>
              {['Station', 'Servers', 'Busy time', 'Utilization', 'Average queue (people)', 'Maximum queue (people)', 'Served (people)'].map((h) => (
                <th key={h} scope="col">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.stations.map((s) => (
              <tr key={s.id}>
                <th scope="row">{`${labelOf(s.id)} (${s.id})`}</th>
                <td>{s.servers}</td>
                <td>{formatMetricValue(s.busyMs)}</td>
                <td>{formatMetricValue(s.utilization)}</td>
                <td>{formatMetricValue(s.averageQueueLength)}</td>
                <td>{formatMetricValue(s.maxQueueLength)}</td>
                <td>{formatMetricValue(s.served)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
