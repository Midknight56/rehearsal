import { beforeAll, describe, expect, it } from 'vitest';
import { runPairedComparison, type ComparisonOutcome, type RunnerClock } from '../../src/comparison/runner';
import { replayLabel } from '../../src/comparison/labels';
import type { Comparison } from '../../src/comparison/comparison';
import { scenarioHash } from '../../src/domain/hash';
import { harborPlusOne } from './fixtures/pairs';
import { createInProcessClient } from './helpers/in-process-client';

const makeClock = (): RunnerClock => {
  let t = 0;
  return { now: () => (t += 250), isoNow: () => '2026-11-20T12:00:00.000Z' };
};

function complete(outcome: ComparisonOutcome): Comparison {
  if (outcome.status !== 'complete') throw new Error(`expected complete, got ${JSON.stringify(outcome)}`);
  return outcome.comparison;
}

describe('runPairedComparison, Harbor Hall baseline against the extra desk (row 24)', () => {
  const progress: [number, number][] = [];
  const client = createInProcessClient();
  let comparison: Comparison;
  beforeAll(async () => {
    const handle = runPairedComparison(client, harborPlusOne.baseline, harborPlusOne.candidate, {
      onProgress: (done, total) => progress.push([done, total]),
      clock: makeClock(),
    });
    comparison = complete(await handle.done);
  });

  it('makes exactly four runs in order with traces off, off, on, on', async () => {
    const baselineHash = await scenarioHash(harborPlusOne.baseline);
    const candidateHash = await scenarioHash(harborPlusOne.candidate);
    expect(client.runs.map((r) => r.trace)).toEqual([false, false, true, true]);
    expect(client.runs.map((r) => r.scenarioHash)).toEqual([baselineHash, candidateHash, baselineHash, candidateHash]);
    expect(client.runs.map((r) => r.replications.length)).toEqual([30, 30, 1, 1]);
    expect(client.runs[2]!.replications).toEqual([0]);
  });

  it('reports progress from (0, 62) to (62, 62) without decreasing', () => {
    expect(progress[0]).toEqual([0, 62]);
    expect(progress.at(-1)).toEqual([62, 62]);
    expect(progress).toHaveLength(63);
    for (let i = 1; i < progress.length; i += 1) expect(progress[i]![0]).toBeGreaterThanOrEqual(progress[i - 1]![0]);
    expect(progress.every(([, total]) => total === 62)).toBe(true);
  });

  it('holds 30 + 30 results in order with one seed and one model version', () => {
    expect(comparison.baselineResults.map((r) => r.replication)).toEqual([...Array(30).keys()]);
    expect(comparison.candidateResults.map((r) => r.replication)).toEqual([...Array(30).keys()]);
    expect(comparison.baselineResults.every((r) => r.trace === undefined)).toBe(true);
    expect(new Set([...comparison.baselineResults, ...comparison.candidateResults].map((r) => r.baseSeed))).toEqual(new Set(['harbor-hall-2026']));
    expect(comparison.modelVersion).toBe('0.1.0');
    expect(comparison.baseSeed).toBe('harbor-hall-2026');
    expect(comparison.horizonMs).toBe(2_400_000);
    expect(comparison.schemaVersion).toBe(1);
    expect(comparison.replications).toHaveLength(30);
  });

  it('labels the replay and matches the untraced metrics', () => {
    expect(comparison.replay.label).toBe(replayLabel(0));
    expect(comparison.replay.label).toBe('Replay of replication 0, one example run');
    expect(comparison.replay.replication).toBe(0);
    expect(comparison.replay.baseline.metrics).toEqual(comparison.baselineResults[0]!.metrics);
    expect(comparison.replay.candidate.metrics).toEqual(comparison.candidateResults[0]!.metrics);
    expect(comparison.traced.baseline[0]).toBe(comparison.replay.baseline);
  });

  it('assembles the record: key, refs, diff, population, language mode, timing', async () => {
    const baselineHash = await scenarioHash(harborPlusOne.baseline);
    const candidateHash = await scenarioHash(harborPlusOne.candidate);
    expect(comparison.baseline).toEqual({ id: 'harbor-hall-baseline', title: harborPlusOne.baseline.title, revision: 0, scenarioHash: baselineHash });
    expect(comparison.candidate.scenarioHash).toBe(candidateHash);
    expect(comparison.key).toBe(`0.1.0|harbor-hall-2026|${baselineHash}|${candidateHash}|30`);
    expect(comparison.diff.kind).toBe('single');
    expect(comparison.population.changed).toBe(false);
    expect(comparison.languageMode).toBe('person-for-person');
    expect(comparison.metrics).toHaveLength(11);
    expect(comparison.stations.map((s) => s.id)).toEqual(['checkin', 'packs']);
    expect(comparison.createdAt).toBe('2026-11-20T12:00:00.000Z');
    expect(comparison.timing.pairedMs).toBeGreaterThan(0);
    expect(comparison.timing.replayMs).toBeGreaterThan(0);
  });
});

