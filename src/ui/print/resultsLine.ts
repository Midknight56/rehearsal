// The one line of the run sheet that mentions results (requirement 8.6). The sheet itself needs no run.
import { formatMinutes } from '../../comparison/format';
import { NOT_A_FORECAST as FIXED_SENTENCE } from '../../exports/assumptions-text';
import { STALE_LABEL, resultsStatus } from '../state/selectors';
import type { EditorState } from '../state/types';

export function resultsLine(state: EditorState, tabIndex: number): string {
  const status = resultsStatus(state, tabIndex);
  const results = state.results[tabIndex];
  if (status === 'none' || results === undefined || results.status === 'none') return 'Results: none (no run needed for this sheet).';
  const r = results.result;
  const facts = `replication ${r.replication}, ${r.completion}, seed ${r.baseSeed}, model version ${r.modelVersion}, window ${formatMinutes(r.horizonMs)}`;
  return status === 'stale' ? `Results: ${facts}. ${STALE_LABEL}` : `Results: ${facts}. ${FIXED_SENTENCE}`;
}