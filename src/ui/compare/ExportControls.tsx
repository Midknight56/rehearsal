// Export controls of the Compare screen. Task 18 renders only `Export JSON`; the CSV, workbook, printable comparison and
// run sheet controls belong to task 15 and are not rendered before it has run.
import type { ReactElement } from 'react';
import { exportCurrentScenarioJson } from '../exportJson';
import type { EditorStore } from '../state/store';

export function ExportControls({ store }: { store: EditorStore }): ReactElement {
  return (
    <div className="toolbar" role="group" aria-label="Export">
      <button type="button" data-testid="export-scenario-json" onClick={() => void exportCurrentScenarioJson(store)}>
        Export JSON
      </button>
    </div>
  );
}