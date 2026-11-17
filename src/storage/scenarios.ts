// Saved scenarios (task 12). Task 1 writes the types and signatures only.
import type { Scenario } from '../domain/scenario';

export type SavedScenario = { id: string; title: string; savedAt: string; hash: string; scenario: Scenario };
export type SavedScenarioSummary = Omit<SavedScenario, 'scenario'>;
export const SCENARIOS_KEY = 'rehearsal.scenarios.v1';
export type ScenarioStoreOptions = { maxSaved: number };
export type SaveFailure = { ok: false; reason: 'quota' | 'unavailable' | 'limit'; errorName?: string };

export type ScenarioStore = {
  list(): { ok: true; items: SavedScenarioSummary[] } | { ok: false; reason: 'unreadable' };
  save(entry: SavedScenario): { ok: true; count: number } | SaveFailure;
  load(id: string): { ok: true; scenario: Scenario } | { ok: false; reason: 'missing' | 'invalid' };
  remove(id: string): { ok: true } | SaveFailure;
};

export function createScenarioStore(_storage: Storage | null, _options: ScenarioStoreOptions): ScenarioStore {
  throw new Error('not implemented: createScenarioStore');
}
