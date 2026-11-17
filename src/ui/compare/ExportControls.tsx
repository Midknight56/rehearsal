// Export controls of the Compare screen (requirement 12.2): Export JSON of the current tab, the two CSV files and the printable
// comparison once a comparison (or a restored summary) is on screen, and the workbook and run sheet of the current tab.
import type { ReactElement } from 'react';
import { exportCurrentScenarioJson } from '../exportJson';
import { downloadComparisonCsv, downloadResultsCsv, openPrintableComparison, openRunSheetTab } from '../exportFiles';
import { exportCurrentWorkbook } from '../print/PrintControls';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';

export function ExportControls({ store }: { store: EditorStore }): ReactElement {
  const { compare } = useEditorState(store);
  const hasSummary = compare.comparison !== null || compare.restored !== null;
  return (
    <div className="toolbar" role="group" aria-label="Export">
      <button type="button" data-testid="export-scenario-json" onClick={() => void exportCurrentScenarioJson(store)}>
        Export JSON
      </button>
      {compare.comparison === null ? null : (
        <button type="button" data-testid="export-results-csv" onClick={() => void downloadResultsCsv(store)}>Export results CSV</button>
      )}
      {hasSummary ? (
        <button type="button" data-testid="export-comparison-csv" onClick={() => void downloadComparisonCsv(store)}>Export comparison CSV</button>
      ) : null}
      <button type="button" data-testid="export-workbook" onClick={() => void exportCurrentWorkbook(store)}>Export workbook</button>
      {hasSummary ? (
        <button type="button" data-testid="open-printable-comparison" onClick={() => void openPrintableComparison(store)}>Open printable comparison</button>
      ) : null}
      <button type="button" data-testid="open-run-sheet" onClick={() => void openRunSheetTab(store)}>Open run sheet</button>
    </div>
  );
}