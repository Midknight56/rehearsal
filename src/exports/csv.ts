import type { Scenario } from '../domain/scenario';
import type { Comparison } from '../comparison/comparison';
import type { ComparisonSummary } from '../comparison/summary';

export const CSV_OPTIONS = { escapeFormulae: true, newline: '\r\n' } as const;

export function exportArrivalsCsv(scenario: Scenario): string {
  void scenario;
  throw new Error('not implemented: exportArrivalsCsv');
}
export function exportStationsCsv(scenario: Scenario): string {
  void scenario;
  throw new Error('not implemented: exportStationsCsv');
}
export function exportResultsCsv(comparison: Comparison): string {
  void comparison;
  throw new Error('not implemented: exportResultsCsv');
}
export function exportComparisonCsv(comparison: Comparison | ComparisonSummary): string {
  void comparison;
  throw new Error('not implemented: exportComparisonCsv');
}
