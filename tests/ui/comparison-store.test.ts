import { describe, expect, it } from 'vitest';
import { COMPARISON_SUMMARY_MAX_BYTES, type ComparisonSummary } from '../../src/comparison/summary';
import { COMPARISONS_KEY, MAX_SAVED_COMPARISONS, createComparisonStore } from '../../src/storage/comparisons';
import { summaryFixture } from './compareFixtures';

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

const withKey = (s: ComparisonSummary, key: string): ComparisonSummary => ({ ...s, key });

describe('createComparisonStore (12.6)', () => {
  it('saves newest first under rehearsal.comparisons.v1 and replaces an entry with the same key', async () => {
    const storage = new MemoryStorage();
    const store = createComparisonStore(storage);
    const base = await summaryFixture();
    expect(store.save(withKey(base, 'a'))).toEqual({ ok: true, count: 1 });
    expect(store.save(withKey(base, 'b'))).toEqual({ ok: true, count: 2 });
    expect(store.save(withKey(base, 'a'))).toEqual({ ok: true, count: 2 });
    const listed = store.list();
    expect(listed.ok && listed.items.map((s) => s.key)).toEqual(['a', 'b']);
    expect(JSON.parse(storage.getItem(COMPARISONS_KEY) as string).version).toBe(1);
  });

  it(`keeps at most ${MAX_SAVED_COMPARISONS} summaries, dropping the oldest`, async () => {
    const store = createComparisonStore(new MemoryStorage());
    const base = await summaryFixture();
    for (let i = 0; i < MAX_SAVED_COMPARISONS + 2; i += 1) store.save(withKey(base, `k${i}`));
    const listed = store.list();
    expect(listed.ok && listed.items.length).toBe(MAX_SAVED_COMPARISONS);
    expect(listed.ok && listed.items[0]?.key).toBe(`k${MAX_SAVED_COMPARISONS + 1}`);
  });

  it('refuses a summary above the byte bound with reason quota and changes nothing', async () => {
    const storage = new MemoryStorage();
    const store = createComparisonStore(storage);
    const base = await summaryFixture();
    const big: ComparisonSummary = { ...base, diff: { ...base.diff, changes: [{ ...(base.diff.changes[0] as ComparisonSummary['diff']['changes'][number]), text: 'x'.repeat(COMPARISON_SUMMARY_MAX_BYTES) }] } };
    expect(store.save(big)).toEqual({ ok: false, reason: 'quota' });
    expect(storage.getItem(COMPARISONS_KEY)).toBeNull();
  });

  it('maps a throwing setItem to quota or unavailable and keeps the error name', async () => {
    const storage = new MemoryStorage();
    const store = createComparisonStore(storage);
    const base = await summaryFixture();
    storage.failSet = 'QuotaExceededError';
    expect(store.save(base)).toEqual({ ok: false, reason: 'quota', errorName: 'QuotaExceededError' });
    storage.failSet = 'SecurityError';
    expect(store.save(base)).toEqual({ ok: false, reason: 'unavailable', errorName: 'SecurityError' });
    expect(createComparisonStore(null).save(base)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('reads unreadable storage as an empty failure and skips invalid entries', async () => {
    const storage = new MemoryStorage();
    const store = createComparisonStore(storage);
    const base = await summaryFixture();
    storage.setItem(COMPARISONS_KEY, JSON.stringify({ version: 1, summaries: [base, { nope: true }] }));
    const listed = store.list();
    expect(listed.ok && listed.items.length).toBe(1);
    storage.setItem(COMPARISONS_KEY, '{not json');
    expect(store.list()).toEqual({ ok: false, reason: 'unreadable' });
    storage.failGet = true;
    expect(store.list()).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('removes one entry by key', async () => {
    const store = createComparisonStore(new MemoryStorage());
    const base = await summaryFixture();
    store.save(withKey(base, 'a'));
    store.save(withKey(base, 'b'));
    expect(store.remove('a')).toEqual({ ok: true });
    const listed = store.list();
    expect(listed.ok && listed.items.map((s) => s.key)).toEqual(['b']);
  });
});
