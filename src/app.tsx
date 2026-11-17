// App wiring: one editor store and one SimulationClient for the session, the screens, and the one status region.
// Tasks 7 to 11 add the import dialog, the run controller and the game view to the Plan screen; tasks 15 and 18 add the
// print and compare screens.
import { useEffect, useRef, type ReactElement } from 'react';
import { scenarioHash } from './domain/hash';
import { createPathCache, describeNode } from './spatial/path-cache';
import { createRunController } from './ui/run/controller';
import { createSimulationClient, type SimulationClient } from './workers/client';
import { Landing } from './ui/landing/Landing';
import { PlanScreen } from './ui/plan/PlanScreen';
import { StatusRegion } from './ui/StatusRegion';
import { createEditorStore, type EditorStore } from './ui/state/store';
import { useEditorState } from './ui/state/useEditorState';

export function App(props: { fetchImpl?: typeof fetch; store?: EditorStore; client?: SimulationClient } = {}): ReactElement {
  const storeRef = useRef<EditorStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = props.store ?? createEditorStore({ hash: scenarioHash, now: () => new Date().toISOString() });
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
  const controller = controllerRef.current;
  const { screen } = useEditorState(store);

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
      {screen === 'landing' ? (
        <Landing store={store} {...(props.fetchImpl === undefined ? {} : { fetchImpl: props.fetchImpl })} />
      ) : (
        <PlanScreen store={store} controller={controller} />
      )}
      <StatusRegion store={store} />
    </>
  );
}
