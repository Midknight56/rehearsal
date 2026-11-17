import { beforeAll, describe, expect, it } from 'vitest';
import { isComparisonCurrent, type Comparison } from '../../src/comparison/comparison';
import { runPairedComparison } from '../../src/comparison/runner';
import {
  COMPARISON_SUMMARY_MAX_BYTES, SAVED_SCENARIO_LIMIT, fromComparisonSummary, summaryBytes, toComparisonSummary,
} from '../../src/comparison/summary';
import { harborPlusOne } from './fixtures/pairs';
import { tenStations, tenStationsPlusOne } from './fixtures/ten-stations';
import { createInProcessClient } from './helpers/in-process-client';

async function compare(baseline: typeof tenStations, candidate: typeof tenStations): Promise<Comparison> {
  const outcome = await runPairedComparison(createInProcessClient(), baseline, candidate).done;
  if (outcome.status !== 'complete') throw new Error(`comparison failed: ${JSON.stringify(outcome)}`);
  return outcome.comparison;
}

describe('comparison summary (requirements 9.1, 9.3, 9.6)', () => {
  let harbor: Comparison;
  let ten: Comparison;
  beforeAll(async () => {
    harbor = await compare(harborPlusOne.baseline, harborPlusOne.candidate);
    ten = await compare(tenStations, tenStationsPlusOne);
  });

  it('stays within 32,768 bytes and prints both sizes', () => {
    const harborBytes = summaryBytes(toComparisonSummary(harbor));
    const tenBytes = summaryBytes(toComparisonSummary(ten));
    process.stdout.write(`summaryBytes harbor-hall=${harborBytes} ten-stations=${tenBytes}\n`);
    expect(COMPARISON_SUMMARY_MAX_BYTES).toBe(32_768);
    expect(SAVED_SCENARIO_LIMIT).toBe(10);
    expect(harborBytes).toBeLessThanOrEqual(COMPARISON_SUMMARY_MAX_BYTES);
    expect(tenBytes).toBeLessThanOrEqual(COMPARISON_SUMMARY_MAX_BYTES);
    expect(ten.stations).toHaveLength(10);
  });

  it('drops scenarios, results, traces and every differences array', () => {
    const summary = toComparisonSummary(harbor);
    const json = JSON.stringify(summary);
    expect(json).not.toContain('"differences"');
    expect(json).not.toContain('"segments"');
    expect(json).not.toContain('"trace"');
    expect(Object.keys(summary)).not.toContain('baselineScenario');
    expect(Object.keys(summary)).not.toContain('baselineResults');
    expect(Object.keys(summary)).not.toContain('traced');
    expect(summary.replay).toEqual({ replication: 0 });
    expect(summary.metrics).toHaveLength(11);
    expect(summary.key).toBe(harbor.key);
  });

  it('round-trips a summary', () => {
    const summary = toComparisonSummary(harbor);
    const json = JSON.stringify(summary);
    const back = fromComparisonSummary(json);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.restored).toBe(true);
      expect(back.summary).toEqual(JSON.parse(json));
    }
  });

  it('returns SUMMARY_INVALID for anything else', () => {
    const invalid = { ok: false, code: 'SUMMARY_INVALID', message: 'The saved comparison summary could not be read; rerun the comparison.' };
    expect(fromComparisonSummary('{}')).toEqual(invalid);
    expect(fromComparisonSummary('not json')).toEqual(invalid);
    expect(fromComparisonSummary('null')).toEqual(invalid);
    const broken = JSON.parse(JSON.stringify(toComparisonSummary(harbor)));
    broken.metrics[0].rangeLabel = 'confidence interval';
    expect(fromComparisonSummary(JSON.stringify(broken))).toEqual(invalid);
  });

  it('knows whether a comparison is current', () => {
    expect(isComparisonCurrent(harbor, harbor.baseline.scenarioHash, harbor.candidate.scenarioHash)).toBe(true);
    expect(isComparisonCurrent(harbor, 'f'.repeat(64), harbor.candidate.scenarioHash)).toBe(false);
    expect(isComparisonCurrent(harbor, harbor.baseline.scenarioHash, 'f'.repeat(64))).toBe(false);
  });
});
