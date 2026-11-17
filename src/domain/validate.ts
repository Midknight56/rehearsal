import type { Scenario } from './scenario';
function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}
function notImplementedValue<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get: () => notImplemented(name),
    has: () => notImplemented(name),
    ownKeys: () => notImplemented(name),
  });
}
export type IssueCode =
  | 'SCHEMA_VERSION' | 'MODEL_VERSION_FORMAT' | 'SEED_FORMAT' | 'ID_FORMAT' | 'DUPLICATE_ID'
  | 'HORIZON_RANGE' | 'GRID_SIZE' | 'CELL_SIZE' | 'WALK_SPEED' | 'CELL_OUT_OF_BOUNDS' | 'CELL_BLOCKED'
  | 'DUPLICATE_BLOCKED_CELL' | 'SERVERS_RANGE' | 'SERVICE_RANGE' | 'COHORT_WINDOW' | 'COUNT_RANGE'
  | 'ARRIVAL_PATTERN' | 'ROUTE_LENGTH' | 'ROUTE_UNKNOWN_STATION' | 'ROUTE_REPEAT'
  | 'ATTENDEE_LIMIT' | 'STATION_LIMIT' | 'NON_FINITE' | 'UNSAFE_MS' | 'UNREACHABLE';
export type ValidationIssue = { code: IssueCode; path: string; message: string; entity?: { kind: 'station' | 'cohort'; id: string } };
export type ValidationWarning = { code: 'MODEL_VERSION_MISMATCH'; message: string };
export type ValidationResult =
  | { ok: true; scenario: Scenario; warnings: ValidationWarning[] }
  | { ok: false; issues: ValidationIssue[] };

export function validateScenario(input: unknown): ValidationResult {
  return notImplemented('validateScenario');
}

export function toDurationMs(seconds: number): number {
  return notImplemented('toDurationMs');
}

export const MESSAGES: Record<IssueCode, (args: Record<string, string | number>) => string> =
  notImplementedValue<Record<IssueCode, (args: Record<string, string | number>) => string>>('MESSAGES');