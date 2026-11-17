import type { Scenario } from '../domain/scenario';
import type { ValidationIssue } from '../domain/validate';
import type { Metrics } from './metrics';
import type { Trace } from './trace';
function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}
export type SimulateOptions = { trace: boolean; scenarioHash: string };
export type RunResult = {
  scenarioHash: string; modelVersion: string; baseSeed: string; replication: number;
  horizonMs: number; completion: 'complete' | 'drain-capped'; unfinished: string[];
  metrics: Metrics; trace?: Trace;
};

export class ScenarioInvalidError extends Error {
  issues: ValidationIssue[] = [];
  constructor() {
    super();
    notImplemented('ScenarioInvalidError');
  }
}

export function simulate(scenario: Scenario, replication: number, options: SimulateOptions): RunResult {
  return notImplemented('simulate');
}