import { describe, expect, it } from 'vitest';
import { PREFS_KEY, createPrefsStore } from '../../src/storage/prefs';
import { SCENARIOS_KEY, createScenarioStore, type SavedScenario } from '../../src/storage/scenarios';
import { makeScenario } from './generators';

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  failSet: string | null = null;
  failGet = false;
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null {
    if (this.failGet) throw new DOMException('denied', 'SecurityError');
    return this.data.get(key) ?? null;
  }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void {
    if (this.failSet !== null) throw new DOMException('failed', this.failSet);
    this.data.set(key, value);
  }
}

const entry = (seed: number, id = `generated-${seed}`): SavedScenario => {
  const scenario = { ...makeScenario(seed), id };
  return { id, title: scenario.title, savedAt: '2026-11-16T10:00:00.000Z', hash: 'a'.repeat(64), scenario };
};

describe('10.3 save, list, replace by id', () => {
  it('writes { version: 1, scenarios } newest first and lists summaries without the scenario', () => {
    const storage = new MemoryStorage();
    const store = createScenarioStore(storage, { maxSaved: 10 });
    expect(store.save(entry(1))).toEqual({ ok: true, count: 1 });
    expect(store.save(entry(2))).toEqual({ ok: true, count: 2 });
    const raw = JSON.parse(storage.data.get(SCENARIOS_KEY) as string) as { version: number; scenarios: SavedScenario[] };
    expect(raw.version).toBe(1);
    expect(raw.scenarios.map((s) => s.id)).toEqual(['generated-2', 'generated-1']);
    const listed = store.list();
    expect(listed.ok && listed.items.map((i) => i.id)).toEqual(['generated-2', 'generated-1']);
    expect(listed.ok && Object.keys(listed.items[0] as object)).not.toContain('scenario');
  });

  it('replaces the entry with the same id and keeps the count', () => {
    const store = createScenarioStore(new MemoryStorage(), { maxSaved: 10 });
    store.save(entry(1));
    expect(store.save({ ...entry(1), title: 'Renamed' })).toEqual({ ok: true, count: 1 });
    const listed = store.list();
    expect(listed.ok && listed.items[0]?.title).toBe('Renamed');
  });

  it('load returns a deep-equal scenario; a missing id and an invalid stored scenario say so', () => {
    const storage = new MemoryStorage();
    const store = createScenarioStore(storage, { maxSaved: 10 });
    const saved = entry(3);
    store.save(saved);
    expect(store.load(saved.id)).toEqual({ ok: true, scenario: saved.scenario });
    expect(store.load('nope')).toEqual({ ok: false, reason: 'missing' });
    storage.data.set(SCENARIOS_KEY, JSON.stringify({ version: 1, scenarios: [{ ...saved, scenario: { schemaVersion: 1 } }] }));
    expect(store.load(saved.id)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('remove deletes one entry', () => {
    const store = createScenarioStore(new MemoryStorage(), { maxSaved: 10 });
    store.save(entry(1));
    store.save(entry(2));
    expect(store.remove('generated-1')).toEqual({ ok: true });
    const listed = store.list();
    expect(listed.ok && listed.items.map((i) => i.id)).toEqual(['generated-2']);
  });
});

describe('10.4 the bound is passed in', () => {
  it('refuses a new id at the bound with reason limit and writes nothing', () => {
    const storage = new MemoryStorage();
    const store = createScenarioStore(storage, { maxSaved: 3 });
    for (const seed of [1, 2, 3]) store.save(entry(seed));
    const before = storage.data.get(SCENARIOS_KEY);
    expect(store.save(entry(4))).toEqual({ ok: false, reason: 'limit' });
    expect(storage.data.get(SCENARIOS_KEY)).toBe(before);
    expect(store.save({ ...entry(1), title: 'again' })).toEqual({ ok: true, count: 3 });
  });
});

describe('10.5 write failures change nothing', () => {
  it('maps QuotaExceededError to quota with the error name, and leaves the list as it was', () => {
    const storage = new MemoryStorage();
    const store = createScenarioStore(storage, { maxSaved: 10 });
    store.save(entry(1));
    const before = storage.data.get(SCENARIOS_KEY);
    storage.failSet = 'QuotaExceededError';
    expect(store.save(entry(2))).toEqual({ ok: false, reason: 'quota', errorName: 'QuotaExceededError' });
    expect(storage.data.get(SCENARIOS_KEY)).toBe(before);
  });

  it('maps SecurityError and a null storage to unavailable', () => {
    const storage = new MemoryStorage();
    storage.failSet = 'SecurityError';
    expect(createScenarioStore(storage, { maxSaved: 10 }).save(entry(1))).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(createScenarioStore(null, { maxSaved: 10 }).save(entry(1))).toMatchObject({ ok: false, reason: 'unavailable' });
  });
});

describe('10.6 unreadable storage', () => {
  it('yields unreadable for a throwing getItem and for malformed JSON, never an exception', () => {
    const storage = new MemoryStorage();
    storage.failGet = true;
    expect(createScenarioStore(storage, { maxSaved: 10 }).list()).toEqual({ ok: false, reason: 'unreadable' });
    const bad = new MemoryStorage();
    bad.data.set(SCENARIOS_KEY, '{not json');
    expect(createScenarioStore(bad, { maxSaved: 10 }).list()).toEqual({ ok: false, reason: 'unreadable' });
    bad.data.set(SCENARIOS_KEY, JSON.stringify({ version: 2, scenarios: [] }));
    expect(createScenarioStore(bad, { maxSaved: 10 }).list()).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('an empty storage lists nothing', () => {
    expect(createScenarioStore(new MemoryStorage(), { maxSaved: 10 }).list()).toEqual({ ok: true, items: [] });
  });
});

describe('preferences', () => {
  it('reads the default when nothing is stored or storage throws, and round-trips a write', () => {
    expect(createPrefsStore(new MemoryStorage()).read()).toEqual({ version: 1, motion: 'system' });
    const broken = new MemoryStorage();
    broken.failGet = true;
    expect(createPrefsStore(broken).read()).toEqual({ version: 1, motion: 'system' });
    const storage = new MemoryStorage();
    createPrefsStore(storage).write({ version: 1, motion: 'reduce' });
    expect(JSON.parse(storage.data.get(PREFS_KEY) as string)).toEqual({ version: 1, motion: 'reduce' });
    expect(createPrefsStore(storage).read().motion).toBe('reduce');
  });

  it('a throwing write does not throw', () => {
    const storage = new MemoryStorage();
    storage.failSet = 'QuotaExceededError';
    expect(() => createPrefsStore(storage).write({ version: 1, motion: 'reduce' })).not.toThrow();
  });
});
