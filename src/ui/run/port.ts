// The narrow view of the engine client the controller uses (task 9).
import type { SimulationClient } from '../../workers/client';

export type WorkerPort = Pick<SimulationClient, 'run' | 'cancel' | 'currentRunId'>;
