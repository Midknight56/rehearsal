/** Entry for the in-memory Vite build of worker.test.ts: proves that importing the client bundles the worker. */
import { createSimulationClient } from '../../../src/workers/client';

export const client = createSimulationClient;