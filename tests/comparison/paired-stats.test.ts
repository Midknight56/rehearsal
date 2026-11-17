import { beforeAll, describe, expect, it } from 'vitest';
import { RANGE_LABEL } from '../../src/comparison/labels';
import { METRIC_KEYS, readMetric, readStationMetric } from '../../src/comparison/metric-keys';
import { pairResults, type PairedMetric, type PairResult } from '../../src/comparison/paired';
import type { RunResult } from '../../src/simulation/simulate';
import { harborPlusOne, rowOnePair } from './fixtures/pairs';
import { resultsFor } from './helpers/results';

function ok(result: PairResult) {
  if (!result.ok) throw new Error(`pairResults failed: ${result.message}`);
  return result;
}
const find = (metrics: PairedMetric[], key: string): PairedMetric => {
  const found = metrics.find((m) => m.key === key);
  if (found === undefined) throw new Error(`no metric ${key}`);
  return found;
};

describe('row 23: the row 1 and row 2 pair', () => {
  let paired: ReturnType<typeof ok>;
  beforeAll(async () => {
    const [b, c] = await Promise.all([resultsFor(rowOnePair.baseline), resultsFor(rowOnePair.candidate)]);
    paired = ok(pairResults(b, c, { baseline: rowOnePair.baseline.stations, candidate: rowOnePair.candidate.stations }));
  });

  it('gives the hand-calculated queue-wait statistics', () => {
    const mean = find(paired.metrics, 'queueWait.mean');
    expect(mean.differences).toHaveLength(30);
    expect(mean.differences.every((d) => d.difference === -30_000)).toBe(true);
    expect(mean.meanChange).toBe(-30_000);
    expect(mean.rangeP10).toBe(-30_000);
    expect(mean.rangeP90).toBe(-30_000);
    expect(mean.improved).toBe(30);
    expect(mean.worsened).toBe(0);
    expect(mean.unchanged).toBe(0);
    expect(mean.n).toBe(30);
    expect(find(paired.metrics, 'queueWait.p95').meanChange).toBe(-60_000);
    expect(find(paired.metrics, 'journeyTime.mean').meanChange).toBe(-30_000);
  });

  it('counts the unchanged completions and leaves staff-hours without counts', () => {
    const completed = find(paired.metrics, 'completedByClosing');
    expect(completed.unchanged).toBe(30);
    expect(completed.improved).toBe(0);
    const staff = find(paired.metrics, 'staffHours');
    expect(Math.abs((staff.meanChange as number) - 0.05)).toBeLessThan(1e-12);
    expect([staff.improved, staff.worsened, staff.unchanged]).toEqual([null, null, null]);
  });

  it('pairs the station metrics', () => {
    expect(paired.stations).toHaveLength(1);
    const station = paired.stations[0]!;
    expect(station.id).toBe('s');
    expect(station.presence).toBe('both');
    expect(find(station.metrics, 'stations.s.utilization').meanChange).toBe(-0.5);
    expect(find(station.metrics, 'stations.s.averageQueueLength').meanChange).toBe(-0.5);
    expect(find(station.metrics, 'stations.s.maxQueueLength').meanChange).toBe(-1);
    expect(find(station.metrics, 'stations.s.utilization').improved).toBeNull();
  });

  it('labels every range with the fixed label and carries no conditioning', () => {
    const all = [...paired.metrics, ...paired.stations.flatMap((s) => s.metrics)];
    expect(all.every((m) => m.rangeLabel === RANGE_LABEL)).toBe(true);
    expect(all.every((m) => !m.conditioned && m.note === null)).toBe(true);
    expect(paired.completion).toEqual({ baselineCapped: 0, candidateCapped: 0 });
  });
});

describe('row 24: Harbor Hall baseline against the extra check-in desk', () => {
  let baseline: RunResult[];
  let candidate: RunResult[];
  let paired: ReturnType<typeof ok>;
  beforeAll(async () => {
    [baseline, candidate] = await Promise.all([resultsFor(harborPlusOne.baseline), resultsFor(harborPlusOne.candidate)]);
    paired = ok(pairResults(baseline, candidate, { baseline: harborPlusOne.baseline.stations, candidate: harborPlusOne.candidate.stations }));
  });

  it('matches the recomputed mean and count for every directional global metric', () => {
    for (const { key, direction } of METRIC_KEYS) {
      const metric = find(paired.metrics, key);
      const diffs: number[] = [];
      for (let r = 0; r < 30; r += 1) {
        const b = readMetric(baseline[r]!.metrics, key).value;
        const c = readMetric(candidate[r]!.metrics, key).value;
        if (b !== null && c !== null) diffs.push(c - b);
      }
      expect(metric.n).toBe(diffs.length);
      if (diffs.length > 0) {
        const mean = diffs.reduce((a, d) => a + d, 0) / diffs.length;
        expect(Math.abs((metric.meanChange as number) - mean)).toBeLessThan(1e-9);
      } else {
        expect(metric.meanChange).toBeNull();
      }
      if (direction === 'lower') expect(metric.improved).toBe(diffs.filter((d) => d < 0).length);
      if (direction === 'higher') expect(metric.improved).toBe(diffs.filter((d) => d > 0).length);
      if (direction === 'none') expect(metric.improved).toBeNull();
    }
    expect(find(paired.metrics, 'queueWait.mean').n).toBe(30);
  });

  it('reads units and populations from the engine metrics', () => {
    for (const { key } of METRIC_KEYS) {
      const engine = readMetric(baseline[0]!.metrics, key);
      const metric = find(paired.metrics, key);
      expect(metric.unit).toBe(engine.unit);
      expect(metric.population).toBe(engine.population);
    }
    const station = paired.stations.find((s) => s.id === 'checkin')!;
    const engine = readStationMetric(baseline[0]!.metrics, 'checkin', 'utilization')!;
    expect(find(station.metrics, 'stations.checkin.utilization').unit).toBe(engine.unit);
    expect(find(station.metrics, 'stations.checkin.utilization').population).toBe(engine.population);
  });

  it('keeps range endpoints among the observed differences', () => {
    const metric = find(paired.metrics, 'queueWait.mean');
    const observed = metric.differences.map((d) => d.difference as number);
    expect(observed).toContain(metric.rangeP10);
    expect(observed).toContain(metric.rangeP90);
    expect(metric.rangeP10 as number).toBeLessThanOrEqual(metric.rangeP90 as number);
  });
});

