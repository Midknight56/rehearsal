import type { Scenario } from '../../../src/domain/scenario';
import type { RunResult } from '../../../src/simulation/simulate';
import { REPLICATION_INDICES } from '../../../src/comparison/replications';
import { runOnce } from '../../model/helpers/run';

const cache = new Map<string, Promise<RunResult[]>>();

/** The 30 untraced results of a scenario through the engine, memoised by object identity of the scenario's JSON. */
export function resultsFor(scenario: Scenario): Promise<RunResult[]> {
  const key = JSON.stringify(scenario);
  let found = cache.get(key);
  if (found === undefined) {
    found = Promise.all(REPLICATION_INDICES.map((r) => runOnce(scenario, r, false)));
    cache.set(key, found);
  }
  return found.then((results) => results.map((result) => structuredClone(result)));
}
