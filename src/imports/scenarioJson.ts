// Open a scenario JSON file (requirement 10.7). The file is read in this browser only, after the 2 MiB limit is checked on its
// reported size; parseScenarioExport (src/exports/scenario-json.ts) does the parsing, validation and hash and results checks.
// Only the scenario enters the editor: saved results carry no trace, so the UI discards them and a rerun makes new ones.
import { scenarioHash } from '../domain/hash';
import { EXPORT_MAX_BYTES, parseScenarioExport, type ParseExportResult } from '../exports/scenario-json';

export type OpenJsonFile = { size: number; text(): Promise<string> };
export type OpenJsonResult =
  | (Extract<ParseExportResult, { ok: true }> & { hash: string })
  | Extract<ParseExportResult, { ok: false }>
  | { ok: false; code: 'READ_FAILED'; message: string };

export async function openScenarioJson(file: OpenJsonFile): Promise<OpenJsonResult> {
  if (file.size > EXPORT_MAX_BYTES) {
    return { ok: false, code: 'FILE_TOO_LARGE', message: `This file is ${(file.size / 1_048_576).toFixed(1)} MiB; the limit is 2 MiB.` };
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, code: 'READ_FAILED', message: 'This file could not be read.' };
  }
  const parsed = await parseScenarioExport(text);
  if (!parsed.ok) return parsed;
  return { ...parsed, hash: await scenarioHash(parsed.scenario) };
}
