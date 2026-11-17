import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { expect } from 'vitest';
import { countSentence } from '../../src/comparison/labels';
import { METRIC_KEYS } from '../../src/comparison/metric-keys';
import { pairResults, type PairedMetric } from '../../src/comparison/paired';
import { percentileIndex } from '../../src/comparison/percentiles';
import { diffScenarios } from '../../src/comparison/diff';
import { populationChange } from '../../src/comparison/population';
import { buildReplaySelection } from '../../src/comparison/replay-contract';
import { fromComparisonSummary, summaryBytes, toComparisonSummary } from '../../src/comparison/summary';
import type { Cohort, Scenario } from '../../src/domain/scenario';
import { canonicalJson, scenarioHash } from '../../src/domain/hash';
import { escapeHtml } from '../../src/exports/html-escape';
import { exportScenarioJson, parseScenarioExport } from '../../src/exports/scenario-json';
import { p95Index } from '../../src/simulation/metrics';
import { validScenario } from '../model/helpers/arbitraries';
import { runOnce } from '../model/helpers/run';
import { comparisonArb, metricsArb, scenarioPairArb, stationsOf, stringArb } from './helpers/arbitraries';
import { checkProperty } from './helpers/property';

const allMetrics = (paired: Extract<ReturnType<typeof pairResults>, { ok: true }>): PairedMetric[] => [
  ...paired.metrics, ...paired.stations.flatMap((s) => s.metrics),
];
function pairOk(baseline: Parameters<typeof pairResults>[0], candidate: Parameters<typeof pairResults>[1], ids: string[]) {
  const result = pairResults(baseline, candidate, { baseline: stationsOf(ids), candidate: stationsOf(ids) });
  if (!result.ok) throw new Error(result.message);
  return result;
}
function numbersIn(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => numbersIn(v, out));
  else if (value !== null && typeof value === 'object') Object.values(value).forEach((v) => numbersIn(v, out));
  return out;
}

