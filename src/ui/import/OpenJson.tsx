// Open JSON (requirement 10.7): a file input, then a dialog with `<title>, hash <hash8>, model <version>`, every warning of the
// parser verbatim and the buttons Open and Cancel. Open replaces the current tab's scenario as one committed edit; saved results
// carry no trace and are not loaded. A refused file shows its message and changes nothing.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { openScenarioJson, type OpenJsonResult } from '../../imports/scenarioJson';
import type { EditorStore } from '../state/store';

type Pending = { name: string; result: OpenJsonResult };

export function OpenJson({ store, label, onOpened }: { store: EditorStore; label: string; onOpened?: () => void }): ReactElement {
  const [pending, setPending] = useState<Pending | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (pending !== null && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      openButton.current?.focus();
    } else if (pending === null && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [pending]);

  const close = (): void => {
    setPending(null);
    if (inputRef.current !== null) inputRef.current.value = '';
    inputRef.current?.focus();
  };

  const choose = async (files: FileList | null): Promise<void> => {
    const file = files?.[0];
    if (file === undefined) return;
    const result = await openScenarioJson(file);
    setPending({ name: file.name, result });
    if (!result.ok) store.setStatus(result.message);
  };

  const confirm = (): void => {
    if (pending === null || !pending.result.ok) return;
    const { scenario } = pending.result;
    store.dispatch({ type: 'scenario/open', scenario });
    store.dispatch({ type: 'screen/set', screen: 'plan' });
    store.setStatus(`Opened "${scenario.title}".`);
    onOpened?.();
    close();
  };

  const result = pending?.result ?? null;
  return (
    <>
      <label>
        {`${label} `}
        <input ref={inputRef} type="file" accept=".json,application/json" data-testid="import-json" onChange={(e) => void choose(e.target.files)} />
      </label>
      <dialog
        ref={dialogRef}
        aria-labelledby="open-json-heading"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <h2 id="open-json-heading">Review the scenario file</h2>
        {result === null ? null : result.ok ? (
          <>
            <p>{`${result.scenario.title}, hash ${result.hash.slice(0, 8)}, model ${result.scenario.modelVersion}`}</p>
            {result.warnings.map((w) => (
              <p key={`${w.code}:${w.message}`} className="field-error">{w.message}</p>
            ))}
            {result.results.length > 0 ? <p className="muted">Saved results carry no replay trace and are not loaded; simulate to see results.</p> : null}
          </>
        ) : (
          <p className="field-error">{result.message}</p>
        )}
        <p>
          {result !== null && result.ok ? <button ref={openButton} type="button" onClick={confirm}>Open</button> : null}{' '}
          <button type="button" onClick={close}>Cancel</button>
        </p>
      </dialog>
    </>
  );
}