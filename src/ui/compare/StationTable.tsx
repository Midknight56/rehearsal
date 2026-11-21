// One row per station metric (requirement 12.2): the two means and the paired mean change, in display units.
import type { ReactElement } from 'react';
import { formatChange, formatMean } from '../../comparison/paired';
import type { CompareView } from './view';

const PRESENCE = { both: '', 'baseline-only': ' (baseline only)', 'candidate-only': ' (candidate only)' } as const;

export function StationTable({ view }: { view: CompareView }): ReactElement {
  return (
    <div className="table-scroll">
      <table className="stack">
        <caption>Stations compared</caption>
        <thead>
          <tr>
            <th scope="col">Station</th>
            <th scope="col">Metric</th>
            <th scope="col">Baseline mean</th>
            <th scope="col">Candidate mean</th>
            <th scope="col">Mean change</th>
          </tr>
        </thead>
        <tbody>
          {view.stations.flatMap((station) =>
            station.metrics.map((m) => (
              <tr key={m.key}>
                <th scope="row">{`${station.label}${PRESENCE[station.presence]}`}</th>
                <td data-label="Metric">{m.label}</td>
                <td data-label="Baseline mean">{`${formatMean(m.baselineMean, m.unit)}${m.conditioned ? '*' : ''}`}</td>
                <td data-label="Candidate mean">{`${formatMean(m.candidateMean, m.unit)}${m.conditioned ? '*' : ''}`}</td>
                <td data-label="Mean change">{formatChange(m.meanChange, m.unit)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}