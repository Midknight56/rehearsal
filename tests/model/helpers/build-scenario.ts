import type { Scenario } from '../../../src/domain/scenario';
import { MODEL_VERSION } from '../../../src/simulation/version';

/** Defaults of the design's Testing Strategy: a one-cell layout, so walking takes 0 ms. */
export function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    schemaVersion: 1,
    id: 'test',
    revision: 0,
    title: 'test',
    modelVersion: MODEL_VERSION,
    baseSeed: 'test-seed',
    horizonMs: 180_000,
    layout: { cols: 1, rows: 1, cellSizeM: 0.5, blockedCells: [], entrance: [0, 0], exit: [0, 0] },
    walkSpeedMps: 1,
    stations: [],
    cohorts: [],
    notes: '',
    ...overrides,
  };
}