import type { z } from 'zod';
import type { Scenario } from '../domain/scenario';
import type { RunResult } from '../simulation/simulate';
function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}
function notImplementedValue<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get: () => notImplemented(name),
    has: () => notImplemented(name),
    ownKeys: () => notImplemented(name),
  });
}
export type ToWorker =
  | { type: 'run'; runId: number; scenario: Scenario; replications: number[]; trace: boolean }
  | { type: 'cancel'; runId: number };
export type FromWorker =
  | { type: 'progress'; runId: number; done: number; total: number }
  | { type: 'result'; runId: number; replication: number; result: RunResult }
  | { type: 'cancelled'; runId: number }
  | { type: 'error'; runId: number; message: string };
export const ToWorkerSchema: z.ZodType<ToWorker> = notImplementedValue<z.ZodType<ToWorker>>('ToWorkerSchema');
export const FromWorkerSchema: z.ZodType<FromWorker> = notImplementedValue<z.ZodType<FromWorker>>('FromWorkerSchema');
export const PROGRESS_INTERVAL_MS = 200; // at most 5 progress messages per second
export const CANCEL_DEADLINE_MS = 250;