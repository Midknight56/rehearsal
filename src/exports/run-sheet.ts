import type { Cell, Scenario, Service } from '../domain/scenario';

export type RunSheetSegment = {
  from: string; to: string; fromLabel: string; toLabel: string; cells: number; distanceM: number; durationMs: number;
};
export type RunSheetModel = {
  title: string; generatedAt: string; scenarioHash: string; modelVersion: string; horizonMs: number;
  cohorts: { id: string; startMs: number; endMs: number; count: number; arrivals: 'even' | 'uniform'; route: string[] }[];
  stations: { id: string; label: string; servers: number; service: Service; cell: Cell; metersFromEntrance: number }[];
  segments: RunSheetSegment[];
  walkingPerRoute: { cohortId: string; distanceM: number; durationMs: number }[];
  staffHours: number;
  assumptions: readonly string[]; limits: string;
};

export function buildRunSheetModel(scenario: Scenario, scenarioHash: string): RunSheetModel {
  void scenario;
  void scenarioHash;
  throw new Error('not implemented: buildRunSheetModel');
}

export function renderRunSheet(
  scenario: Scenario,
  options: { generatedAt: string; scenarioHash: string },
): { html: string; model: RunSheetModel } {
  void scenario;
  void options;
  throw new Error('not implemented: renderRunSheet');
}
