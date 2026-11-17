// Run controller (requirements 4.4, 4.5, 5.1 to 5.5, 5.7). It decides nothing about the engine: the adapter numbers runs,
// validates messages and applies the 250 ms rule. The controller checks the routes, starts one run, and passes on only the
// callbacks of the run that is active, and only a result that belongs to the snapshot it started from.
import type { Scenario } from '../../domain/scenario';
import type { createPathCache, describeNode } from '../../spatial/path-cache';
import type { EditorAction } from '../state/types';
import type { WorkerPort } from './port';

export type RunController = {
  /** The run id, or null when no run was requested (a blocked route, or a run is already active). */
  start(snapshot: Scenario, hash: string, tabIndex: number): number | null;
  cancel(): void;
  activeRunId(): number | null;
};

type Active = { runId: number; cancelled: boolean };
type NodeRef = { kind: 'entrance' } | { kind: 'exit' } | { kind: 'station'; id: string };

const sameNode = (a: NodeRef, b: NodeRef): boolean => a.kind === b.kind && (a.kind !== 'station' || (b.kind === 'station' && a.id === b.id));

/** The first route segment without a path, cohort by cohort in scenario order and in route order, as the 4.4 message. */
function blockedMessage(snapshot: Scenario, unreachable: { from: NodeRef; to: NodeRef }[]): string | null {
  if (unreachable.length === 0) return null;
  const name = (node: NodeRef): string => {
    if (node.kind === 'entrance') return `the entrance (${snapshot.layout.entrance[0]}, ${snapshot.layout.entrance[1]})`;
    if (node.kind === 'exit') return `the exit (${snapshot.layout.exit[0]}, ${snapshot.layout.exit[1]})`;
    const station = snapshot.stations.find((s) => s.id === node.id);
    return station === undefined ? node.id : `${station.label} (${station.id})`;
  };
  for (const cohort of snapshot.cohorts) {
    const nodes: NodeRef[] = [{ kind: 'entrance' }, ...cohort.route.map((id): NodeRef => ({ kind: 'station', id })), { kind: 'exit' }];
    for (let i = 0; i + 1 < nodes.length; i += 1) {
      const from = nodes[i] as NodeRef;
      const to = nodes[i + 1] as NodeRef;
      if (unreachable.some((u) => sameNode(u.from, from) && sameNode(u.to, to))) {
        return `Run blocked: no path from ${name(from)} to ${name(to)}. Clear a corridor on the floor plan or move a station.`;
      }
    }
  }
  return null;
}

export function createRunController(
  port: WorkerPort,
  dispatch: (a: EditorAction) => void,
  deps: { pathCache: typeof createPathCache; describe: typeof describeNode },
): RunController {
  let active: Active | null = null;

  return {
    start(snapshot, hash, tabIndex) {
      if (active !== null) return null;
      const blocked = blockedMessage(snapshot, deps.pathCache(snapshot).unreachable);
      if (blocked !== null) {
        dispatch({ type: 'run/blocked', message: blocked });
        return null;
      }
      const entry: Active = { runId: 0, cancelled: false };
      const current = (): boolean => active === entry && !entry.cancelled;
      const handle = port.run(snapshot, [0], {
        trace: true,
        onProgress: (done, total) => {
          if (current()) dispatch({ type: 'run/progress', runId: entry.runId, done, total });
        },
        onResult: (result) => {
          if (!current() || result.replication !== 0 || result.scenarioHash !== hash) return;
          dispatch({ type: 'run/result', runId: entry.runId, tabIndex, result, snapshot, hash });
        },
      });
      entry.runId = handle.runId;
      active = entry;
      dispatch({ type: 'run/started', runId: entry.runId, tabIndex });
      void handle.done.then((outcome) => {
        if (active !== entry) return;
        active = null;
        dispatch({
          type: 'run/finished',
          runId: entry.runId,
          outcome: outcome.status === 'complete' ? 'complete' : outcome.status === 'cancelled' ? { cancelled: outcome.message } : { error: outcome.message },
        });
      });
      return entry.runId;
    },
    cancel() {
      if (active === null || active.cancelled) return;
      active.cancelled = true;
      port.cancel();
      dispatch({ type: 'run/cancelling', runId: active.runId });
    },
    activeRunId: () => active?.runId ?? null,
  };
}
