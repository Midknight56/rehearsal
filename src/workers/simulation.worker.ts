import type { FromWorker } from './protocol';
function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}
export type WorkerDeps = { now: () => number; yieldToLoop: () => Promise<void> };

export function createWorkerHandler(post: (message: FromWorker) => void, deps: WorkerDeps): (data: unknown) => Promise<void> {
  return notImplemented('createWorkerHandler');
}