describe('runPairedComparison, refusals before any run', () => {
  it('refuses different seeds', async () => {
    const client = createInProcessClient();
    const outcome = await runPairedComparison(client, harborPlusOne.baseline, { ...harborPlusOne.candidate, baseSeed: 'other' }).done;
    expect(outcome).toEqual({
      status: 'error', code: 'SEED_MISMATCH',
      message: 'Baseline and candidate use different seeds ("harbor-hall-2026" and "other"); give both the same seed to compare them run for run.',
    });
    expect(client.runs).toHaveLength(0);
  });

  it('refuses different observation windows', async () => {
    const client = createInProcessClient();
    const outcome = await runPairedComparison(client, harborPlusOne.baseline, { ...harborPlusOne.candidate, horizonMs: 3_000_000 }).done;
    expect(outcome).toEqual({
      status: 'error', code: 'HORIZON_MISMATCH',
      message: 'Baseline and candidate use different observation windows (40 min and 50 min); give both the same window to compare closing-time numbers.',
    });
    expect(client.runs).toHaveLength(0);
  });

  it('names the invalid scenario', async () => {
    const client = createInProcessClient();
    const bad = { ...harborPlusOne.candidate, stations: harborPlusOne.candidate.stations.map((s) => ({ ...s, servers: 0 })) };
    const outcome = await runPairedComparison(client, harborPlusOne.baseline, bad).done;
    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') {
      expect(outcome.code).toBe('INVALID_SCENARIO');
      expect(outcome.message.startsWith('Candidate: ')).toBe(true);
    }
    const first = await runPairedComparison(client, bad, harborPlusOne.baseline).done;
    if (first.status === 'error') expect(first.message.startsWith('Baseline: ')).toBe(true);
    expect(client.runs).toHaveLength(0);
  });
});

describe('runPairedComparison, cancel and failure', () => {
  it('cancels during the second run with no third run', async () => {
    const client = createInProcessClient();
    const handle = runPairedComparison(client, harborPlusOne.baseline, harborPlusOne.candidate, {
      onProgress: (done) => {
        if (done === 31) handle.cancel();
      },
    });
    const outcome = await handle.done;
    expect(outcome).toEqual({ status: 'cancelled', message: 'Comparison cancelled.' });
    expect(client.runs).toHaveLength(2);
  });

  it('cancels before the first run starts', async () => {
    const client = createInProcessClient();
    const handle = runPairedComparison(client, harborPlusOne.baseline, harborPlusOne.candidate);
    handle.cancel();
    expect(await handle.done).toEqual({ status: 'cancelled', message: 'Comparison cancelled.' });
    expect(client.runs).toHaveLength(0);
  });

  it('reports a failed candidate run and starts nothing after it', async () => {
    const candidateHash = await scenarioHash(harborPlusOne.candidate);
    const client = createInProcessClient({ failAt: { scenarioHash: candidateHash, replication: 3 } });
    const outcome = await runPairedComparison(client, harborPlusOne.baseline, harborPlusOne.candidate).done;
    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') {
      expect(outcome.code).toBe('RUN_FAILED');
      expect(outcome.message.startsWith('Comparison failed: ')).toBe(true);
    }
    expect(client.runs).toHaveLength(2);
  });

  it('detects a traced run that disagrees with the untraced one', async () => {
    const client = createInProcessClient({ alterTracedMetrics: true });
    const outcome = await runPairedComparison(client, harborPlusOne.baseline, harborPlusOne.candidate).done;
    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') {
      expect(outcome.code).toBe('NONDETERMINISTIC');
      expect(outcome.message).toBe('Traced and untraced runs of replication 0 disagree; this is an engine defect and nothing was shown.');
    }
  });
});
