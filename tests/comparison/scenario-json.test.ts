import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalJson, scenarioHash } from '../../src/domain/hash';
import type { Scenario } from '../../src/domain/scenario';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, EXPORT_MAX_BYTES, exportScenarioJson, parseScenarioExport } from '../../src/exports/scenario-json';
import type { RunResult } from '../../src/simulation/simulate';
import { simulate } from '../../src/simulation/simulate';
import { baseline } from '../model/fixtures/harbor-hall';
import { hostile } from './fixtures/hostile';
import { badgeWords, generatedAt } from './helpers/render';
import { resultsFor } from './helpers/results';

let hash: string;
let results: RunResult[];
let text: string;
beforeAll(async () => {
  hash = await scenarioHash(baseline);
  results = await resultsFor(baseline);
  text = exportScenarioJson({ scenario: baseline, scenarioHash: hash, results: [...results].reverse(), generatedAt });
});

describe('exportScenarioJson', () => {
  it('writes two-space JSON with LF and one trailing newline, results sorted without traces', () => {
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).not.toContain('\r');
    expect(text.startsWith('{\n  "format": "rehearsal-scenario",\n')).toBe(true);
    const parsed = JSON.parse(text);
    expect(parsed).toMatchObject({
      format: EXPORT_FORMAT, formatVersion: EXPORT_FORMAT_VERSION, generatedAt, modelVersion: '0.1.0', baseSeed: 'harbor-hall-2026', scenarioHash: hash,
    });
    expect(parsed.results.map((r: { replication: number }) => r.replication)).toEqual([...Array(30).keys()]);
    expect(text).not.toContain('"trace"');
    expect(Object.keys(parsed.results[0])).toEqual(['replication', 'completion', 'unfinished', 'metrics']);
    expect(parsed.assumptions).toHaveLength(8);
    expect(text).not.toMatch(badgeWords);
  });

  it('exports a scenario without results', () => {
    expect(JSON.parse(exportScenarioJson({ scenario: baseline, scenarioHash: hash, generatedAt })).results).toEqual([]);
  });
});

