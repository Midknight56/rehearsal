import type { Scenario } from './scenario';
function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}
export function stableJson(value: unknown): string {
  return notImplemented('stableJson');
}

export function canonicalJson(scenario: Scenario): string {
  return notImplemented('canonicalJson');
}

export function scenarioHash(scenario: Scenario): Promise<string> {
  return notImplemented('scenarioHash');
}