describe('properties of the paired comparison', () => {
  it('P1 pairing identity', () => checkProperty('P1 pairing identity', metricsArb(), ({ baseline, stationIds }) => {
    const paired = pairOk(baseline, baseline, stationIds);
    for (const m of allMetrics(paired)) {
      if (m.n > 0) {
        expect(m.meanChange).toBe(0);
        expect(m.rangeP10).toBe(0);
        expect(m.rangeP90).toBe(0);
      }
      if (m.betterDirection !== 'none') {
        expect(m.improved).toBe(0);
        expect(m.worsened).toBe(0);
        expect(m.unchanged).toBe(m.n);
      }
    }
  }));

  it('P2 antisymmetry of mean and counts', () => checkProperty('P2 antisymmetry', metricsArb(), ({ baseline, candidate, stationIds }) => {
    const ab = allMetrics(pairOk(baseline, candidate, stationIds));
    const ba = allMetrics(pairOk(candidate, baseline, stationIds));
    ab.forEach((m, i) => {
      const other = ba[i] as PairedMetric;
      expect(other.key).toBe(m.key);
      expect(other.n).toBe(m.n);
      expect(other.unchanged).toBe(m.unchanged);
      expect(other.worsened).toBe(m.improved);
      expect(other.improved).toBe(m.worsened);
      if (m.meanChange === null) expect(other.meanChange).toBeNull();
      else expect(Math.abs(m.meanChange + (other.meanChange as number))).toBeLessThanOrEqual(1e-9);
    });
  }));

  it('P3 range order', () => checkProperty('P3 range order', metricsArb(), ({ baseline, candidate, stationIds }) => {
    for (const m of allMetrics(pairOk(baseline, candidate, stationIds))) {
      const observed = m.differences.map((d) => d.difference).filter((d): d is number => d !== null).sort((a, b) => a - b);
      if (observed.length === 0) {
        expect(m.rangeP10).toBeNull();
        expect(m.rangeP90).toBeNull();
        continue;
      }
      expect(m.rangeP10 as number).toBeLessThanOrEqual(m.rangeP90 as number);
      expect(observed).toContain(m.rangeP10);
      expect(observed).toContain(m.rangeP90);
      expect(m.rangeP10 as number).toBeGreaterThanOrEqual(observed[0] as number);
      expect(m.rangeP90 as number).toBeLessThanOrEqual(observed.at(-1) as number);
    }
  }));

  it('P4 count partition and the null rule', () => checkProperty('P4 partition and nulls', metricsArb(), ({ baseline, candidate, stationIds }) => {
    const paired = pairOk(baseline, candidate, stationIds);
    const anyCapped = [...baseline, ...candidate].some((r) => r.completion === 'drain-capped');
    for (const m of allMetrics(paired)) {
      expect(m.differences).toHaveLength(30);
      expect(m.n).toBe(m.differences.filter((d) => d.baseline !== null && d.candidate !== null).length);
      if (m.betterDirection === 'none') expect([m.improved, m.worsened, m.unchanged]).toEqual([null, null, null]);
      else expect((m.improved as number) + (m.worsened as number) + (m.unchanged as number)).toBe(m.n);
      expect(m.conditioned).toBe(m.population === 'completedJourney' && anyCapped);
      expect(m.note === null).toBe(!m.conditioned);
      expect(numbersIn(m).every((v) => Number.isFinite(v))).toBe(true);
    }
  }));

  it('P5 percentile index', () => checkProperty(
    'P5 percentile index',
    fc.tuple(fc.integer({ min: 1, max: 5_000 }), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true })),
    ([n, p, q]) => {
      const [low, high] = p <= q ? [p, q] : [q, p];
      const a = percentileIndex(low, n);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(n - 1);
      expect(percentileIndex(high, n)).toBeGreaterThanOrEqual(a);
      expect(percentileIndex(low, n + 1)).toBeGreaterThanOrEqual(a);
      expect(percentileIndex(0.95, n)).toBe(p95Index(n));
    },
  ));

  it('P6 population detection', () => checkProperty(
    'P6 population detection',
    fc.tuple(
      fc.array(fc.tuple(fc.constantFrom('a', 'b', 'c', 'd', 'e'), fc.nat(5)), { maxLength: 5 }),
      fc.array(fc.tuple(fc.constantFrom('a', 'b', 'c', 'd', 'e'), fc.nat(5)), { maxLength: 5 }),
    ),
    ([left, right]) => {
      const cohorts = (pairs: [string, number][]): Cohort[] =>
        [...new Map(pairs).entries()].map(([id, count]) => ({ id, startMs: 0, endMs: 1_000, count, arrivals: 'even', route: [] }));
      const a: Scenario = { ...(tenStationsBase()), cohorts: cohorts(left) };
      const b: Scenario = { ...a, cohorts: cohorts(right) };
      const change = populationChange(a, b);
      const x = new Map(left);
      const y = new Map(right);
      const differing = [...new Set([...x.keys(), ...y.keys()])].filter((id) => x.get(id) !== y.get(id));
      expect(change.changed).toBe(differing.length > 0);
      expect(change.details).toHaveLength(differing.length);
      expect(populationChange(a, a).changed).toBe(false);
    },
  ));

  it('P7 diff completeness', () => checkProperty('P7 diff completeness', scenarioPairArb(validScenario), (pair) => {
    const diff = diffScenarios(pair.baseline, pair.candidate);
    const real = diff.changes.filter((c) => !c.derived).map((c) => c.path).sort();
    expect(real).toEqual(pair.expectedPaths);
    expect(new Set(real).size).toBe(real.length);
    expect(diff.kind).toBe(real.length === 0 ? 'none' : real.length === 1 ? 'single' : 'combined');
    expect(diff.changes.filter((c) => c.derived).every((c) => c.group === 'derived')).toBe(true);
    const lastReal = diff.changes.map((c) => c.derived).lastIndexOf(false);
    const firstDerived = diff.changes.map((c) => c.derived).indexOf(true);
    if (firstDerived >= 0) expect(firstDerived).toBeGreaterThan(lastReal);
    if (pair.expectedPaths.length === 0) expect(diffScenarios(pair.baseline, pair.candidate).changes.filter((c) => !c.derived)).toEqual([]);
  }));

  it('P8 language mode', () => checkProperty('P8 language mode', comparisonArb, (c) => {
    expect(c.languageMode).toBe(c.population.changed ? 'population' : 'person-for-person');
    for (const m of c.metrics.filter((x) => x.betterDirection !== 'none')) {
      const sentence = countSentence({
        direction: m.betterDirection as 'lower' | 'higher', metricLabel: m.label.toLowerCase(), improved: m.improved, n: m.n,
        languageMode: c.languageMode, baselineCount: c.population.baselineCount, candidateCount: c.population.candidateCount,
      });
      expect(sentence.includes('the same simulated attendees')).toBe(!c.population.changed);
    }
    expect(c.diff.changes.filter((e) => e.group === 'population')).toHaveLength(c.population.changed ? 1 : 0);
    expect(c.diff.changes[0]?.group === 'population').toBe(c.population.changed);
  }));

  it('P9 summary bound', () => checkProperty('P9 summary bound', comparisonArb, (c) => {
    const summary = toComparisonSummary(c);
    const json = JSON.stringify(summary);
    expect(summaryBytes(summary)).toBeLessThanOrEqual(32_768);
    expect(json).not.toContain('"differences"');
    expect(json).not.toContain('"segments"');
    const back = fromComparisonSummary(json);
    expect(back.ok).toBe(true);
  }));

  it('P10 export round trip', () => checkProperty(
    'P10 export round trip',
    fc.tuple(validScenario, stringArb),
    async ([scenario, title]) => {
      const hash = await scenarioHash(scenario);
      const results = await Promise.all([0, 1].map((r) => runOnce(scenario, r, false)));
      const text = exportScenarioJson({ scenario: { ...scenario, title }, scenarioHash: hash, results, generatedAt: '2026-11-20T12:00:00.000Z' });
      const parsed = await parseScenarioExport(text);
      if (!parsed.ok) throw new Error(`parse failed: ${parsed.message}`);
      expect(canonicalJson(parsed.scenario)).toBe(canonicalJson(scenario));
      expect(await scenarioHash(parsed.scenario)).toBe(hash);
      expect(parsed.scenario.title).toBe(title);
      expect(parsed.warnings).toEqual([]);
      expect(parsed.results).toEqual(JSON.parse(JSON.stringify(results.map((r) => ({ replication: r.replication, completion: r.completion, unfinished: r.unfinished, metrics: r.metrics })))));

      const changed = JSON.parse(text);
      changed.scenario.horizonMs += 1_000;
      const after = await parseScenarioExport(JSON.stringify(changed));
      if (!after.ok) throw new Error(`parse failed: ${after.message}`);
      expect(after.results).toEqual([]);
      expect(after.warnings.map((w) => w.code)).toContain('HASH_MISMATCH');
    },
    { numRuns: 100 },
  ));

  it('P11 escaping (text half; the rendered-document half belongs to tasks 12 and 13)', () => checkProperty('P11 escaping', stringArb, (s) => {
    const out = escapeHtml(s);
    expect(out).not.toMatch(/[<>"']/);
    expect(out).not.toMatch(/&(?!(amp|lt|gt|quot|#39);)/);
  }));

  it('P14 replay clock', () => checkProperty(
    'P14 replay clock',
    fc.tuple(validScenario, fc.integer({ min: 0, max: 5 })),
    async ([scenario, replication]) => {
      const candidate: Scenario = { ...scenario, stations: scenario.stations.map((s) => ({ ...s, servers: Math.min(20, s.servers + 1) })) };
      const [left, right] = await Promise.all([runOnce(scenario, replication, true), runOnce(candidate, replication, true)]);
      const selection = buildReplaySelection(left, right, replication);
      const last = (events: { timeMs: number }[]): number => events.reduce((max, e) => Math.max(max, e.timeMs), 0);
      expect(selection.clock.endMs).toBeGreaterThanOrEqual(last(left.trace!.events));
      expect(selection.clock.endMs).toBeGreaterThanOrEqual(last(right.trace!.events));
      expect(selection.clock.horizonMs).toBe(left.horizonMs);
      expect(selection.clock.horizonMs).toBe(right.horizonMs);
      expect(selection.baseline.replication).toBe(selection.candidate.replication);
      expect(selection.replication).toBe(replication);
    },
    { numRuns: 100 },
  ));
});

function tenStationsBase(): Scenario {
  return {
    schemaVersion: 1, id: 'p6', revision: 0, title: 'p6', modelVersion: '0.1.0', baseSeed: 'p6', horizonMs: 60_000,
    layout: { cols: 1, rows: 1, cellSizeM: 0.5, blockedCells: [], entrance: [0, 0], exit: [0, 0] },
    walkSpeedMps: 1, stations: [], cohorts: [], notes: '',
  };
}
