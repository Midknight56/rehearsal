export type Cell = [number, number]; // [x, y]; x grows east, y grows south
export type Service =
  | { kind: 'constant'; seconds: number }
  | { kind: 'triangular'; minS: number; modeS: number; maxS: number };
export type Station = { id: string; label: string; cell: Cell; servers: number; service: Service };
export type Cohort = { id: string; startMs: number; endMs: number; count: number; arrivals: 'even' | 'uniform'; route: string[] };
export type Layout = { cols: number; rows: number; cellSizeM: number; blockedCells: Cell[]; entrance: Cell; exit: Cell };
export type Scenario = {
  schemaVersion: 1; id: string; revision: number; title: string;
  modelVersion: string; baseSeed: string; horizonMs: number;
  layout: Layout; walkSpeedMps: number; stations: Station[]; cohorts: Cohort[]; notes: string;
};
