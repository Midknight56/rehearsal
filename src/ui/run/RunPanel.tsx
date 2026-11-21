// Run panel (requirements 4.4, 4.5, 5.1 to 5.5). Simulate and Cancel act through the run controller; the panel only shows
// the run state of the store. Simulate stays focusable while a run is active and carries aria-disabled, never `disabled`.
import { useEffect, useRef, type ReactElement } from 'react';
import { scenarioHash } from '../../domain/hash';
import { STALE_LABEL, resultsStatus } from '../state/selectors';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';
import type { RunController } from './controller';
import { invalidFields, invalidRunMessage } from '../plan/invalidFields';

export function RunPanel({ store, controller }: { store: EditorStore; controller: RunController }): ReactElement {
  const state = useEditorState(store);
  const { run } = state;
  const running = run.status === 'running' || run.status === 'cancelling';
  const waitingForNext = useRef(false);

  const startNow = async (): Promise<void> => {
    // A field marked in red holds a value the scenario never took; running now would run the old value.
    const blocked = invalidRunMessage(invalidFields());
    if (blocked !== null) {
      store.dispatch({ type: 'run/blocked', message: blocked });
      return;
    }
    const snapshot = store.getState().scenario;
    const tabIndex = store.getState().currentIndex;
    const hash = store.getState().hash ?? (await scenarioHash(snapshot));
    // An edit made while the hash was computed makes this click stale; the next click uses the new scenario.
    if (store.getState().scenario !== snapshot) return;
    controller.start(snapshot, hash, tabIndex);
  };

  // A Simulate pressed during a run starts its run here, from the finished callback of the cancelled one, on the tab that is current now.
  useEffect(() => {
    if (run.status === 'idle' && waitingForNext.current) {
      waitingForNext.current = false;
      void startNow();
    }
    // startNow reads the store at call time; only the run status matters here.
  }, [run.status]);

  const onSimulate = (): void => {
    if (running) {
      waitingForNext.current = true;
      if (run.status === 'running') controller.cancel();
      return;
    }
    void startNow();
  };

  const stale = resultsStatus(state, state.currentIndex) === 'stale';
  return (
    <div className="run-panel" role="group" aria-label="Run">
      <div className="toolbar">
        <button type="button" className="primary" aria-disabled={running ? 'true' : undefined} onClick={onSimulate}>Simulate</button>
        {running ? <button type="button" onClick={() => controller.cancel()}>Cancel</button> : null}
        {run.status === 'running' ? <span>{`Simulating\u2026 ${run.done} of ${run.total}`}</span> : null}
        {run.status === 'cancelling' ? <span>{'Cancelling\u2026'}</span> : null}
        {running ? <span className="muted">A run is in progress. Activating Simulate cancels it and starts the next run.</span> : null}
        {stale ? <strong>{STALE_LABEL}</strong> : null}
      </div>
      {run.status === 'idle' && run.message !== undefined ? <p>{run.message}</p> : null}
      {run.status === 'blocked' ? <p className="field-error">{run.message}</p> : null}
    </div>
  );
}
