// Plan screen controls of task 15: Print run sheet (disabled with the 4.4 message while a route has no path) and Export workbook.
import { useMemo, type ReactElement } from 'react';
import { scenarioHash } from '../../domain/hash';
import { createPathCache } from '../../spatial/path-cache';
import { downloadBytes, exportFileName } from '../download';
import { requestHeadingFocus } from '../focus';
import { blockedMessage } from '../run/controller';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** `<title-slug>-<hash8>.xlsx` of the current tab, written from typed values only. */
export async function exportCurrentWorkbook(store: EditorStore): Promise<void> {
  const scenario = store.getState().scenario;
  try {
    const hash = store.getState().hash ?? (await scenarioHash(scenario));
    const { exportWorkbook } = await import('../../exports/xlsx');
    const name = exportFileName(scenario.title, hash, 'xlsx');
    downloadBytes(name, exportWorkbook(scenario), XLSX_MIME);
    store.setStatus(`Exported ${name}.`);
  } catch (error) {
    store.setStatus(`Could not export the workbook (${error instanceof Error ? error.name : 'Error'}).`);
  }
}

/** sheet is the Print run sheet button (it sits in the top bar), workbook is Export workbook; both by default. */
export function PrintControls({ store, part }: { store: EditorStore; part?: 'sheet' | 'workbook' }): ReactElement {
  const { scenario } = useEditorState(store);
  const blocked = useMemo(() => blockedMessage(scenario, createPathCache(scenario).unreachable), [scenario]);
  const open = (): void => {
    if (blocked !== null) {
      store.setStatus(blocked);
      return;
    }
    requestHeadingFocus();
    store.dispatch({ type: 'screen/set', screen: 'print' });
  };
  return (
    <>
      {part === 'workbook' ? null : <button type="button" aria-disabled={blocked === null ? undefined : 'true'} onClick={open}>Print run sheet</button>}
      {part === 'workbook' || blocked === null ? null : <span className="muted">{blocked}</span>}
      {part === 'sheet' ? null : <button type="button" data-testid="export-workbook" onClick={() => void exportCurrentWorkbook(store)}>Export workbook</button>}
    </>
  );
}