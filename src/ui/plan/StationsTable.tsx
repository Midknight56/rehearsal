// The stations table (requirements 3.1 to 3.6, 3.9, 3.10, 9.1). Every cell is a labelled input; an edit is one committed
// action and the floor plan reads the same scenario in the same commit.
import { useState, type ReactElement } from 'react';
import { LIMITS } from '../../domain/limits';
import type { Station } from '../../domain/scenario';
import { parseDecimal, parseWhole } from '../../imports/numbers';
import { serviceFromSeconds } from '../../imports/units';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';
import { CommitInput, PairInput, attempt } from './fields';

const triple = (s: Station): [number, number, number] =>
  s.service.kind === 'constant' ? [s.service.seconds, s.service.seconds, s.service.seconds] : [s.service.minS, s.service.modeS, s.service.maxS];

const COLUMNS = ['Station ID', 'Label', 'Servers', 'Service min (s)', 'Service mode (s)', 'Service max (s)', 'Cell (x, y)', 'Actions'] as const;

/** Plain words for every column, shown under the table so a first-time reader needs no other page. */
export const STATIONS_HELP: readonly (readonly [string, string])[] = [
  ['Station ID', 'a short name for the station; the Route column of Arrivals uses it.'],
  ['Label', 'the name shown on the floor plan and in the results.'],
  ['Servers', 'how many staff serve this station at the same time, from 1 to 20. Everyone waits in one line for the next free one.'],
  ['Service min, mode and max (s)', 'the shortest, the most usual and the longest time one person takes to be served, in seconds. Make all three equal and everyone takes that same time.'],
  ['Cell (x, y)', 'the square of the floor plan where the station stands: x counts squares to the right from the left edge, y counts squares down from the top, both from 0.'],
];

export function StationsTable({ store }: { store: EditorStore }): ReactElement {
  const state = useEditorState(store);
  const { scenario } = state;
  const [deleteRefusal, setDeleteRefusal] = useState<{ id: string; text: string } | null>(null);
  const full = scenario.stations.length >= LIMITS.maxStations;
  const shared = (s: Station): Station | undefined => scenario.stations.find((o) => o.id !== s.id && o.cell[0] === s.cell[0] && o.cell[1] === s.cell[1]);

  const service = (s: Station, index: 0 | 1 | 2) => (text: string): string | null => {
    const parsed = parseDecimal(text);
    if (!parsed.ok) return `must be a number greater than 0 (got "${text.trim()}")`;
    const next = triple(s);
    next[index] = parsed.value;
    return attempt(store, { type: 'station/set', id: s.id, patch: { service: serviceFromSeconds(next[0], next[1], next[2]) } });
  };

  return (
    <div className="table-scroll">
      <table className="stack">
        <caption>Stations</caption>
        <thead>
          <tr>
            {COLUMNS.map((h) => (
              <th key={h} scope="col">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scenario.stations.map((s) => {
            const other = shared(s);
            const [min, mode, max] = triple(s);
            return (
              <tr key={s.id} aria-selected={state.selection.kind === 'station' && state.selection.id === s.id ? true : undefined}>
                <td data-label={COLUMNS[0]}><CommitInput label={`station_id of ${s.id}`} size="id" value={s.id} onCommit={(t) => attempt(store, { type: 'station/rename', id: s.id, newId: t.trim() })} /></td>
                <td data-label={COLUMNS[1]}><CommitInput label={`label of ${s.id}`} size="wide" value={s.label} onCommit={(t) => attempt(store, { type: 'station/set', id: s.id, patch: { label: t } })} /></td>
                <td data-label={COLUMNS[2]}>
                  <CommitInput
                    label={`servers of ${s.id}`}
                    value={String(s.servers)}
                    inputMode="numeric"
                    width="3em"
                    onCommit={(t) => {
                      const p = parseWhole(t);
                      return p.ok ? attempt(store, { type: 'station/set', id: s.id, patch: { servers: p.value } }) : `must be a whole number from ${LIMITS.minServers} to ${LIMITS.maxServers} (got "${t.trim()}")`;
                    }}
                  />
                </td>
                <td data-label={COLUMNS[3]}><CommitInput label={`service_min_s of ${s.id}`} value={String(min)} inputMode="decimal" width="4em" onCommit={service(s, 0)} /></td>
                <td data-label={COLUMNS[4]}><CommitInput label={`service_mode_s of ${s.id}`} value={String(mode)} inputMode="decimal" width="4em" onCommit={service(s, 1)} /></td>
                <td data-label={COLUMNS[5]}><CommitInput label={`service_max_s of ${s.id}`} value={String(max)} inputMode="decimal" width="4em" onCommit={service(s, 2)} /></td>
                <td data-label={COLUMNS[6]}>
                  <PairInput
                    labelX={`cell_x of ${s.id}`}
                    labelY={`cell_y of ${s.id}`}
                    value={s.cell}
                    parse={(t) => {
                      const p = parseWhole(t);
                      return p.ok && p.value >= 0 ? p.value : null;
                    }}
                    parseError={(name, t) => `cell_${name} must be a whole number of 0 or more (got "${t.trim()}")`}
                    onCommit={(cell) => attempt(store, { type: 'station/move', id: s.id, cell, via: 'form' })}
                  />
                  {other === undefined ? null : <span className="field-error">{`Cell (${s.cell[0]}, ${s.cell[1]}) is shared with ${other.label}.`}</span>}
                </td>
                <td data-label={COLUMNS[7]}>
                  <div className="cell-actions">
                  <button type="button" aria-label={`Inspect ${s.id}`} onClick={() => store.dispatch({ type: 'select', selection: { kind: 'station', id: s.id } })}>Inspect</button>{' '}
                  <button
                    type="button"
                    aria-label={`Delete ${s.id}`}
                    onClick={() => {
                      const text = attempt(store, { type: 'station/delete', id: s.id });
                      setDeleteRefusal(text === null ? null : { id: s.id, text });
                    }}
                  >
                    Delete
                  </button>
                  </div>
                  {deleteRefusal?.id === s.id ? <span className="field-error">{deleteRefusal.text}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        <button type="button" aria-label="Add station" aria-disabled={full ? 'true' : undefined} onClick={() => { if (!full) attempt(store, { type: 'station/add' }); }}>Add</button>{' '}
        <span className="muted">{`${scenario.stations.length} of ${LIMITS.maxStations} stations`}</span>
      </p>
      <ul className="column-help" aria-label="What the stations columns mean">
        {STATIONS_HELP.map(([term, text]) => (
          <li key={term}><strong>{term}</strong>{`: ${text}`}</li>
        ))}
      </ul>
    </div>
  );
}