describe('requirement 2.7: the drain cap', () => {
  it('conditions completed-journey metrics and writes the exact note', async () => {
    const baseline = await resultsFor(harborPlusOne.baseline);
    const candidate = await resultsFor(harborPlusOne.candidate);
    candidate[4] = { ...candidate[4]!, completion: 'drain-capped', unfinished: ['doors#0001'] };
    const paired = ok(pairResults(baseline, candidate, { baseline: harborPlusOne.baseline.stations, candidate: harborPlusOne.candidate.stations }));
    const mean = find(paired.metrics, 'queueWait.mean');
    expect(mean.conditioned).toBe(true);
    expect(mean.note).toBe('0 of 30 baseline runs and 1 of 30 candidate runs hit the drain cap; completed-journey metrics count completed attendees only');
    expect(find(paired.metrics, 'completedByClosing').conditioned).toBe(false);
    expect(find(paired.metrics, 'completedByClosing').note).toBeNull();
    expect(paired.completion).toEqual({ baselineCapped: 0, candidateCapped: 1 });
  });
});

describe('requirement 2.2: input checks', () => {
  const stations = { baseline: harborPlusOne.baseline.stations, candidate: harborPlusOne.candidate.stations };
  it('refuses incomplete results', async () => {
    const baseline = await resultsFor(harborPlusOne.baseline);
    const candidate = await resultsFor(harborPlusOne.candidate);
    const result = pairResults(baseline.slice(0, 29), candidate, stations);
    expect(result).toEqual({ ok: false, code: 'INCOMPLETE_RESULTS', message: 'Baseline has results for 29 of 30 replications; rerun the comparison.' });
    const other = pairResults(baseline, candidate.slice(1), stations);
    expect(other).toMatchObject({ ok: false, code: 'INCOMPLETE_RESULTS' });
    if (!other.ok) expect(other.message).toBe('Candidate has results for 29 of 30 replications; rerun the comparison.');
  });

  it('refuses mixed model versions, seeds and horizons', async () => {
    const baseline = await resultsFor(harborPlusOne.baseline);
    const candidate = await resultsFor(harborPlusOne.candidate);
    const version = candidate.map((r) => ({ ...r, modelVersion: '0.2.0' }));
    expect(pairResults(baseline, version, stations)).toMatchObject({ ok: false, code: 'MODEL_VERSION_MISMATCH' });
    const seed = candidate.map((r) => ({ ...r, baseSeed: 'other' }));
    expect(pairResults(baseline, seed, stations)).toMatchObject({ ok: false, code: 'SEED_MISMATCH' });
    const horizon = candidate.map((r) => ({ ...r, horizonMs: 3_000_000 }));
    expect(pairResults(baseline, horizon, stations)).toMatchObject({ ok: false, code: 'HORIZON_MISMATCH' });
  });

  it('refuses results listed out of replication order', async () => {
    const baseline = await resultsFor(harborPlusOne.baseline);
    const candidate = await resultsFor(harborPlusOne.candidate);
    const swapped = [...baseline];
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    expect(pairResults(swapped, candidate, stations)).toMatchObject({ ok: false, code: 'INCOMPLETE_RESULTS' });
  });
});

describe('stations present on one side only', () => {
  it('marks presence and reports n 0 with null counts for a none-direction metric', async () => {
    const baseline = await resultsFor(harborPlusOne.baseline);
    const candidate = await resultsFor(harborPlusOne.candidate);
    const extra = { ...harborPlusOne.candidate.stations[0]!, id: 'zeta', label: 'Zeta' };
    const paired = ok(pairResults(baseline, candidate, { baseline: harborPlusOne.baseline.stations, candidate: [...harborPlusOne.candidate.stations, extra] }));
    const zeta = paired.stations.find((s) => s.id === 'zeta')!;
    expect(zeta.presence).toBe('candidate-only');
    expect(zeta.label).toBe('Zeta');
    const util = find(zeta.metrics, 'stations.zeta.utilization');
    expect(util.n).toBe(0);
    expect(util.meanChange).toBeNull();
    expect(util.improved).toBeNull();
    expect(paired.stations.map((s) => s.id)).toEqual(['checkin', 'packs', 'zeta']);
  });
});
