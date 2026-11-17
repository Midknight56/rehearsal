// The file exports and the generated documents of the Compare screen and the save-failure block (requirements 12.2 and 10.5).
// Every file text comes from src/exports; this module only picks the data, names the file and hands it to the browser.
// Nothing is uploaded: downloads and new tabs use Blob URLs.
import { scenarioHash } from '../domain/hash';
import { createPathCache } from '../spatial/path-cache';
import { downloadText, openHtmlInNewTab } from './download';
import { blockedMessage } from './run/controller';
import type { EditorStore } from './state/store';

const nowIso = (): string => new Date().toISOString();

/** `comparison-results-<baseline hash8>-<candidate hash8>.csv`: the 1,140-row long file of every replication and metric. */
export async function downloadResultsCsv(store: EditorStore): Promise<void> {
  const comparison = store.getState().compare.comparison;
  if (comparison === null) return;
  const { exportResultsCsv } = await import('../exports/csv');
  const name = `comparison-results-${comparison.baseline.scenarioHash.slice(0, 8)}-${comparison.candidate.scenarioHash.slice(0, 8)}.csv`;
  downloadText(name, exportResultsCsv(comparison), 'text/csv');
  store.setStatus(`Exported ${name}.`);
}

/** `comparison-summary-<baseline hash8>-<candidate hash8>.csv`: one row per paired metric, from a comparison or a restored summary. */
export async function downloadComparisonCsv(store: EditorStore): Promise<void> {
  const { comparison, restored } = store.getState().compare;
  const source = comparison ?? restored;
  if (source === null) return;
  const { exportComparisonCsv } = await import('../exports/csv');
  const name = `comparison-summary-${source.baseline.scenarioHash.slice(0, 8)}-${source.candidate.scenarioHash.slice(0, 8)}.csv`;
  downloadText(name, exportComparisonCsv(source), 'text/csv');
  store.setStatus(`Exported ${name}.`);
}

/** Opens the printable comparison in a new tab. */
export async function openPrintableComparison(store: EditorStore): Promise<void> {
  const { comparison, restored } = store.getState().compare;
  const source = comparison ?? restored;
  if (source === null) return;
  const { renderComparisonHtml } = await import('../exports/printable-comparison');
  openHtmlInNewTab(renderComparisonHtml(source, { generatedAt: nowIso() }));
  store.setStatus('Opened the printable comparison in a new tab.');
}

/** Opens the run sheet of the current tab in a new tab, unless a route has no path (the 4.4 message is shown instead). */
export async function openRunSheetTab(store: EditorStore): Promise<void> {
  const scenario = store.getState().scenario;
  const blocked = blockedMessage(scenario, createPathCache(scenario).unreachable);
  if (blocked !== null) {
    store.setStatus(blocked);
    return;
  }
  const hash = store.getState().hash ?? (await scenarioHash(scenario));
  const { renderRunSheet } = await import('../exports/run-sheet');
  openHtmlInNewTab(renderRunSheet(scenario, { generatedAt: nowIso(), scenarioHash: hash }).html);
  store.setStatus('Opened the run sheet in a new tab.');
}