// Run controller (task 9). Task 1 writes the type and the signature only.
import type { Scenario } from '../../domain/scenario';
import type { createPathCache, describeNode } from '../../spatial/path-cache';
import type { EditorAction } from '../state/types';
import type { WorkerPort } from './port';

export type RunController = {
  start(snapshot: Scenario, hash: string, tabIndex: number): number | null;
  cancel(): void;
  activeRunId(): number | null;
};

export function createRunController(
  _port: WorkerPort,
  _dispatch: (a: EditorAction) => void,
  _deps: { pathCache: typeof createPathCache; describe: typeof describeNode },
): RunController {
  throw new Error('not implemented: createRunController');
}
