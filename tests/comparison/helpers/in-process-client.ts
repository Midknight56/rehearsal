import type { Scenario } from '../../../src/domain/scenario';
import { scenarioHash } from '../../../src/domain/hash';
import { validateScenario } from '../../../src/domain/validate';
import { simulate, type RunResult } from '../../../src/simulation/simulate';
import type { RunCallbacks, RunHandle, RunOutcome, SimulationClient } from '../../../src/workers/client';

export type RecordedRun = { scenarioHash: string; replications: number[]; trace: boolean };
export type InProcessOptions = {
  /** The run of this scenario hash and replication resolves as an error. */
  failAt?: { scenarioHash: string; replication: number };
  /** cancel() does not resolve the run until releaseCancel() is called. */
  holdCancel?: boolean;
  /** Milliseconds to wait before each result is delivered (default 0: one macrotask). */
  delayMs?: number;
  /** Traced runs report a changed completedByClosing value, to exercise the determinism self-check. */
  alterTracedMetrics?: boolean;
  /** Called after each delivered result; the argument is the 1-based index of the run call and the results done so far in it. */
  onDelivered?: (runCall: number, delivered: number) => void;
};
export type InProcessClient = SimulationClient & { readonly runs: RecordedRun[]; releaseCancel(): void };

const CANCELLED = 'Simulation cancelled.';

export function createInProcessClient(options: InProcessOptions = {}): InProcessClient {
  const runs: RecordedRun[] = [];
  let currentRunId = 0;
  let activeCancel: (() => void) | null = null;
  let held: (() => void) | null = null;

  const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, options.delayMs ?? 0));

  const client: InProcessClient = {
    runs,
    run(scenario: Scenario, replications: number[], runOptions: { trace: boolean } & RunCallbacks): RunHandle {
      currentRunId += 1;
      const runId = currentRunId;
      const call = runs.length + 1;
      let cancelled = false;
      const done = (async (): Promise<RunOutcome> => {
        const validated = validateScenario(scenario);
        if (!validated.ok) return { status: 'error', message: validated.issues[0]?.message ?? 'Scenario is invalid.' };
        const hash = await scenarioHash(validated.scenario);
        runs.push({ scenarioHash: hash, replications: [...replications], trace: runOptions.trace });
        const results: RunResult[] = [];
        const cancelOutcome = (): Promise<RunOutcome> =>
          options.holdCancel === true
            ? new Promise((resolve) => {
              held = () => resolve({ status: 'cancelled', message: CANCELLED });
            })
            : Promise.resolve({ status: 'cancelled', message: CANCELLED });
        for (const replication of replications) {
          await pause();
          if (cancelled) return cancelOutcome();
          if (options.failAt?.scenarioHash === hash && options.failAt.replication === replication) {
            return { status: 'error', message: `Replication ${replication} failed in the test client.` };
          }
          const result = simulate(validated.scenario, replication, { trace: runOptions.trace, scenarioHash: hash });
          if (runOptions.trace && options.alterTracedMetrics === true) {
            result.metrics = {
              ...result.metrics,
              completedByClosing: { ...result.metrics.completedByClosing, value: (result.metrics.completedByClosing.value ?? 0) + 1 },
            };
          }
          results.push(result);
          runOptions.onResult?.(result);
          runOptions.onProgress?.(results.length, replications.length);
          options.onDelivered?.(call, results.length);
        }
        activeCancel = null;
        return { status: 'complete', results };
      })();
      activeCancel = () => {
        cancelled = true;
      };
      return { runId, done };
    },
    cancel() {
      activeCancel?.();
      activeCancel = null;
      if (options.holdCancel !== true) currentRunId += 1;
    },
    releaseCancel() {
      held?.();
      held = null;
    },
    dispose() {
      activeCancel?.();
      activeCancel = null;
    },
    get currentRunId() {
      return currentRunId;
    },
    get discardedMessages() {
      return 0;
    },
  };
  return client;
}
