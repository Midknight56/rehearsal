import Papa from 'papaparse';
import type { Comparison } from '../comparison/comparison';
import { METRIC_KEYS, STATION_METRIC_KEYS, readMetric } from '../comparison/metric-keys';
import { RANGE_LABEL } from '../comparison/labels';
import type { PairedMetric } from '../comparison/paired';
import type { ComparisonSummary, SummaryMetric } from '../comparison/summary';
import type { Scenario } from '../domain/scenario';
import type { RunResult } from '../simulation/simulate';

/** `escapeFormulae` puts a `'` in front of any text cell that starts with `=`, `+`, `-` or `@`; numbers are left alone. */
export const CSV_OPTIONS = { escapeFormulae: true, newline: '\r\n' } as const;

type Row = (string | number | null)[];

/** Rows go in as `{ fields, data }` so that numbers stay numbers and `null` is written as an empty cell. */
function toCsv(fields: string[], data: Row[]): string {
  return Papa.unparse({ fields, data }, CSV_OPTIONS);
}

const minutes = (ms: number): number => ms / 60_000;

export function exportArrivalsCsv(scenario: Scenario): string {
  return toCsv(
    ['cohort_id', 'start_min', 'end_min', 'count', 'arrival_pattern', 'route'],
    scenario.cohorts.map((c) => [c.id, minutes(c.startMs), minutes(c.endMs), c.count, c.arrivals, c.route.join('|')]),
  );
}

export function exportStationsCsv(scenario: Scenario): string {
  return toCsv(
    ['station_id', 'label', 'servers', 'service_min_s', 'service_mode_s', 'service_max_s', 'cell_x', 'cell_y'],
    scenario.stations.map((s) => {
      const [min, mode, max] = s.service.kind === 'constant'
        ? [s.service.seconds, s.service.seconds, s.service.seconds]
        : [s.service.minS, s.service.modeS, s.service.maxS];
      return [s.id, s.label, s.servers, min, mode, max, s.cell[0], s.cell[1]];
    }),
  );
}

function resultRows(side: 'baseline' | 'candidate', scenarioHash: string, results: RunResult[]): Row[] {
  const rows: Row[] = [];
  for (const result of results) {
    const head = [side, scenarioHash, result.modelVersion, result.baseSeed, result.replication, result.completion];
    const push = (key: string, m: { unit: string; population: string; n: number; value: number | null }): void => {
      rows.push([...head, key, m.unit, m.population, m.n, m.value]);
    };
    for (const { key } of METRIC_KEYS) push(key, readMetric(result.metrics, key));
    for (const station of result.metrics.stations) {
      for (const { key } of STATION_METRIC_KEYS) push(`stations.${station.id}.${key}`, station[key]);
    }
  }
  return rows;
}

/** Long format: one row per scenario, replication and metric key. `value` is empty when the metric is undefined. */
export function exportResultsCsv(comparison: Comparison): string {
  return toCsv(
    ['scenario', 'scenario_hash', 'model_version', 'base_seed', 'replication', 'completion', 'metric', 'unit', 'population', 'n', 'value'],
    [
      ...resultRows('baseline', comparison.baseline.scenarioHash, comparison.baselineResults),
      ...resultRows('candidate', comparison.candidate.scenarioHash, comparison.candidateResults),
    ],
  );
}

function comparisonRow(m: PairedMetric | SummaryMetric): Row {
  const counted = m.betterDirection !== 'none';
  return [
    m.key, m.unit, m.population, m.baselineMean, m.candidateMean, m.meanChange, m.rangeP10, m.rangeP90, RANGE_LABEL, m.n,
    counted ? m.improved : null, counted ? m.worsened : null, counted ? m.unchanged : null,
    m.betterDirection, m.conditioned ? 'true' : 'false', m.note ?? '',
  ];
}

/** One row per paired metric: the eleven global rows first, then each station's four in station order. Raw units as `unit` names them. */
export function exportComparisonCsv(comparison: Comparison | ComparisonSummary): string {
  const metrics: (PairedMetric | SummaryMetric)[] = [...comparison.metrics, ...comparison.stations.flatMap((s) => s.metrics)];
  return toCsv(
    [
      'metric', 'unit', 'population', 'baseline_mean', 'candidate_mean', 'mean_paired_change', 'p10', 'p90', 'range_label', 'n',
      'runs_improved', 'runs_worsened', 'runs_unchanged', 'better_direction', 'conditioned', 'note',
    ],
    metrics.map(comparisonRow),
  );
}
