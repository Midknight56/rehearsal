// Text for the one status region, derived from an action and the states around it. The store writes it through setStatus;
// it is never produced per frame (requirement 9.2).
import { COMPLETE_TEXT, replayLabel, restoredSummaryText } from '../../comparison/labels';
import { refusal } from './reducer';
import type { EditorAction, EditorState } from './types';

export function announcement(prev: EditorState, action: EditorAction, next: EditorState): string | null {
  const refused = refusal(prev, action);
  if (refused !== null) return refused;
  switch (action.type) {
    case 'station/move':
    case 'drag/end': {
      if (next.scenario === prev.scenario) return null;
      const station = next.scenario.stations.find((s) => s.id === action.id);
      return station === undefined ? null : `${station.label} moved to (${station.cell[0]}, ${station.cell[1]}).`;
    }
    case 'station/delete': {
      const gone = prev.scenario.stations.find((s) => s.id === action.id);
      return gone === undefined || next === prev ? null : `Deleted ${gone.label}.`;
    }
    case 'import/apply': {
      const imported = action.imported ?? { cohorts: action.candidate.cohorts.length, stations: action.candidate.stations.length };
      return `Imported ${imported.cohorts} cohorts and ${imported.stations} stations from ${action.sources.join(', ')}.`;
    }
    case 'run/blocked':
      return action.message;
    case 'run/finished': {
      const o = action.outcome;
      if (o === 'complete') {
        const tab = prev.run.status === 'running' || prev.run.status === 'cancelling' ? prev.run.tabIndex : prev.currentIndex;
        const results = next.results[tab];
        if (results === undefined || results.status === 'none') return null;
        const base = `Run complete: ${results.result.metrics.admitted} attendees, replication ${results.result.replication}, hash ${results.hash.slice(0, 8)}`;
        const unfinished = results.result.completion === 'drain-capped' ? `; ${results.result.unfinished.length} attendees unfinished at the drain cap` : '';
        return `${base}${unfinished}.`;
      }
      return 'cancelled' in o ? 'Run cancelled.' : `Run failed: ${o.error}`;
    }
    case 'run/cancelling':
      return null;
    case 'compare/complete':
      return COMPLETE_TEXT;
    case 'compare/ended':
    case 'compare/replicate-failed':
      return action.message;
    case 'compare/replicate':
      return `${replayLabel(action.comparison.replay.replication)} loaded.`;
    case 'compare/restore':
      return restoredSummaryText(action.summary.createdAt);
    default:
      return null;
  }
}
