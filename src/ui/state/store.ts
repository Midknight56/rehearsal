// Editor store: one canonical state, useSyncExternalStore-compatible. It recomputes each tab's hash after a committed edit
// (asynchronously, keyed by the revision it was computed for), writes status text only through setStatus, and calls the
// run controller's cancel before a tab switch during a run (requirement 5.5). It never posts a worker message.
import type { Scenario } from '../../domain/scenario';
import type { scenarioHash } from '../../domain/hash';
import type { Prefs } from '../../storage/prefs';
import { announcement } from './announce';
import { initialState, reduce } from './reducer';
import type { EditorAction, EditorState } from './types';

export type EditorStore = {
  getState(): EditorState;
  dispatch(action: EditorAction): void;
  subscribe(listener: () => void): () => void;
  setStatus(text: string): void;
  /** Wired by the app to the run controller's cancel(); the store calls it before a tab switch during a run (5.5). */
  setCancelHook(hook: () => void): void;
};

export type StoreDeps = { hash: typeof scenarioHash; now: () => string; prefs?: Prefs; initial?: { scenarios: Scenario[]; tabKeys: string[] } };

export function createEditorStore(deps: StoreDeps): EditorStore {
  let state: EditorState = initialState({
    scenarios: deps.initial?.scenarios ?? [],
    tabKeys: deps.initial?.tabKeys ?? [],
    ...(deps.prefs === undefined ? {} : { prefs: deps.prefs }),
    screen: deps.initial === undefined ? 'landing' : 'plan',
  });
  const listeners = new Set<() => void>();
  const pending = new Map<number, number>();
  let cancelHook: () => void = () => undefined;

  const emit = (): void => listeners.forEach((l) => l());

  const requestHashes = (): void => {
    state.scenarios.forEach((scenario, tabIndex) => {
      if (state.hashes[tabIndex] !== null || pending.get(tabIndex) === scenario.revision) return;
      pending.set(tabIndex, scenario.revision);
      void deps.hash(scenario).then(
        (hash) => {
          if (pending.get(tabIndex) === scenario.revision) pending.delete(tabIndex);
          dispatch({ type: 'hash/computed', tabIndex, revision: scenario.revision, hash });
        },
        () => {
          if (pending.get(tabIndex) === scenario.revision) pending.delete(tabIndex);
        },
      );
    });
  };

  function dispatch(input: EditorAction): void {
    const action: EditorAction = input.type === 'run/result' && input.completedAt === undefined ? { ...input, completedAt: deps.now() } : input;
    if (action.type === 'scenario/select-tab' && (state.run.status === 'running' || state.run.status === 'cancelling') && action.index !== state.currentIndex) {
      cancelHook();
    }
    const prev = state;
    let next = reduce(prev, action);
    const text = announcement(prev, action, next);
    if (text !== null && text !== next.status) next = reduce(next, { type: 'status/set', text });
    if (next === prev) return;
    state = next;
    emit();
    requestHashes();
  }

  const store: EditorStore = {
    getState: () => state,
    dispatch,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setStatus: (text) => dispatch({ type: 'status/set', text }),
    setCancelHook(hook) {
      cancelHook = hook;
    },
  };
  requestHashes();
  return store;
}
