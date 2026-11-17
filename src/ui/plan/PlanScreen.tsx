// The Plan screen. Tasks 7 to 11 add the import dialog, the floor plan, the run panel, the result tables and the game view.
import { useEffect, type ReactElement } from 'react';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';
import { ArrivalsTable } from './ArrivalsTable';
import { AssumptionsPanel } from './AssumptionsPanel';
import { LayoutPanel } from './LayoutPanel';
import { ScenarioTabs } from './ScenarioTabs';
import { StationsTable } from './StationsTable';
import { ImportDialog } from '../import/ImportDialog';
import { Templates } from '../import/Templates';
import { FloorPlan } from '../floorplan/FloorPlan';
import { GameViewPanel } from '../game/GameViewPanel';
import { ResultTables } from '../results/ResultTables';
import { RunPanel } from '../run/RunPanel';
import type { RunController } from '../run/controller';
import { createPrefsStore, type Prefs } from '../../storage/prefs';
import { requestHeadingFocus, useHeadingFocus } from '../focus';
import { OpenJson } from '../import/OpenJson';
import type { SavedScenarios } from '../saved';
import { SaveBar } from '../SaveBar';
import { SaveError } from '../SaveError';

export function PlanScreen({ store, controller, saved }: { store: EditorStore; controller: RunController; saved?: SavedScenarios }): ReactElement {
  const state = useEditorState(store);
  useHeadingFocus();
  const canUndo = (state.past[state.currentIndex]?.length ?? 0) > 0;
  const canRedo = (state.future[state.currentIndex]?.length ?? 0) > 0;

  const setMotion = (motion: Prefs['motion']): void => {
    const prefs: Prefs = { version: 1, motion };
    store.dispatch({ type: 'prefs/set', prefs });
    try {
      createPrefsStore(window.localStorage).write(prefs);
    } catch {
      createPrefsStore(null).write(prefs);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target !== null && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) store.dispatch({ type: 'undo' });
      else if ((key === 'z' && e.shiftKey) || key === 'y') store.dispatch({ type: 'redo' });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  return (
    <main>
      <h1>{state.scenario.title}</h1>
      <ScenarioTabs store={store} />
      <div className="toolbar" role="group" aria-label="Edit">
        <button type="button" aria-disabled={canUndo ? undefined : 'true'} onClick={() => { if (canUndo) store.dispatch({ type: 'undo' }); }}>Undo</button>
        {canUndo ? null : <span className="muted">Nothing to undo.</span>}
        <button type="button" aria-disabled={canRedo ? undefined : 'true'} onClick={() => { if (canRedo) store.dispatch({ type: 'redo' }); }}>Redo</button>
        {canRedo ? null : <span className="muted">Nothing to redo.</span>}
        <button type="button" onClick={() => store.dispatch({ type: 'import/open' })}>Import</button>
        <Templates />
        <button type="button" onClick={() => { requestHeadingFocus(); store.dispatch({ type: 'screen/set', screen: 'compare' }); }}>Compare</button>
        <OpenJson store={store} label="Open JSON" />
        {saved === undefined ? null : <SaveBar store={store} saved={saved} />}
        <label>
          Motion{' '}
          <select value={state.prefs.motion} onChange={(e) => setMotion(e.target.value as Prefs['motion'])}>
            <option value="system">System</option>
            <option value="reduce">Reduce</option>
            <option value="allow">Allow</option>
          </select>
        </label>
      </div>
      {saved === undefined ? null : <SaveError store={store} onRetry={() => void saved.save()} />}
      <ImportDialog store={store} />
      <div className="plan-grid">
        <div>
          <section className="panel" aria-label="Arrivals"><ArrivalsTable store={store} /></section>
          <section className="panel" aria-label="Stations"><StationsTable store={store} /></section>
        </div>
        <div>
          {/* After the tables in DOM and Tab order, beside them on screen, so a drag starts in the first viewport. */}
          <section className="panel" aria-labelledby="floor-plan-heading">
            <h2 id="floor-plan-heading">Floor plan</h2>
            <FloorPlan store={store} />
          </section>
          <section className="panel" aria-label="Layout"><LayoutPanel store={store} /></section>
          <section className="panel" aria-label="Assumptions"><AssumptionsPanel store={store} /></section>
        </div>
      </div>
      <section className="panel" aria-label="Run and results">
        <RunPanel store={store} controller={controller} />
        <GameViewPanel store={store} />
        <ResultTables store={store} />
      </section>
    </main>
  );
}
