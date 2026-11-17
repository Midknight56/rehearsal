import type { Scenario } from '../../../src/domain/scenario';
import { validateScenario } from '../../../src/domain/validate';
import { scenarioHash } from '../../../src/domain/hash';
import { simulate, type RunResult } from '../../../src/simulation/simulate';

/** Validate, hash and simulate one replication. Throws when the scenario is invalid. */
export async function runOnce(input: Scenario, replication: number, trace: boolean): Promise<RunResult> {
  const validated = validateScenario(input);
  if (!validated.ok) {
    throw new Error(`invalid test scenario: ${validated.issues.map((issue) => issue.message).join(' ')}`);
  }
  const hash = await scenarioHash(validated.scenario);
  return simulate(validated.scenario, replication, { trace, scenarioHash: hash });
}