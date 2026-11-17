// Export JSON of the current tab (requirement 10.7, comparison spec 9.2): the scenario and its hash, no results, as a download
// named <title-slug>-<hash8>.json. Nothing is uploaded.
import { scenarioHash } from '../domain/hash';
import { exportScenarioJson } from '../exports/scenario-json';
import { downloadText, exportFileName } from './download';
import type { EditorStore } from './state/store';

export async function exportCurrentScenarioJson(store: EditorStore): Promise<void> {
  const scenario = store.getState().scenario;
  const hash = store.getState().hash ?? (await scenarioHash(scenario));
  downloadText(
    exportFileName(scenario.title, hash, 'json'),
    exportScenarioJson({ scenario, scenarioHash: hash, results: [], generatedAt: new Date().toISOString() }),
    'application/json',
  );
  store.setStatus(`Exported "${scenario.title}" as JSON.`);
}