import { beforeAll, describe, expect, it } from 'vitest';
import type { Comparison } from '../../src/comparison/comparison';
import { CANDIDATE_STYLE, GHOST_LEGEND, GHOST_STYLE, selectReplay } from '../../src/comparison/replay-contract';
import { runPairedComparison, selectReplicate } from '../../src/comparison/runner';
import { harborPlusOne } from './fixtures/pairs';
import { createInProcessClient } from './helpers/in-process-client';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

describe('replay selection (requirements 5.1 to 5.6)', () => {
  const client = createInProcessClient();
  let comparison: Comparison;
  beforeAll(async () => {
    const outcome = await runPairedComparison(client, harborPlusOne.baseline, harborPlusOne.candidate).done;
    if (outcome.status !== 'complete') throw new Error('comparison did not complete');
    comparison = deepFreeze(outcome.comparison);
  });

  it('starts at replication 0 with one clock that covers both traces', () => {
    const { replay } = comparison;
    expect(replay.label).toBe('Replay of replication 0, one example run');
    const last = (events: { timeMs: number }[]) => events.reduce((max, e) => Math.max(max, e.timeMs), 0);
    const endMs = Math.max(last(replay.baseline.trace!.events), last(replay.candidate.trace!.events));
    expect(replay.clock.endMs).toBe(endMs);
    expect(replay.clock.endMs).toBeGreaterThanOrEqual(last(replay.baseline.trace!.events));
    expect(replay.clock.endMs).toBeGreaterThanOrEqual(last(replay.candidate.trace!.events));
    expect(replay.clock.horizonMs).toBe(2_400_000);
    expect(replay.baseline.replication).toBe(replay.candidate.replication);
  });

  it('switches replicate with two traced runs and leaves the input comparison unchanged', async () => {
    const before = client.runs.length;
    const outcome = await selectReplicate(client, comparison, 7).done;
    expect(outcome.status).toBe('complete');
    if (outcome.status !== 'complete') return;
    const next = outcome.comparison;
    expect(client.runs.slice(before).map((r) => [r.replications, r.trace])).toEqual([[[7], true], [[7], true]]);
    expect(next).not.toBe(comparison);
    expect(next.replay.replication).toBe(7);
    expect(next.replay.label).toBe('Replay of replication 7, one example run');
    expect(next.replay.baseline.metrics).toEqual(next.baselineResults[7]!.metrics);
    expect(next.replay.candidate.metrics).toEqual(next.candidateResults[7]!.metrics);
    expect(Object.keys(next.traced.baseline).map(Number).sort()).toEqual([0, 7]);
    expect(comparison.replay.replication).toBe(0);
    expect(Object.keys(comparison.traced.baseline)).toEqual(['0']);
    expect(next.key).toBe(comparison.key);
    expect(next.metrics).toBe(comparison.metrics);
  });

  it('selectReplay gives the loaded replicate, a range error and a not-loaded error', () => {
    const loaded = selectReplay(comparison, 0);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.selection.replication).toBe(0);
    expect(selectReplay(comparison, 30)).toEqual({ ok: false, code: 'REPLICATION_RANGE', message: 'Replication must be between 0 and 29.' });
    expect(selectReplay(comparison, -1)).toMatchObject({ ok: false, code: 'REPLICATION_RANGE' });
    expect(selectReplay(comparison, 3)).toEqual({ ok: false, code: 'TRACE_NOT_LOADED', message: 'Replication 3 has not been loaded for replay yet.' });
  });

  it('selects a replicate that selectReplicate loaded earlier without running again', async () => {
    const outcome = await selectReplicate(client, comparison, 7).done;
    if (outcome.status !== 'complete') throw new Error('expected complete');
    const before = client.runs.length;
    const again = await selectReplicate(client, outcome.comparison, 0).done;
    expect(again.status).toBe('complete');
    expect(client.runs.length).toBe(before);
    const selected = selectReplay(outcome.comparison, 7);
    expect(selected.ok).toBe(true);
  });

  it('rejects an out-of-range replicate without running', async () => {
    const before = client.runs.length;
    const outcome = await selectReplicate(client, comparison, 30).done;
    expect(outcome.status).toBe('error');
    expect(client.runs.length).toBe(before);
  });

  it('carries the ghost style constants', () => {
    expect(GHOST_STYLE).toEqual({ role: 'baseline', alpha: 0.45, outline: 'dashed', fill: 'hatched', hue: 'orange' });
    expect(CANDIDATE_STYLE).toEqual({ role: 'candidate', alpha: 1, outline: 'solid', fill: 'solid', hue: 'cyan' });
    expect(GHOST_LEGEND).toBe('Baseline: dashed outline, hatched, translucent · Candidate: solid');
  });
});
