// Small controlled inputs shared by the tables and panels. A field keeps its own draft text; it commits on Enter or blur,
// only when the text differs from the scenario value, and on a refusal it keeps the typed text and shows the message.
import { useEffect, useId, useState, type ReactElement } from 'react';
import { refusal } from '../state/reducer';
import type { EditorStore } from '../state/store';
import type { EditorAction } from '../state/types';

/** The refusal text of an action (null when allowed), then the dispatch; the store announces a refusal in the status region. */
export function attempt(store: EditorStore, action: EditorAction): string | null {
  const text = refusal(store.getState(), action);
  store.dispatch(action);
  return text;
}

export function CommitInput(props: {
  label: string;
  value: string;
  onCommit: (text: string) => string | null;
  inputMode?: 'text' | 'decimal' | 'numeric';
  width?: string;
}): ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  useEffect(() => {
    setDraft(null);
    setError(null);
  }, [props.value]);
  const commit = (): void => {
    if (draft === null || draft === props.value) {
      setDraft(null);
      setError(null);
      return;
    }
    const result = props.onCommit(draft);
    if (result === null) {
      setDraft(null);
      setError(null);
    } else setError(result);
  };
  return (
    <>
      <input
        type="text"
        inputMode={props.inputMode ?? 'text'}
        aria-label={props.label}
        value={draft ?? props.value}
        aria-invalid={error === null ? undefined : true}
        aria-describedby={error === null ? undefined : errorId}
        style={props.width === undefined ? undefined : { width: props.width }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        onBlur={commit}
      />
      {error === null ? null : <span id={errorId} className="field-error">{error}</span>}
    </>
  );
}

/** Two inputs that commit together, on Enter in either or when focus leaves both (a half-typed pair is never committed). */
export function PairInput(props: {
  labelX: string;
  labelY: string;
  value: [number, number];
  onCommit: (cell: [number, number]) => string | null;
  parse: (text: string) => number | null;
  parseError: (name: 'x' | 'y', text: string) => string;
}): ReactElement {
  const [x, setX] = useState<string | null>(null);
  const [y, setY] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const key = props.value.join(',');
  useEffect(() => {
    setX(null);
    setY(null);
    setError(null);
  }, [key]);
  const commit = (): void => {
    if (x === null && y === null) return;
    const xt = x ?? String(props.value[0]);
    const yt = y ?? String(props.value[1]);
    const px = props.parse(xt);
    const py = props.parse(yt);
    if (px === null) return setError(props.parseError('x', xt));
    if (py === null) return setError(props.parseError('y', yt));
    if (px === props.value[0] && py === props.value[1]) {
      setX(null);
      setY(null);
      return setError(null);
    }
    const result = props.onCommit([px, py]);
    if (result === null) {
      setX(null);
      setY(null);
      setError(null);
    } else setError(result);
  };
  const common = {
    type: 'text' as const,
    inputMode: 'numeric' as const,
    'aria-invalid': error === null ? undefined : true,
    'aria-describedby': error === null ? undefined : errorId,
    onKeyDown: (e: { key: string }) => {
      if (e.key === 'Enter') commit();
    },
  };
  return (
    <span
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit();
      }}
    >
      <input {...common} aria-label={props.labelX} value={x ?? String(props.value[0])} style={{ width: '4em' }} onChange={(e) => setX(e.target.value)} />
      <input {...common} aria-label={props.labelY} value={y ?? String(props.value[1])} style={{ width: '4em' }} onChange={(e) => setY(e.target.value)} />
      {error === null ? null : <span id={errorId} className="field-error">{error}</span>}
    </span>
  );
}
