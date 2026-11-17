// window.__rehearsal, installed only in the test build (VITE_REHEARSAL_TEST === '1'). The production build never loads this
// module. storage.failNextWrite is added by task 19.
import { validateScenario } from '../domain/validate';
import { forceRendererFailure } from '../replay/gameView';
import type { GameViewHandle } from '../replay/gameView';
import { registeredView, requestRestart } from './game/viewRegistry';
import type { EditorStore } from './state/store';

export type RehearsalHook = {
  /** Replace the current tab's scenario with the scenario in this JSON text (one committed edit). */
  loadScenario(json: string): void;
  /** The game view handle of the page (its `debug()` reports `unavailable` when the canvas could not start). */
  gameView(): Pick<GameViewHandle, 'debug'> & Partial<GameViewHandle>;
  /** Makes game view creation fail as `?renderer=off` does; with true the showing view is restarted so the failure shows. */
  forceRendererFailure(on: boolean): void;
  /** The JSON text of the RunResult of the tab with this key, trace included (the byte-identity case of 6.3). */
  lastResultJson(tabKey: string): string;
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
    gameView: () => registeredView(),
    forceRendererFailure(on) {
      forceRendererFailure(on);
      if (on) requestRestart();
    },
    lastResultJson(tabKey) {
      const state = store.getState();
      const results = state.results[state.tabKeys.indexOf(tabKey)];
      if (results === undefined || results.status === 'none') throw new Error(`No results for the tab "${tabKey}".`);
      return JSON.stringify(results.result);
    },
  };
}