describe('parseScenarioExport (matrix row 27, re-import)', () => {
  it('re-imports 30 results with the same hash and byte-identical metrics', async () => {
    const parsed = await parseScenarioExport(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.warnings).toEqual([]);
    expect(canonicalJson(parsed.scenario)).toBe(canonicalJson(baseline));
    expect(await scenarioHash(parsed.scenario)).toBe(hash);
    expect(parsed.results).toHaveLength(30);
    for (const r of [0, 29]) {
      const again = simulate(parsed.scenario, r, { trace: false, scenarioHash: hash });
      expect(JSON.stringify(again.metrics)).toBe(JSON.stringify(parsed.results[r]!.metrics));
    }
    expect(parsed.results.map((r) => r.replication)).toEqual([...Array(30).keys()]);
    expect(parsed.results).toEqual(results.map((r) => JSON.parse(JSON.stringify({ replication: r.replication, completion: r.completion, unfinished: r.unfinished, metrics: r.metrics }))));
  });

  it('reads the bare example file with no results', async () => {
    const parsed = await parseScenarioExport(readFileSync('public/examples/harbor-hall/baseline.json', 'utf8'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.results).toEqual([]);
    expect(parsed.warnings).toEqual([]);
    expect(await scenarioHash(parsed.scenario)).toBe(hash);
  });

  it('refuses a file over 2,097,152 bytes before parsing it', async () => {
    expect(EXPORT_MAX_BYTES).toBe(2_097_152);
    const big = 'x'.repeat(2_097_153);
    expect(await parseScenarioExport(big)).toEqual({ ok: false, code: 'FILE_TOO_LARGE', message: 'This file is 2.0 MiB; the limit is 2 MiB.' });
    const exact = ' '.repeat(2_097_152 - 2) + '{}';
    expect(await parseScenarioExport(exact)).toMatchObject({ ok: false, code: 'NOT_A_SCENARIO_EXPORT' });
  });

  it('names text that is not JSON', async () => {
    expect(await parseScenarioExport('{ nope')).toEqual({ ok: false, code: 'NOT_JSON', message: 'This file is not valid JSON.' });
  });

  it('refuses shapes that are neither an export nor a scenario', async () => {
    const message = 'This file is not a Rehearsal scenario export (expected "format": "rehearsal-scenario") or a bare scenario (expected "schemaVersion": 1).';
    for (const input of ['{}', '[]', 'null', '"x"', '{"format":"other","scenario":{}}', '{"format":"rehearsal-scenario"}']) {
      expect(await parseScenarioExport(input)).toEqual({ ok: false, code: 'NOT_A_SCENARIO_EXPORT', message });
    }
  });

  it('refuses another format version', async () => {
    const parsed = await parseScenarioExport(JSON.stringify({ ...JSON.parse(text), formatVersion: 2 }));
    expect(parsed).toEqual({ ok: false, code: 'UNSUPPORTED_FORMAT_VERSION', message: 'This export uses format version 2; this build reads version 1.' });
  });

  it('lists validation issues for an invalid scenario', async () => {
    const bad = { ...JSON.parse(text), scenario: { ...baseline, stations: baseline.stations.map((s) => ({ ...s, servers: 0 })) } };
    const parsed = await parseScenarioExport(JSON.stringify(bad));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe('SCENARIO_INVALID');
    expect(parsed.issues?.length).toBe(2);
    expect(parsed.message).toContain('(+1 more)');
  });

  it('keeps the scenario but drops the results when the hash no longer matches', async () => {
    const edited = JSON.parse(text);
    edited.scenario.stations[0].servers = 2;
    const parsed = await parseScenarioExport(JSON.stringify(edited));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.results).toEqual([]);
    expect(parsed.warnings.map((w) => w.code)).toEqual(['HASH_MISMATCH']);
    expect(parsed.warnings[0]!.message).toBe(
      'The recorded scenario hash does not match the scenario in this file, so its saved results were discarded; the scenario itself was imported.',
    );
    expect(parsed.scenario.stations[0]!.servers).toBe(2);
  });

  it('drops results from another model version and passes on the engine warning', async () => {
    const other: Scenario = { ...baseline, modelVersion: '0.2.0' };
    const otherHash = await scenarioHash(other);
    const file = exportScenarioJson({ scenario: other, scenarioHash: otherHash, results: results.slice(0, 2), generatedAt });
    const parsed = await parseScenarioExport(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.results).toEqual([]);
    expect(parsed.warnings.map((w) => w.code)).toEqual(['RESULTS_MODEL_VERSION', 'MODEL_VERSION_MISMATCH']);
    expect(parsed.warnings[0]!.message).toBe(
      'Saved results came from model version 0.2.0; this build is 0.1.0, so they were discarded. Rerun to see results.',
    );
  });

  it('drops results that fail the envelope check', async () => {
    const broken = JSON.parse(text);
    broken.results[3].completion = 'finished';
    const parsed = await parseScenarioExport(JSON.stringify(broken));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.results).toEqual([]);
    expect(parsed.warnings).toEqual([{ code: 'RESULTS_INVALID', message: 'Saved results in this file could not be read and were discarded.' }]);
    const notArray = JSON.parse(text);
    notArray.results = 'many';
    const second = await parseScenarioExport(JSON.stringify(notArray));
    if (second.ok) expect(second.warnings.map((w) => w.code)).toEqual(['RESULTS_INVALID']);
  });

  it('ignores unknown top-level keys', async () => {
    const parsed = await parseScenarioExport(JSON.stringify({ ...JSON.parse(text), futureField: { a: 1 } }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.warnings).toEqual([]);
  });

  it('keeps hostile strings as plain data through a round trip', async () => {
    const file = exportScenarioJson({ scenario: hostile, scenarioHash: await scenarioHash(hostile), generatedAt });
    const parsed = await parseScenarioExport(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.scenario.stations.map((s) => s.label)).toEqual(['=SUM(A1:A3)', '<script>alert(1)</script>']);
    expect(parsed.scenario.cohorts[0]!.id).toBe('+late');
    expect(parsed.scenario.title).toBe('-Harbor');
    expect(JSON.parse(readFileSync('tests/comparison/fixtures/hostile.json', 'utf8'))).toEqual(hostile);
  });
});
