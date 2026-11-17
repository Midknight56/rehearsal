import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import type { Scenario } from '../../src/domain/scenario';
import { exportScenarioJson } from '../../src/exports/scenario-json';
import { openScenarioJson } from '../../src/imports/scenarioJson';
import { simulate } from '../../src/simulation/simulate';

const baseline = (): Scenario => JSON.parse(readFileSync('public/examples/harbor-hall/baseline.json', 'utf8')) as Scenario;
const fileOf = (text: string): { size: number; text(): Promise<string> } => ({ size: new TextEncoder().encode(text).length, text: async () => text });

const NOT_AN_EXPORT = 'This file is not a Rehearsal scenario export (expected "format": "rehearsal-scenario") or a bare scenario (expected "schemaVersion": 1).';

describe('10.7 openScenarioJson over parseScenarioExport', () => {
  it('opens an envelope with its hash, and keeps untraced results whose hash and model version agree', async () => {
    const scenario = baseline();
    const hash = await scenarioHash(scenario);
    const results = [simulate(scenario, 0, { trace: false, scenarioHash: hash })];
    const opened = await openScenarioJson(fileOf(exportScenarioJson({ scenario, scenarioHash: hash, results, generatedAt: '2026-11-17T10:00:00.000Z' })));
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.scenario).toEqual(scenario);
    expect(opened.hash).toBe(hash);
    expect(opened.results).toHaveLength(1);
    expect(opened.warnings).toEqual([]);
  });

  it('opens an envelope without results', async () => {
    const scenario = baseline();
    const hash = await scenarioHash(scenario);
    const opened = await openScenarioJson(fileOf(exportScenarioJson({ scenario, scenarioHash: hash, results: [], generatedAt: '2026-11-17T10:00:00.000Z' })));
    expect(opened.ok && opened.results).toEqual([]);
    expect(opened.ok && opened.hash).toBe(hash);
  });

  it('opens the bare baseline.json the example files use', async () => {
    const text = readFileSync('public/examples/harbor-hall/baseline.json', 'utf8');
    const opened = await openScenarioJson(fileOf(text));
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.scenario.id).toBe('harbor-hall-baseline');
    expect(opened.results).toEqual([]);
    expect(opened.hash).toBe(await scenarioHash(opened.scenario));
  });

  it('refuses {} with NOT_A_SCENARIO_EXPORT and its message', async () => {
    const opened = await openScenarioJson(fileOf('{}'));
    expect(opened).toEqual({ ok: false, code: 'NOT_A_SCENARIO_EXPORT', message: NOT_AN_EXPORT });
  });

  it('refuses text that is not JSON', async () => {
    const opened = await openScenarioJson(fileOf('not json'));
    expect(opened.ok).toBe(false);
    expect(!opened.ok && opened.code).toBe('NOT_JSON');
  });

  it('refuses a file above 2 MiB from its size, without reading it', async () => {
    const text = vi.fn(async () => '{}');
    const opened = await openScenarioJson({ size: 2_097_153, text });
    expect(opened).toEqual({ ok: false, code: 'FILE_TOO_LARGE', message: 'This file is 2.0 MiB; the limit is 2 MiB.' });
    expect(text).not.toHaveBeenCalled();
  });

  it('opens a modelVersion 0.2.0 file with the MODEL_VERSION_MISMATCH warning text verbatim', async () => {
    const opened = await openScenarioJson(fileOf(JSON.stringify({ ...baseline(), modelVersion: '0.2.0' })));
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.warnings).toContainEqual({
      code: 'MODEL_VERSION_MISMATCH',
      message: 'This scenario was saved with model version 0.2.0; the engine is 0.1.0. Results may differ from the saved export.',
    });
    expect(opened.scenario.modelVersion).toBe('0.2.0');
  });

  it('reports a scenario that fails validation with its first issue', async () => {
    const opened = await openScenarioJson(fileOf(JSON.stringify({ ...baseline(), horizonMs: -5 })));
    expect(opened.ok).toBe(false);
    expect(!opened.ok && opened.code).toBe('SCENARIO_INVALID');
  });

  it('a file read that throws is a refusal, not a crash', async () => {
    const opened = await openScenarioJson({ size: 10, text: async () => { throw new Error('denied'); } });
    expect(opened.ok).toBe(false);
    expect(!opened.ok && opened.message).toBe('This file could not be read.');
  });
});
