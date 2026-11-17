// App wiring: one editor store and one SimulationClient for the session, the screens, and the one status region.
// Tasks 7 to 11 add the import dialog, the run controller and the game view to the Plan screen; tasks 15 and 18 add the
// print and compare screens.
import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import { scenarioHash } from './domain/hash';
import { createPathCache, describeNode } from './spatial/path-cache';
import { browserStorage } from './storage/browser';
import { createPrefsStore } from './storage/prefs';
import { createSavedScenarios } from './ui/saved';
import { createCompareController } from './ui/compare/controller';
import { CompareScreen } from './ui/compare/CompareScreen';
import { createRunController, type RunController } from './ui/run/controller';
import { createSimulationClient, type SimulationClient } from './workers/client';
import { Landing } from './ui/landing/Landing';
import { PlanScreen } from './ui/plan/PlanScreen';
import { PrintScreen } from './ui/print/PrintScreen';
import { StatusRegion } from './ui/StatusRegion';
import { createEditorStore, type EditorStore } from './ui/state/store';
import { useEditorState } from './ui/state/useEditorState';

export function App(props: { fetchImpl?: typeof fetch; store?: EditorStore; client?: SimulationClient } = {}): ReactElement {
  const storeRef = useRef<EditorStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = props.store ?? createEditorStore({ hash: scenarioHash, now: () => new Date().toISOString(), prefs: createPrefsStore(browserStorage()).read() });
  }
  const store = storeRef.current;
  const clientRef = useRef<SimulationClient | null>(null);
  if (clientRef.current === null) clientRef.current = props.client ?? createSimulationClient();
  const client = clientRef.current;
  const controllerRef = useRef<ReturnType<typeof createRunController> | null>(null);
  if (controllerRef.current === null) {
    const controller = createRunController(client, store.dispatch, { pathCache: createPathCache, describe: describeNode });
    store.setCancelHook(() => controller.cancel());
    controllerRef.current = controller;
  }
  const savedRef = useRef<ReturnType<typeof createSavedScenarios> | null>(null);
  if (savedRef.current === null) savedRef.current = createSavedScenarios(store, browserStorage());
  const saved = savedRef.current;
  useEffect(() => saved.refresh(), [saved]);
  const compareRef = useRef<ReturnType<typeof createCompareController> | null>(null);
  if (compareRef.current === null) compareRef.current = createCompareController(client, store);
  const compareController = compareRef.current;
  // Simulate on the Plan screen cancels a running comparison first (requirement 12.3).
  const controller = useMemo(() => ({ ...controllerRef.current!, start: (...args: Parameters<RunController['start']>) => { compareController.cancel(); return (controllerRef.current as RunController).start(...args); } }), [compareController]);
  const { screen, prefs } = useEditorState(store);

  // The Motion toggle reaches the stylesheet through data-motion on the root element (tokens.css).
  useEffect(() => {
    document.documentElement.dataset.motion = prefs.motion;
  }, [prefs.motion]);

  useEffect(() => {
    const dispose = (): void => client.dispose();
    window.addEventListener('pagehide', dispose);
    return () => window.removeEventListener('pagehide', dispose);
  }, [client]);

  useEffect(() => {
    if (import.meta.env.VITE_REHEARSAL_TEST === '1') void import('./ui/testHook').then((m) => m.installTestHook(store));
  }, [store]);

  return (
    <>
      <StatusRegion store={store} />
      {screen === 'landing' ? (
        <Landing store={store} saved={saved} {...(props.fetchImpl === undefined ? {} : { fetchImpl: props.fetchImpl })} />
      ) : screen === 'print' ? (
        <PrintScreen store={store} />
      ) : screen === 'compare' ? (
        <CompareScreen store={store} controller={compareController} saved={saved} />
      ) : (
        <PlanScreen store={store} controller={controller} saved={saved} />
      )}
    </>
  );
}
