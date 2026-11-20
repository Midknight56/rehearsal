// Open JSON (requirement 10.7): a file input, then a dialog with `<title>, hash <hash8>, model <version>`, every warning of the
// parser verbatim and the buttons Open and Cancel. Open replaces the current tab's scenario as one committed edit; saved results
// carry no trace and are not loaded. A refused file shows its message and changes nothing.
import { useRef, useState, type ReactElement } from 'react';
import { openScenarioJson, type OpenJsonResult } from '../../imports/scenarioJson';
import type { EditorStore } from '../state/store';
import { ReviewDialog } from './ReviewDialog';

type Pending = { name: string; result: OpenJsonResult };

export function OpenJson({ store, label, onOpened }: { store: EditorStore; label: string; onOpened?: () => void }): ReactElement {
  const [pending, setPending] = useState<Pending | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <>
      <label>
        {`${label} `}
        <input ref={inputRef} type="file" accept=".json,application/json" data-testid="import-json" onChange={(e) => void choose(e.target.files)} />
      </label>
      <ReviewDialog result={pending?.result ?? null} heading="Review the scenario file" onOpen={confirm} onCancel={close} />
    </>
  );
}
