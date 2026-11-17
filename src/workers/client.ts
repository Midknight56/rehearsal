import type { Scenario } from '../domain/scenario';
import type { RunResult } from '../simulation/simulate';
function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}
export type WorkerLike = {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
};
export type RunOutcome =
  | { status: 'complete'; results: RunResult[] }
  | { status: 'cancelled'; message: string }
  | { status: 'error'; message: string };
export type RunHandle = { runId: number; done: Promise<RunOutcome> };
export type RunCallbacks = { onProgress?: (done: number, total: number) => void; onResult?: (result: RunResult) => void };
export type SimulationClient = {
  run(scenario: Scenario, replications: number[], options: { trace: boolean } & RunCallbacks): RunHandle;
  cancel(): void;
  dispose(): void;
  readonly currentRunId: number;
  readonly discardedMessages: number;
};
export type ClientDeps = {
  createWorker: () => WorkerLike;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
};

export function createSimulationClient(deps?: Partial<ClientDeps>): SimulationClient {
  return notImplemented('createSimulationClient');
}