import type { Scenario } from '../../src/domain/scenario';
import type { RunResult } from '../../src/simulation/simulate';
import type { RunHandle, RunOutcome, SimulationClient } from '../../src/workers/client';

export type FakeRun = {
  handle: RunHandle;
  scenario: Scenario;
  replications: number[];
  options: { trace: boolean };
  /** Settles handle.done. Callbacks of this run may still be fired afterwards, as a superseded handle would. */
  resolve(outcome: RunOutcome): void;
  emitProgress(done: number, total: number): void;
  emitResult(result: RunResult): void;
};

export type FakePort = SimulationClient & {
  runs: FakeRun[];
  cancelCalls: number;
  /** The last run requested. */
  last(): FakeRun;
};

/**
 * A fake SimulationClient. It numbers runs like the engine adapter (runId strictly increases across run() and cancel()),
 * never discards anything itself, and lets the test resolve each handle and fire callbacks from any handle at any time,
 * including from a superseded one (requirement 5.4).
 */
export function createFakePort(): FakePort {
  let runId = 0;
  const runs: FakeRun[] = [];
  const port: FakePort = {
    runs,
    cancelCalls: 0,
    last: () => {
      const run = runs[runs.length - 1];
      if (run === undefined) throw new Error('fake port: no run requested yet');
      return run;
    },
    get currentRunId() {
      return runId;
    },
    discardedMessages: 0,
    run(scenario, replications, options) {
      runId += 1;
      let settle: (outcome: RunOutcome) => void = () => undefined;
      const done = new Promise<RunOutcome>((resolve) => {
        settle = resolve;
      });
      const handle: RunHandle = { runId, done };
      runs.push({
        handle,
        scenario,
        replications,
        options: { trace: options.trace },
        resolve: (outcome) => settle(outcome),
        emitProgress: (d, t) => options.onProgress?.(d, t),
        emitResult: (result) => options.onResult?.(result),
      });
      return handle;
    },
    cancel() {
      port.cancelCalls += 1;
      runId += 1;
    },
    dispose() {
      /* nothing to release */
    },
  };
  return port;
}
