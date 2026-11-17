// Derived state (requirement 4.3, invariant I4). A result is stale exactly when it exists and the tab's current hash
// differs from the hash the result was computed from; a hash that is still being computed counts as different.
import type { EditorState } from './types';

export const STALE_LABEL = 'Stale, rerun';

export function resultsStatus(state: EditorState, tabIndex: number): 'none' | 'fresh' | 'stale' {
  const results = state.results[tabIndex];
  if (results === undefined || results.status === 'none') return 'none';
  return state.hashes[tabIndex] === results.hash ? 'fresh' : 'stale';
}

export function isStale(state: EditorState, tabIndex: number): boolean {
  return resultsStatus(state, tabIndex) === 'stale';
}

export function currentHash(state: EditorState): string | null {
  return state.hashes[state.currentIndex] ?? null;
}
