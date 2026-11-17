// window.__rehearsal, installed only in the test build (VITE_REHEARSAL_TEST === '1'). The production build never loads this
// module. gameView, forceRendererFailure and lastResultJson are added by task 11, storage.failNextWrite by task 19.
import { validateScenario } from '../domain/validate';
import type { EditorStore } from './state/store';

export type RehearsalHook = {
  /** Replace the current tab's scenario with the scenario in this JSON text (one committed edit). */
  loadScenario(json: string): void;
};

declare global {
  interface Window {
    __rehearsal?: RehearsalHook;
  }
}

export function installTestHook(store: EditorStore): void {
  window.__rehearsal = {
    loadScenario(json) {
      const result = validateScenario(JSON.parse(json));
      if (!result.ok) throw new Error(result.issues[0]?.message ?? 'Scenario is invalid.');
      store.dispatch({ type: 'scenario/open', scenario: result.scenario });
    },
  };
}
