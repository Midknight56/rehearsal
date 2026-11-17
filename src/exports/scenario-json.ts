import { z } from 'zod';
import { scenarioHash } from '../domain/hash';
import type { Scenario } from '../domain/scenario';
import { validateScenario, type ValidationIssue } from '../domain/validate';
import type { Metrics } from '../simulation/metrics';
import type { RunResult } from '../simulation/simulate';
import { MODEL_VERSION } from '../simulation/version';
import { ASSUMPTIONS, LIMITS_TEXT } from './assumptions-text';

export const EXPORT_FORMAT = 'rehearsal-scenario';
export const EXPORT_FORMAT_VERSION = 1;
export const EXPORT_MAX_BYTES = 2_097_152;

export type ExportedResult = { replication: number; completion: 'complete' | 'drain-capped'; unfinished: string[]; metrics: Metrics };
export type ScenarioExport = {
  format: 'rehearsal-scenario'; formatVersion: 1; generatedAt: string;
  modelVersion: string; baseSeed: string; scenarioHash: string;
  scenario: Scenario; results: ExportedResult[]; assumptions: readonly string[]; limits: string;
};
export type ExportWarning = {
  code: 'HASH_MISMATCH' | 'RESULTS_MODEL_VERSION' | 'RESULTS_INVALID' | 'MODEL_VERSION_MISMATCH';
  message: string;
};
export type ParseExportResult =
  | { ok: true; scenario: Scenario; results: ExportedResult[]; warnings: ExportWarning[] }
  | {
    ok: false;
    code: 'FILE_TOO_LARGE' | 'NOT_JSON' | 'NOT_A_SCENARIO_EXPORT' | 'UNSUPPORTED_FORMAT_VERSION' | 'SCENARIO_INVALID';
    message: string;
    issues?: ValidationIssue[];
  };

/** The scenario, its hash and, when given, its untraced results: two-space JSON, LF, one trailing newline. */
export function exportScenarioJson(input: { scenario: Scenario; scenarioHash: string; results?: RunResult[]; generatedAt: string }): string {
  const results: ExportedResult[] = [...(input.results ?? [])]
    .sort((a, b) => a.replication - b.replication)
    .map((r) => ({ replication: r.replication, completion: r.completion, unfinished: r.unfinished, metrics: r.metrics }));
  const envelope: ScenarioExport = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    generatedAt: input.generatedAt,
    modelVersion: input.scenario.modelVersion,
    baseSeed: input.scenario.baseSeed,
    scenarioHash: input.scenarioHash,
    scenario: input.scenario,
    results,
    assumptions: ASSUMPTIONS,
    limits: LIMITS_TEXT,
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

const METRIC_KEYS = [
  'horizonMs', 'admitted', 'completedByClosing', 'activeAtClosing', 'queueWait', 'journeyTime', 'walkingTime', 'queues', 'stations', 'staffHours',
] as const;
const ExportedResultSchema = z.object({
  replication: z.number().int().min(0),
  completion: z.enum(['complete', 'drain-capped']),
  unfinished: z.array(z.string()),
  metrics: z.custom<Metrics>((value) => typeof value === 'object' && value !== null && METRIC_KEYS.every((key) => key in value)),
});

const NOT_AN_EXPORT = 'This file is not a Rehearsal scenario export (expected "format": "rehearsal-scenario") or a bare scenario (expected "schemaVersion": 1).';
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function readResults(raw: unknown): ExportedResult[] | null {
  if (raw === undefined) return [];
  const parsed = z.array(ExportedResultSchema).safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Reads an envelope or a bare scenario. Results are kept only when the hash, model version and shape all check out. */
export async function parseScenarioExport(text: string): Promise<ParseExportResult> {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > EXPORT_MAX_BYTES) {
    return { ok: false, code: 'FILE_TOO_LARGE', message: `This file is ${(bytes / 1_048_576).toFixed(1)} MiB; the limit is 2 MiB.` };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: 'NOT_JSON', message: 'This file is not valid JSON.' };
  }
  if (!isRecord(json)) return { ok: false, code: 'NOT_A_SCENARIO_EXPORT', message: NOT_AN_EXPORT };

  let candidate: unknown;
  let envelope: Record<string, unknown> | null = null;
  if ('format' in json) {
    if (json.format !== EXPORT_FORMAT || !isRecord(json.scenario)) return { ok: false, code: 'NOT_A_SCENARIO_EXPORT', message: NOT_AN_EXPORT };
    if (json.formatVersion !== EXPORT_FORMAT_VERSION) {
      return { ok: false, code: 'UNSUPPORTED_FORMAT_VERSION', message: `This export uses format version ${String(json.formatVersion)}; this build reads version 1.` };
    }
    envelope = json;
    candidate = json.scenario;
  } else if (json.schemaVersion === 1) {
    candidate = json;
  } else {
    return { ok: false, code: 'NOT_A_SCENARIO_EXPORT', message: NOT_AN_EXPORT };
  }

  const validated = validateScenario(candidate);
  if (!validated.ok) {
    const first = validated.issues[0]?.message ?? 'Scenario is invalid.';
    const more = validated.issues.length > 1 ? ` (+${validated.issues.length - 1} more)` : '';
    return { ok: false, code: 'SCENARIO_INVALID', message: `${first}${more}`, issues: validated.issues };
  }

  const warnings: ExportWarning[] = [];
  let results: ExportedResult[] = [];
  if (envelope !== null) {
    const raw = envelope.results;
    const present = Array.isArray(raw) ? raw.length > 0 : raw !== undefined;
    const hashOk = typeof envelope.scenarioHash === 'string' && envelope.scenarioHash === (await scenarioHash(validated.scenario));
    const versionOk = envelope.modelVersion === MODEL_VERSION;
    if (!hashOk) {
      warnings.push({
        code: 'HASH_MISMATCH',
        message: 'The recorded scenario hash does not match the scenario in this file, so its saved results were discarded; the scenario itself was imported.',
      });
    }
    if (!versionOk && present) {
      warnings.push({
        code: 'RESULTS_MODEL_VERSION',
        message: `Saved results came from model version ${String(envelope.modelVersion)}; this build is ${MODEL_VERSION}, so they were discarded. Rerun to see results.`,
      });
    }
    if (hashOk && versionOk) {
      const read = readResults(raw);
      if (read === null) warnings.push({ code: 'RESULTS_INVALID', message: 'Saved results in this file could not be read and were discarded.' });
      else results = read;
    }
  }
  warnings.push(...validated.warnings);
  return { ok: true, scenario: validated.scenario, results, warnings };
}
