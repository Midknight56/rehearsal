import Papa from 'papaparse';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Comparison } from '../../src/comparison/comparison';
import { RANGE_LABEL } from '../../src/comparison/labels';
import { runPairedComparison } from '../../src/comparison/runner';
import { toComparisonSummary } from '../../src/comparison/summary';
import {
  CSV_OPTIONS, exportArrivalsCsv, exportComparisonCsv, exportResultsCsv, exportStationsCsv,
} from '../../src/exports/csv';
import { baseline, harborPlusOne, rowOnePair } from './fixtures/pairs';
import { hostile } from './fixtures/hostile';
import { createInProcessClient } from './helpers/in-process-client';

async function compare(pair: { baseline: typeof baseline; candidate: typeof baseline }): Promise<Comparison> {
  const outcome = await runPairedComparison(createInProcessClient(), pair.baseline, pair.candidate).done;
  if (outcome.status !== 'complete') throw new Error(`comparison failed: ${JSON.stringify(outcome)}`);
  return outcome.comparison;
}
const parse = (csv: string): string[][] => Papa.parse<string[]>(csv, { skipEmptyLines: true }).data;
const parseNumbers = (csv: string): Record<string, unknown>[] =>
  Papa.parse<Record<string, unknown>>(csv, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;

describe('CSV options', () => {
  it('escapes formulae and ends lines with CRLF', () => {
    expect(CSV_OPTIONS).toEqual({ escapeFormulae: true, newline: '\r\n' });
  });
});

describe('arrivals and stations CSV (requirement 7.1)', () => {
  it('writes the Harbor Hall baseline in the template columns', () => {
    expect(parse(exportArrivalsCsv(baseline))).toEqual([
      ['cohort_id', 'start_min', 'end_min', 'count', 'arrival_pattern', 'route'],
      ['doors', '0', '20', '120', 'uniform', 'checkin|packs'],
    ]);
    expect(parse(exportStationsCsv(baseline))).toEqual([
      ['station_id', 'label', 'servers', 'service_min_s', 'service_mode_s', 'service_max_s', 'cell_x', 'cell_y'],
      ['checkin', 'Check-in desk', '1', '8', '15', '22', '10', '12'],
      ['packs', 'Welcome packs', '2', '6', '10', '14', '34', '12'],
    ]);
  });

  it('uses CRLF line ends and one row per cohort and station in scenario order', () => {
    expect(exportArrivalsCsv(baseline).split('\r\n')[0]).toBe('cohort_id,start_min,end_min,count,arrival_pattern,route');
    expect(exportArrivalsCsv(baseline)).not.toMatch(/[^\r]\n/);
  });

  it('writes a constant service as three equal values', () => {
    const rows = parse(exportStationsCsv(hostile));
    expect(rows[1]!.slice(2)).toEqual(['1', '5', '5', '5', '2', '2']);
  });

  it('writes fractional minutes without rounding', () => {
    const scenario = { ...baseline, cohorts: [{ ...baseline.cohorts[0]!, startMs: 90_000, endMs: 1_230_000 }] };
    expect(parse(exportArrivalsCsv(scenario))[1]!.slice(1, 3)).toEqual(['1.5', '20.5']);
  });
});

describe('escaping (requirement 7.4, matrix row 27)', () => {
  it('leaves no cell that starts with =, +, - or @', () => {
    const cells = [...parse(exportArrivalsCsv(hostile)), ...parse(exportStationsCsv(hostile))].flat();
    expect(cells.some((cell) => /^[=+\-@]/.test(cell))).toBe(false);
    expect(cells.some((cell) => cell.includes('SUM(A1:A3)'))).toBe(true);
    expect(cells.some((cell) => cell.includes('late'))).toBe(true);
  });

  it('escapes a label that starts with a formula character', () => {
    for (const label of [hostile.title, hostile.notes, '=SUM(A1:A3)', '+late']) {
      const scenario = { ...hostile, stations: hostile.stations.map((s) => ({ ...s, label })) };
      const cells = parse(exportStationsCsv(scenario)).flat();
      expect(cells.some((cell) => /^[=+\-@]/.test(cell))).toBe(false);
    }
  });
});

describe('results and comparison CSV', () => {
  let harbor: Comparison;
  let rowOne: Comparison;
  beforeAll(async () => {
    harbor = await compare(harborPlusOne);
    rowOne = await compare(rowOnePair);
  });

  it('results CSV: 2 x 30 x 19 = 1,140 rows with the scenario hash on every row', () => {
    const rows = parseNumbers(exportResultsCsv(harbor));
    expect(Object.keys(rows[0]!)).toEqual([
      'scenario', 'scenario_hash', 'model_version', 'base_seed', 'replication', 'completion', 'metric', 'unit', 'population', 'n', 'value',
    ]);
    expect(rows).toHaveLength(1140);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(String(r.scenario_hash)))).toBe(true);
    expect(new Set(rows.map((r) => r.scenario))).toEqual(new Set(['baseline', 'candidate']));
    expect(new Set(rows.map((r) => r.replication)).size).toBe(30);
    expect(rows.filter((r) => r.scenario === 'baseline' && r.scenario_hash === harbor.baseline.scenarioHash)).toHaveLength(570);
    expect(rows.every((r) => r.model_version === '0.1.0' && r.base_seed === 'harbor-hall-2026')).toBe(true);
    expect(rows.some((r) => r.metric === 'stations.packs.utilization')).toBe(true);
  });

  it('results CSV: empty value for a null metric, never NaN or undefined', () => {
    const text = exportResultsCsv(harbor);
    expect(text).not.toMatch(/NaN|undefined|Infinity/);
    const clone = structuredClone(harbor);
    clone.baselineResults[0]!.metrics.queueWait.mean.value = null;
    const row = parse(exportResultsCsv(clone)).find((r) => r[0] === 'baseline' && r[4] === '0' && r[6] === 'queueWait.mean');
    expect(row?.[10]).toBe('');
  });

  it('comparison CSV: the range label on every row, empty counts for no direction, -30000 as a number', () => {
    const rows = parseNumbers(exportComparisonCsv(harbor));
    expect(Object.keys(rows[0]!)).toEqual([
      'metric', 'unit', 'population', 'baseline_mean', 'candidate_mean', 'mean_paired_change', 'p10', 'p90', 'range_label', 'n',
      'runs_improved', 'runs_worsened', 'runs_unchanged', 'better_direction', 'conditioned', 'note',
    ]);
    expect(rows).toHaveLength(11 + 4 * 2);
    expect(rows.every((r) => r.range_label === RANGE_LABEL)).toBe(true);
    const staff = rows.find((r) => r.metric === 'staffHours')!;
    expect(staff.better_direction).toBe('none');
    expect([staff.runs_improved, staff.runs_worsened, staff.runs_unchanged]).toEqual([null, null, null]);
    const wait = rows.find((r) => r.metric === 'queueWait.mean')!;
    expect(typeof wait.runs_improved).toBe('number');

    const one = parseNumbers(exportComparisonCsv(rowOne)).find((r) => r.metric === 'queueWait.mean')!;
    expect(one.mean_paired_change).toBe(-30000);
    expect(exportComparisonCsv(rowOne)).toContain(',-30000,');
  });

  it('comparison CSV: a saved summary gives the same rows as the comparison', () => {
    expect(exportComparisonCsv(toComparisonSummary(harbor))).toBe(exportComparisonCsv(harbor));
  });
});
