// The Print screen (requirements 8.1, 8.3, 8.4, 8.6): the run sheet of the current tab, Print, Save as HTML and Back to plan.
import { useMemo, type ReactElement } from 'react';
import { buildRunSheetModel, renderRunSheet } from '../../exports/run-sheet';
import { createPathCache } from '../../spatial/path-cache';
import { downloadText } from '../download';
import { requestHeadingFocus, useHeadingFocus } from '../focus';
import { blockedMessage } from '../run/controller';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';
import { TopBar } from '../TopBar';
import { resultsLine } from './resultsLine';
import { RunSheetView } from './RunSheetView';

export function PrintScreen({ store }: { store: EditorStore }): ReactElement {
  const state = useEditorState(store);
  useHeadingFocus();
  const { scenario, hash } = state;
  const generatedAt = useMemo(() => new Date().toISOString(), []);
  const blocked = useMemo(() => blockedMessage(scenario, createPathCache(scenario).unreachable), [scenario]);
  const model = useMemo(
    () => (hash === null || blocked !== null ? null : { ...buildRunSheetModel(scenario, hash), generatedAt }),
    [scenario, hash, blocked, generatedAt],
  );

  const back = (): void => {
    requestHeadingFocus();
    store.dispatch({ type: 'screen/set', screen: 'plan' });
  };
  const saveHtml = (): void => {
    if (hash === null) return;
    const name = `run-sheet-${hash.slice(0, 8)}.html`;
    downloadText(name, renderRunSheet(scenario, { generatedAt, scenarioHash: hash }).html, 'text/html');
    store.setStatus(`Saved ${name}.`);
  };

  return (
    <>
    <TopBar store={store}>
      <button type="button" onClick={back}>Back to plan</button>
    </TopBar>
    <main className="print-screen">
      <div className="toolbar no-print" role="group" aria-label="Run sheet actions">
        <button type="button" onClick={() => window.print()} aria-disabled={model === null ? 'true' : undefined}>Print</button>
        <button type="button" onClick={saveHtml} aria-disabled={model === null ? 'true' : undefined}>Save as HTML</button>
      </div>
      {model === null ? (
        <>
          <h1>{`${scenario.title} (run sheet)`}</h1>
          <p>{blocked ?? 'Computing the scenario hash.'}</p>
        </>
      ) : (
        <RunSheetView model={model} results={resultsLine(state, state.currentIndex)} />
      )}
    </main>
    </>
  );
}