// Result tables (requirements 4.3, 5.2, 9.1; plan section 7). Every number is a MetricValue rendered through the engine's
// formatMetricValue, so an undefined average shows an em dash and a conditioned value shows its mark and note. The tables
// read the stored result, never the canvas, so they work whatever the game view does.
import type { ReactElement } from 'react';
import { formatMetricValue, type MetricValue } from '../../simulation/metrics';
import { STALE_LABEL, resultsStatus } from '../state/selectors';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';
import { populationText } from './format';
import { REPLICATIONS } from '../../comparison/replications';

type Row = { label: string; metric: MetricValue };

const STATION_COLUMNS = ['Station', 'Servers', 'Busy time', 'Utilization', 'Average queue (people)', 'Maximum queue (people)', 'Served (people)'] as const;

/** What replication and the hash mean, in plain words, under the result heading. */
export function resultsPlainText(replication: number): string {
  return 'Replication ' + String(replication) + ' is ' + (replication === 0 ? 'the first' : 'one') + ' simulated run of this plan. Each replication draws its own random arrival and service times, so another one gives other numbers; Compare runs ' + String(REPLICATIONS) + ' of them for each plan. The hash below is the fingerprint of the plan that made these numbers: the same hash in the Assumptions panel means the numbers belong to the plan you see.';
}

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
      <p className="muted column-note">{resultsPlainText(result.replication)}</p>
      <p className="muted">
        {`Model version ${result.modelVersion}, seed ${result.baseSeed}, horizon ${result.horizonMs / 60_000} min, completion ${result.completion}, ${m.admitted} attendees admitted.`}
      </p>
      <p className="muted hash">{`Hash of the scenario that produced these results: ${result.scenarioHash}`}</p>
      {result.completion === 'drain-capped' ? (
        <p>{`${result.unfinished.length} attendees were unfinished at the drain cap; values marked * are conditioned on the attendees who finished.`}</p>
      ) : null}
      <div className="table-scroll">
        <table className="stack">
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
                <td data-label="Value">{formatMetricValue(row.metric)}</td>
                <td data-label="Counted over"><span>{`${populationText(row.metric.population)}, `}<span className="nb">{`n = ${row.metric.n}`}</span></span></td>
                {row.metric.note === null ? <td className="empty-cell" /> : <td data-label="Note">{row.metric.note}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-scroll">
        <table className="stack">
          <caption>Station results</caption>
          <thead>
            <tr>
              {STATION_COLUMNS.map((h) => (
                <th key={h} scope="col">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.stations.map((s) => (
              <tr key={s.id}>
                <th scope="row">{`${labelOf(s.id)} (${s.id})`}</th>
                <td data-label={STATION_COLUMNS[1]}>{s.servers}</td>
                <td data-label={STATION_COLUMNS[2]}>{formatMetricValue(s.busyMs)}</td>
                <td data-label={STATION_COLUMNS[3]}>{formatMetricValue(s.utilization)}</td>
                <td data-label={STATION_COLUMNS[4]}>{formatMetricValue(s.averageQueueLength)}</td>
                <td data-label={STATION_COLUMNS[5]}>{formatMetricValue(s.maxQueueLength)}</td>
                <td data-label={STATION_COLUMNS[6]}>{formatMetricValue(s.served)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
