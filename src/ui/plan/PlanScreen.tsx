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

export function PlanScreen({ store, controller }: { store: EditorStore; controller: RunController }): ReactElement {
  const state = useEditorState(store);
  const canUndo = (state.past[state.currentIndex]?.length ?? 0) > 0;
  const canRedo = (state.future[state.currentIndex]?.length ?? 0) > 0;

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
      </div>
      <ImportDialog store={store} />
      <section className="panel" aria-label="Run and results">
        <RunPanel store={store} controller={controller} />
        <GameViewPanel store={store} />
        <ResultTables store={store} />
      </section>
      <section className="panel" aria-labelledby="floor-plan-heading">
        <h2 id="floor-plan-heading">Floor plan</h2>
        <FloorPlan store={store} />
      </section>
      <div className="plan-grid">
        <div>
          <section className="panel" aria-label="Arrivals"><ArrivalsTable store={store} /></section>
          <section className="panel" aria-label="Stations"><StationsTable store={store} /></section>
        </div>
        <div>
          <section className="panel" aria-label="Layout"><LayoutPanel store={store} /></section>
          <section className="panel" aria-label="Assumptions"><AssumptionsPanel store={store} /></section>
        </div>
      </div>
    </main>
  );
}
