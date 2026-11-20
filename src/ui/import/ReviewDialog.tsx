// The review dialog of Open JSON (requirement 10.7), shared with the share link opener: `<title>, hash <hash8>, model <version>`,
// every warning of the parser verbatim, then Open and Cancel. Focus goes to Open when the dialog shows.
import { useEffect, useId, useRef, type ReactElement } from 'react';
import type { OpenJsonResult } from '../../imports/scenarioJson';

export function ReviewDialog({ result, heading, onOpen, onCancel }: { result: OpenJsonResult | null; heading: string; onOpen: () => void; onCancel: () => void }): ReactElement {
  const headingId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const shown = result !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (shown && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      openButton.current?.focus();
    } else if (!shown && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [shown]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id={headingId}>{heading}</h2>
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
        {result !== null && result.ok ? <button ref={openButton} type="button" onClick={onOpen}>Open</button> : null}{' '}
        <button type="button" onClick={onCancel}>Cancel</button>
      </p>
    </dialog>
  );
}
