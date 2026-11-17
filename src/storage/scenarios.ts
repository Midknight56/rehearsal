// Saved scenarios under localStorage['rehearsal.scenarios.v1'] as { version: 1, scenarios } (newest first). The bound is a
// parameter: this file holds no second literal. Every read is wrapped; a failed write changes nothing.
import type { Scenario } from '../domain/scenario';
import { validateScenario } from '../domain/validate';

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

type Stored = { id: string; title: string; savedAt: string; hash: string; scenario: unknown };

function isStored(value: unknown): value is Stored {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.title === 'string' && typeof v.savedAt === 'string' && typeof v.hash === 'string' && 'scenario' in v;
}

function errorNameOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && typeof (error as { name?: unknown }).name === 'string') return (error as { name: string }).name;
  return 'Error';
}

function failureOf(error: unknown): SaveFailure {
  const errorName = errorNameOf(error);
  return { ok: false, reason: errorName === 'QuotaExceededError' ? 'quota' : 'unavailable', errorName };
}

export function createScenarioStore(storage: Storage | null, options: ScenarioStoreOptions): ScenarioStore {
  const read = (): { ok: true; entries: Stored[] } | { ok: false } => {
    if (storage === null) return { ok: false };
    try {
      const raw = storage.getItem(SCENARIOS_KEY);
      if (raw === null) return { ok: true, entries: [] };
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return { ok: false };
      const { version, scenarios } = parsed as { version?: unknown; scenarios?: unknown };
      if (version !== 1 || !Array.isArray(scenarios)) return { ok: false };
      return { ok: true, entries: scenarios.filter(isStored) };
    } catch {
      return { ok: false };
    }
  };

  const write = (entries: Stored[]): { ok: true } | SaveFailure => {
    if (storage === null) return { ok: false, reason: 'unavailable' };
    try {
      storage.setItem(SCENARIOS_KEY, JSON.stringify({ version: 1, scenarios: entries }));
      return { ok: true };
    } catch (error) {
      return failureOf(error);
    }
  };

  return {
    list() {
      const current = read();
      if (!current.ok) return { ok: false, reason: 'unreadable' };
      return { ok: true, items: current.entries.map(({ id, title, savedAt, hash }) => ({ id, title, savedAt, hash })) };
    },
    save(entry) {
      const current = read();
      if (!current.ok) return { ok: false, reason: 'unavailable' };
      const others = current.entries.filter((e) => e.id !== entry.id);
      if (others.length === current.entries.length && current.entries.length >= options.maxSaved) return { ok: false, reason: 'limit' };
      const next = [entry, ...others];
      const written = write(next);
      return written.ok ? { ok: true, count: next.length } : written;
    },
    load(id) {
      const current = read();
      const found = current.ok ? current.entries.find((e) => e.id === id) : undefined;
      if (found === undefined) return { ok: false, reason: 'missing' };
      const result = validateScenario(found.scenario);
      return result.ok ? { ok: true, scenario: result.scenario } : { ok: false, reason: 'invalid' };
    },
    remove(id) {
      const current = read();
      if (!current.ok) return { ok: false, reason: 'unavailable' };
      return write(current.entries.filter((e) => e.id !== id));
    },
  };
}