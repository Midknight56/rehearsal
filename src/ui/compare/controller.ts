// Compare controller (requirements 12.1, 12.3, 12.5). It starts the paired runner and the replicate loader through the
// session's SimulationClient and dispatches the compare/* actions on their outcomes. It computes nothing about the
// comparison itself: every number comes from src/comparison/.
import { selectReplicate, runPairedComparison, type ComparisonHandle, type ReplicateHandle } from '../../comparison/runner';
import type { SimulationClient } from '../../workers/client';
import type { EditorStore } from '../state/store';

export type CompareController = {
  /** Runs the picked pair; false when no run was requested (equal picks, or a comparison is already running). */
  run(): boolean;
  /** Loads replication r for both sides while the previous selection stays on screen. */
  selectReplicate(r: number): boolean;
  cancel(): void;
  active(): boolean;
};

export function createCompareController(client: SimulationClient, store: EditorStore): CompareController {
  let handle: ComparisonHandle | ReplicateHandle | null = null;

  const finish = (current: ComparisonHandle | ReplicateHandle): boolean => handle === current;

  return {
    run() {
      if (handle !== null) return false;
      const state = store.getState();
      const { baselineKey, candidateKey } = state.compare;
      const baseline = baselineKey === null ? -1 : state.tabKeys.indexOf(baselineKey);
      const candidate = candidateKey === null ? -1 : state.tabKeys.indexOf(candidateKey);
      if (baseline < 0 || candidate < 0 || baseline === candidate) return false;
      const started = runPairedComparison(client, state.scenarios[baseline]!, state.scenarios[candidate]!, {
        replayReplication: 0,
        onProgress: (done, total) => store.dispatch({ type: 'compare/progress', done, total }),
      });
      handle = started;
      store.dispatch({ type: 'compare/started' });
      void started.done.then((outcome) => {
        if (!finish(started)) return;
        handle = null;
        if (outcome.status === 'complete') store.dispatch({ type: 'compare/complete', comparison: outcome.comparison });
        else store.dispatch({ type: 'compare/ended', message: outcome.message });
      });
      return true;
    },
    selectReplicate(r) {
      const { comparison } = store.getState().compare;
      if (handle !== null || comparison === null) return false;
      const started = selectReplicate(client, comparison, r);
      handle = started;
      store.dispatch({ type: 'compare/loading', replication: r });
      void started.done.then((outcome) => {
        if (!finish(started)) return;
        handle = null;
        if (outcome.status === 'complete') store.dispatch({ type: 'compare/replicate', comparison: outcome.comparison });
        else store.dispatch({ type: 'compare/replicate-failed', message: outcome.message });
      });
      return true;
    },
    cancel() {
      handle?.cancel();
    },
    active: () => handle !== null,
  };
}
