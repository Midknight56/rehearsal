// The arrivals table: one row per cohort. Windows are shown in minutes and stored as integer milliseconds (units.ts).
import type { ReactElement } from 'react';
import { LIMITS } from '../../domain/limits';
import type { Cohort } from '../../domain/scenario';
import { parseDecimal, parseWhole } from '../../imports/numbers';
import { minutesToMs } from '../../imports/units';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';
import { CommitInput, attempt } from './fields';

const minutes = (ms: number): string => String(ms / 60_000);

const COLUMNS = ['Cohort ID', 'Start (min)', 'End (min)', 'Count (people)', 'Arrival pattern', 'Route', 'Actions'] as const;

/** Plain words for every column, shown under the table so a first-time reader needs no other page. */
export const ARRIVALS_HELP: readonly (readonly [string, string])[] = [
  ['Cohort ID', 'a short name for one group of people who arrive in the same way, such as doors.'],
  ['Start and End (min)', 'when this group starts and stops arriving, in minutes after the doors open.'],
  ['Count (people)', 'how many people are in the group.'],
  ['Arrival pattern', 'even spreads the people at equal gaps over that time; uniform scatters them at random times in it.'],
  ['Route', 'the Station IDs each person visits, in order, joined by |. For example checkin|packs means the station checkin, then the station packs.'],
];

export function ArrivalsTable({ store }: { store: EditorStore }): ReactElement {
  const state = useEditorState(store);
  const { scenario } = state;
  const total = scenario.cohorts.reduce((n, c) => n + c.count, 0);

  const minuteField = (c: Cohort, key: 'startMs' | 'endMs', name: string) => (text: string): string | null => {
    const p = parseDecimal(text);
    return p.ok ? attempt(store, { type: 'cohort/set', id: c.id, patch: { [key]: minutesToMs(p.value) } }) : `${name} must be a number (got "${text.trim()}")`;
  };

  return (
    <div className="table-scroll">
      <table className="stack">
        <caption>Arrivals</caption>
        <thead>
          <tr>
            {COLUMNS.map((h) => (
              <th key={h} scope="col">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scenario.cohorts.map((c) => (
            <tr key={c.id} aria-selected={state.selection.kind === 'cohort' && state.selection.id === c.id ? true : undefined}>
              <td data-label={COLUMNS[0]}><CommitInput label={`cohort_id of ${c.id}`} size="id" value={c.id} onCommit={(t) => attempt(store, { type: 'cohort/rename', id: c.id, newId: t.trim() })} /></td>
              <td data-label={COLUMNS[1]}><CommitInput label={`start_min of ${c.id}`} value={minutes(c.startMs)} inputMode="decimal" width="3.5em" onCommit={minuteField(c, 'startMs', 'start_min')} /></td>
              <td data-label={COLUMNS[2]}><CommitInput label={`end_min of ${c.id}`} value={minutes(c.endMs)} inputMode="decimal" width="3.5em" onCommit={minuteField(c, 'endMs', 'end_min')} /></td>
              <td data-label={COLUMNS[3]}>
                <CommitInput
                  label={`count of ${c.id}`}
                  value={String(c.count)}
                  inputMode="numeric"
                  width="5.5em"
                  onCommit={(t) => {
                    const p = parseWhole(t);
                    return p.ok ? attempt(store, { type: 'cohort/set', id: c.id, patch: { count: p.value } }) : `must be a whole number of 0 or more (got "${t.trim()}")`;
                  }}
                />
              </td>
              <td data-label={COLUMNS[4]}>
                <select
                  aria-label={`arrival_pattern of ${c.id}`}
                  value={c.arrivals}
                  onChange={(e) => attempt(store, { type: 'cohort/set', id: c.id, patch: { arrivals: e.target.value === 'even' ? 'even' : 'uniform' } })}
                >
                  <option value="even">even</option>
                  <option value="uniform">uniform</option>
                </select>
              </td>
              <td data-label={COLUMNS[5]}>
                <CommitInput
                  label={`route of ${c.id}`}
                  size="wide"
                  value={c.route.join('|')}
                  onCommit={(t) => attempt(store, { type: 'cohort/set', id: c.id, patch: { route: t.split('|').map((x) => x.trim()).filter((x) => x !== '') } })}
                />
              </td>
              <td data-label={COLUMNS[6]}>
                <div className="cell-actions">
                <button type="button" aria-label={`Select ${c.id}`} onClick={() => store.dispatch({ type: 'select', selection: { kind: 'cohort', id: c.id } })}>Select</button>
                <button type="button" aria-label={`Delete cohort ${c.id}`} onClick={() => attempt(store, { type: 'cohort/delete', id: c.id })}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <button type="button" aria-label="Add cohort" onClick={() => attempt(store, { type: 'cohort/add' })}>Add</button>{' '}
        <span className="muted">{`${total.toLocaleString('en-US')} of ${LIMITS.maxAttendees.toLocaleString('en-US')} attendees; at most ${LIMITS.maxRouteVisits} stations per route`}</span>
      </p>
      <ul className="column-help" aria-label="What the arrivals columns mean">
        {ARRIVALS_HELP.map(([term, text]) => (
          <li key={term}><strong>{term}</strong>{`: ${text}`}</li>
        ))}
      </ul>
    </div>
  );
}
