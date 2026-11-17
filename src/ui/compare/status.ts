// The text of compare-status (requirement 12.1). Priority: a running comparison, a replicate loading, the verbatim message of
// a cancelled or failed outcome, then Stale, then the completion or the restored-summary label. Nothing here is per frame.
import { COMPLETE_TEXT, STALE_TEXT, loadingReplicationText, progressText, restoredSummaryText } from '../../comparison/labels';
import { isComparisonCurrent } from '../../comparison/comparison';
import type { EditorState } from '../state/types';

const hashOfKey = (state: EditorState, key: string | null): string | null => {
  const index = key === null ? -1 : state.tabKeys.indexOf(key);
  return index < 0 ? null : (state.hashes[index] ?? null);
};

/** True when a comparison or restored summary exists and either picked tab no longer hashes to what it was built from. */
export function isCompareStale(state: EditorState): boolean {
  const { comparison, restored, baselineKey, candidateKey } = state.compare;
  const record = comparison ?? restored;
  if (record === null) return false;
  const baseline = hashOfKey(state, baselineKey);
  const candidate = hashOfKey(state, candidateKey);
  if (baseline === null || candidate === null) return true;
  return comparison === null
    ? record.baseline.scenarioHash !== baseline || record.candidate.scenarioHash !== candidate
    : !isComparisonCurrent(comparison, baseline, candidate);
}

export function compareStatusText(state: EditorState): string {
  const { running, progress, loadingReplication, message, comparison, restored } = state.compare;
  if (running) return progress === null ? '' : progressText(progress.done, progress.total);
  if (loadingReplication !== null) return loadingReplicationText(loadingReplication);
  if (message !== null) return message;
  if (isCompareStale(state)) return STALE_TEXT;
  if (comparison !== null) return COMPLETE_TEXT;
  if (restored !== null) return restoredSummaryText(restored.createdAt);
  return '';
}