// The save-failure block (requirement 10.5): the reason text from saveErrorText, Retry save and Download scenario JSON, so a
// failed save never costs the organizer the scenario. `Download comparison CSV` joins it when a comparison is in memory.
import type { ReactElement } from 'react';
import { saveErrorText } from '../comparison/labels';
import { exportCurrentScenarioJson } from './exportJson';
import { downloadComparisonCsv } from './exportFiles';
import type { EditorStore } from './state/store';
import { useEditorState } from './state/useEditorState';

export function SaveError({ store, onRetry }: { store: EditorStore; onRetry: () => void }): ReactElement | null {
  const state = useEditorState(store);
  const { saveError } = state.storage;
  if (saveError === null) return null;
  const hasComparison = state.compare.comparison !== null || state.compare.restored !== null;
  return (
    <div role="group" aria-label="Save failed" className="save-error">
      <p className="field-error" data-testid="save-error">{saveErrorText(saveError.reason)}</p>
      <p>Export the scenario as JSON to keep it; your edits are still open.</p>
      <button type="button" data-testid="retry-save" onClick={onRetry}>Retry save</button>{' '}
      <button type="button" data-testid="download-scenario-json" onClick={() => void exportCurrentScenarioJson(store)}>Download scenario JSON</button>
      {hasComparison ? (
        <>
          {' '}
          <button type="button" data-testid="download-comparison-csv" onClick={() => void downloadComparisonCsv(store)}>Download comparison CSV</button>
        </>
      ) : null}
    </div>
  );
}