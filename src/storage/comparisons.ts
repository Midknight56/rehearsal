// Saved comparison summaries under localStorage['rehearsal.comparisons.v1'] as { version: 1, summaries } (newest first).
// A summary holds no scenarios, results, traces or per-replication differences (comparison spec 9.3), at most
// COMPARISON_SUMMARY_MAX_BYTES each. Every storage call is wrapped; a failed write changes nothing.
import { COMPARISON_SUMMARY_MAX_BYTES, fromComparisonSummary, summaryBytes, type ComparisonSummary } from '../comparison/summary';
import type { SaveFailure } from './scenarios';

export const COMPARISONS_KEY = 'rehearsal.comparisons.v1';
export const MAX_SAVED_COMPARISONS = 10;

export type ComparisonStore = {
  list(): { ok: true; items: ComparisonSummary[]; skipped: number } | { ok: false; reason: 'unreadable' };
  save(summary: ComparisonSummary): { ok: true; count: number } | SaveFailure;
  remove(key: string): { ok: true } | SaveFailure;
};

function errorNameOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && typeof (error as { name?: unknown }).name === 'string') return (error as { name: string }).name;
  return 'Error';
}

function failureOf(error: unknown): SaveFailure {
  const errorName = errorNameOf(error);
  return { ok: false, reason: errorName === 'QuotaExceededError' ? 'quota' : 'unavailable', errorName };
}

export function createComparisonStore(storage: Storage | null): ComparisonStore {
  const read = (): { ok: true; entries: unknown[] } | { ok: false } => {
    if (storage === null) return { ok: false };
    try {
      const raw = storage.getItem(COMPARISONS_KEY);
      if (raw === null) return { ok: true, entries: [] };
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return { ok: false };
      const { version, summaries } = parsed as { version?: unknown; summaries?: unknown };
      return version === 1 && Array.isArray(summaries) ? { ok: true, entries: summaries } : { ok: false };
    } catch {
      return { ok: false };
    }
  };

  const validEntries = (entries: unknown[]): ComparisonSummary[] =>
    entries.flatMap((entry) => {
      const parsed = fromComparisonSummary(JSON.stringify(entry));
      return parsed.ok ? [parsed.summary] : [];
    });

  const write = (summaries: ComparisonSummary[]): { ok: true } | SaveFailure => {
    if (storage === null) return { ok: false, reason: 'unavailable' };
    try {
      storage.setItem(COMPARISONS_KEY, JSON.stringify({ version: 1, summaries }));
      return { ok: true };
    } catch (error) {
      return failureOf(error);
    }
  };

  return {
    list() {
      const current = read();
      if (!current.ok) return { ok: false, reason: 'unreadable' };
      const items = validEntries(current.entries);
      return { ok: true, items, skipped: current.entries.length - items.length };
    },
    save(summary) {
      if (storage === null) return { ok: false, reason: 'unavailable' };
      if (summaryBytes(summary) > COMPARISON_SUMMARY_MAX_BYTES) return { ok: false, reason: 'quota' };
      const current = read();
      if (!current.ok) return { ok: false, reason: 'unavailable' };
      const next = [summary, ...validEntries(current.entries).filter((s) => s.key !== summary.key)].slice(0, MAX_SAVED_COMPARISONS);
      const written = write(next);
      return written.ok ? { ok: true, count: next.length } : written;
    },
    remove(key) {
      const current = read();
      if (!current.ok) return { ok: false, reason: 'unavailable' };
      return write(validEntries(current.entries).filter((s) => s.key !== key));
    },
  };
}
