// The import dialog (requirements 1 and 2): choose files, read the preview, fix or apply. A preview with errors can never
// be applied. Nothing leaves the browser: the files are read here and handed to the adapters.
import { useEffect, useRef, type ReactElement } from 'react';
import { scenarioHash } from '../../domain/hash';
import { validateScenario } from '../../domain/validate';
import { previewCsv } from '../../imports/csv';
import { MAX_IMPORT_BYTES, type Deps, type ImportPreview } from '../../imports/preview';
import { previewWorkbook } from '../../imports/xlsx';
import { createPathCache } from '../../spatial/path-cache';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';
import { PreviewTable } from './PreviewTable';

type Chosen = { arrivals: File | null; stations: File | null; workbook: File | null };

function notes(preview: ImportPreview): string[] {
  const lines: string[] = [];
  if (preview.source.kind === 'xlsx' && preview.sheetsRead.length > 0) {
    lines.push(`Sheets read: ${preview.sheetsRead.join(', ')}. Not read: ${preview.sheetsIgnored.length === 0 ? 'none' : preview.sheetsIgnored.join(', ')}.`);
    if (preview.arrivals !== null && preview.stations !== null && preview.settings === null) lines.push('Settings sheet not present; current settings kept.');
  }
  const columns = [...new Set([...preview.columnsNotRead.arrivals, ...preview.columnsNotRead.stations])];
  if (columns.length > 0) lines.push(`Columns not read: ${columns.join(', ')}`);
  if (preview.settingsKeysNotRead.length > 0) lines.push(`Settings keys not read: ${preview.settingsKeysNotRead.join(', ')}`);
  if (preview.formulaCells.length > 0) lines.push(`Formula cells: ${preview.formulaCells.map((c) => `${c.sheet}!${c.cell}`).join(', ')}`);
  return lines;
}

function focusFirstControl(tableName: 'Arrivals' | 'Stations'): void {
  const table = [...document.querySelectorAll('table')].find((t) => t.querySelector('caption')?.textContent === tableName);
  table?.querySelector<HTMLElement>('input, select, button')?.focus();
}

export function ImportDialog({ store, deps }: { store: EditorStore; deps?: Partial<Deps> }): ReactElement {
  const state = useEditorState(store);
  const { open, preview, busy } = state.importDialog;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const chosen = useRef<Chosen>({ arrivals: null, stations: null, workbook: null });
  const inputs = useRef<Record<keyof Chosen, HTMLInputElement | null>>({ arrivals: null, stations: null, workbook: null });
  const sequence = useRef(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
    if (!open) chosen.current = { arrivals: null, stations: null, workbook: null };
  }, [open]);

  const read = async (): Promise<void> => {
    const { arrivals, stations, workbook } = chosen.current;
    const allDeps: Deps = { validate: validateScenario, hash: scenarioHash, pathCache: createPathCache, maxBytes: MAX_IMPORT_BYTES, ...deps };
    const current = store.getState().scenario;
    const mine = ++sequence.current;
    store.dispatch({ type: 'import/busy', busy: true });
    let next: ImportPreview | null = null;
    try {
      if (workbook !== null) next = await previewWorkbook(workbook, current, allDeps);
      else {
        const files = [
          ...(arrivals === null ? [] : [{ table: 'arrivals' as const, file: arrivals }]),
          ...(stations === null ? [] : [{ table: 'stations' as const, file: stations }]),
        ];
        next = files.length === 0 ? null : await previewCsv(files, current, allDeps);
      }
    } catch (error) {
      if (mine !== sequence.current) return;
      store.dispatch({ type: 'import/busy', busy: false });
      store.setStatus(`Could not read the file: ${error instanceof Error ? error.name : 'Error'}.`);
      return;
    }
    if (mine === sequence.current) store.dispatch({ type: 'import/preview', preview: next });
  };

  const choose = (which: keyof Chosen, files: FileList | null): void => {
    const file = files?.[0] ?? null;
    chosen.current = which === 'workbook' ? { arrivals: null, stations: null, workbook: file } : { ...chosen.current, [which]: file, workbook: null };
    if (which === 'workbook') {
      for (const other of ['arrivals', 'stations'] as const) if (inputs.current[other] !== null) inputs.current[other]!.value = '';
    } else if (inputs.current.workbook !== null) inputs.current.workbook.value = '';
    void read();
  };

  const errors = preview?.errors ?? [];
  const canApply = preview !== null && errors.length === 0 && preview.candidate !== null;
  const reason = preview === null ? 'Choose a file to preview.' : errors.length > 0 ? 'Fix the errors above to apply.' : '';

  const apply = (): void => {
    if (!canApply || preview === null || preview.candidate === null) {
      store.setStatus(`Apply import is unavailable: ${preview === null ? 'no file is chosen.' : 'the preview has errors.'}`);
      return;
    }
    const sources = preview.source.kind === 'xlsx' ? [preview.source.name] : preview.source.files.map((f) => f.name);
    const imported = { cohorts: preview.arrivals?.length ?? 0, stations: preview.stations?.length ?? 0 };
    store.dispatch({ type: 'import/apply', candidate: preview.candidate, sources, imported });
    const target = preview.arrivals !== null ? 'Arrivals' : 'Stations';
    setTimeout(() => focusFirstControl(target), 0);
  };

  const focusRow = (table: string, row: number): void => {
    const el = document.getElementById(`import-row-${table}-${row}`);
    (el ?? document.getElementById('import-errors'))?.focus();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="import-heading"
      onCancel={(e) => {
        e.preventDefault();
        store.dispatch({ type: 'import/close' });
      }}
      onClose={() => {
        if (store.getState().importDialog.open) store.dispatch({ type: 'import/close' });
      }}
    >
      <h2 id="import-heading">Import</h2>
      <p className="muted">The files are read in this browser. Only the template columns and sheets are read.</p>
      <p>
        <label>Arrivals CSV <input ref={(el) => { inputs.current.arrivals = el; }} type="file" accept=".csv,text/csv" data-testid="import-arrivals-csv" onChange={(e) => choose('arrivals', e.target.files)} /></label>
      </p>
      <p>
        <label>Stations CSV <input ref={(el) => { inputs.current.stations = el; }} type="file" accept=".csv,text/csv" data-testid="import-stations-csv" onChange={(e) => choose('stations', e.target.files)} /></label>
      </p>
      <p>
        <label>Workbook (.xlsx) <input ref={(el) => { inputs.current.workbook = el; }} type="file" accept=".xlsx" data-testid="import-workbook" onChange={(e) => choose('workbook', e.target.files)} /></label>
      </p>
      {busy ? <p aria-busy="true">Reading…</p> : null}
      {preview === null ? null : (
        <div>
          {notes(preview).map((line) => (
            <p key={line}>{line}</p>
          ))}
          {errors.length === 0 ? null : (
            <div id="import-errors" tabIndex={-1}>
              <h3>Errors</h3>
              <ul aria-label="Import errors">
                {errors.map((e, i) => (
                  <li key={`${i}:${e.message}`}>
                    <button type="button" onClick={() => (e.location === undefined ? focusRow('none', 0) : focusRow(e.location.table, e.location.row))}>{e.message}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <PreviewTable preview={preview} />
        </div>
      )}
      <p>
        <button type="button" aria-disabled={canApply ? undefined : 'true'} onClick={apply}>Apply import</button>{' '}
        {reason === '' ? null : <span className="muted">{reason}</span>}{' '}
        <button type="button" onClick={() => store.dispatch({ type: 'import/close' })}>Close</button>
      </p>
    </dialog>
  );
}
