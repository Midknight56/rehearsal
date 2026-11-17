// Export JSON and Save for the current tab (requirements 10.3 and 10.7). Both stay available whatever the state of storage.
import type { ReactElement } from 'react';
import { exportCurrentScenarioJson } from './exportJson';
import type { SavedScenarios } from './saved';
import type { EditorStore } from './state/store';

export function SaveBar({ store, saved }: { store: EditorStore; saved: SavedScenarios }): ReactElement {
  return (
    <>
      <button type="button" data-testid="export-scenario-json" onClick={() => void exportCurrentScenarioJson(store)}>Export JSON</button>
      <button type="button" data-testid="save-scenario" onClick={() => void saved.save()}>Save</button>
    </>
  );
}