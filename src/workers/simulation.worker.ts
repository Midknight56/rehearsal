import { scenarioHash } from '../domain/hash';
import { validateScenario } from '../domain/validate';
import { ScenarioInvalidError, simulate } from '../simulation/simulate';
import { PROGRESS_INTERVAL_MS, ToWorkerSchema, type FromWorker } from './protocol';

export type WorkerDeps = { now: () => number; yieldToLoop: () => Promise<void> };

const MALFORMED = 'Malformed worker message.';

/**
 * The per-message behaviour of the worker. `now` only spaces `progress` messages; it never feeds model state.
 * `cancelledRuns` is a set of run IDs, so a `cancel` for run 1, a `run` 3 and a `cancel` for run 3 that arrive
 * before run 1's loop resumes still acknowledge run 1.
 */
export function createWorkerHandler(post: (message: FromWorker) => void, deps: WorkerDeps): (data: unknown) => Promise<void> {
  const cancelledRuns = new Set<number>();
  const activeRuns = new Set<number>();

  return async (data) => {
    const parsed = ToWorkerSchema.safeParse(data);
    if (!parsed.success) {
      const claimed = typeof data === 'object' && data !== null ? (data as { runId?: unknown }).runId : undefined;
      post({ type: 'error', runId: typeof claimed === 'number' ? claimed : 0, message: MALFORMED });
      return;
    }
    const message = parsed.data;

    if (message.type === 'cancel') {
      if (activeRuns.has(message.runId)) cancelledRuns.add(message.runId);
      else post({ type: 'cancelled', runId: message.runId });
      return;
    }

    const { runId, scenario, replications, trace } = message;
    activeRuns.add(runId);
    try {
      const validated = validateScenario(scenario);
      if (!validated.ok) {
        post({ type: 'error', runId, message: new ScenarioInvalidError(validated.issues).message });
        return;
      }
      const hash = await scenarioHash(validated.scenario);
      let lastProgressAt: number | null = null;
      for (let index = 0; index < replications.length; index += 1) {
        if (cancelledRuns.has(runId)) {
          post({ type: 'cancelled', runId });
          return;
        }
        let result;
        try {
          result = simulate(validated.scenario, replications[index] as number, { trace, scenarioHash: hash });
        } catch (error) {
          post({ type: 'error', runId, message: `Simulation failed: ${error instanceof Error ? error.message : String(error)}` });
          return;
        }
        post({ type: 'result', runId, replication: replications[index] as number, result });
        const at = deps.now();
        if (lastProgressAt === null || at - lastProgressAt >= PROGRESS_INTERVAL_MS) {
          post({ type: 'progress', runId, done: index + 1, total: replications.length });
          lastProgressAt = at;
        }
        await deps.yieldToLoop();
      }
      if (cancelledRuns.has(runId)) post({ type: 'cancelled', runId });
    } finally {
      activeRuns.delete(runId);
      cancelledRuns.delete(runId);
    }
  };
}

type WorkerScope = { postMessage(message: unknown): void; onmessage: ((event: { data: unknown }) => void) | null };

// Wiring for a real module worker. Skipped when the module is imported by Node (tests) or by the main thread.
const scope = (globalThis as unknown as { self?: Partial<WorkerScope> }).self;
if (scope !== undefined && typeof scope.postMessage === 'function' && typeof (globalThis as { document?: unknown }).document === 'undefined') {
  const handle = createWorkerHandler((message) => (scope as WorkerScope).postMessage(message), {
    now: () => performance.now(),
    yieldToLoop: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
  });
  scope.onmessage = (event) => {
    void handle(event.data);
  };
}