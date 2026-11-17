// Saved scenarios (requirements 10.3 to 10.6): Save, list, open and delete over createScenarioStore, with the bound taken from
// SAVED_SCENARIO_LIMIT. A failed save changes only storage.saveError and the status text; the scenario, results and undo
// stacks are never touched. The UI never writes a save-failure sentence of its own: it uses saveErrorText(reason).
import { saveErrorText } from '../comparison/labels';
import { SAVED_SCENARIO_LIMIT } from '../comparison/summary';
import { scenarioHash } from '../domain/hash';
import { createScenarioStore } from '../storage/scenarios';
import type { EditorStore } from './state/store';

export const UNREADABLE_TEXT = 'Saved scenarios could not be read; starting with none.';

export type SavedScenarios = {
  /** Reads the saved list into the store; announces an unreadable store once. */
  refresh(): void;
  /** Saves the current tab; true when the write succeeded. */
  save(): Promise<boolean>;
  open(id: string): boolean;
  remove(id: string): boolean;
};

export function createSavedScenarios(store: EditorStore, storage: Storage | null, now: () => string = () => new Date().toISOString()): SavedScenarios {
  const scenarios = createScenarioStore(storage, { maxSaved: SAVED_SCENARIO_LIMIT });
  let announcedUnreadable = false;

  const refresh = (): void => {
    const listed = scenarios.list();
    if (listed.ok) {
      store.dispatch({ type: 'storage/listed', saved: listed.items, unreadable: false });
      return;
    }
    store.dispatch({ type: 'storage/listed', saved: [], unreadable: true });
    if (!announcedUnreadable) {
      announcedUnreadable = true;
      store.setStatus(UNREADABLE_TEXT);
    }
  };

  return {
    refresh,
    async save() {
      const scenario = store.getState().scenario;
      const hash = store.getState().hash ?? (await scenarioHash(scenario));
      const result = scenarios.save({ id: scenario.id, title: scenario.title, savedAt: now(), hash, scenario });
      if (!result.ok) {
        store.dispatch({ type: 'storage/save-failed', reason: result.reason });
        store.setStatus(saveErrorText(result.reason));
        return false;
      }
      store.dispatch({ type: 'storage/save-ok' });
      refresh();
      store.setStatus(`Saved "${scenario.title}" (${result.count} of ${SAVED_SCENARIO_LIMIT}).`);
      return true;
    },
    open(id) {
      const loaded = scenarios.load(id);
      if (!loaded.ok) {
        store.setStatus('That saved scenario could not be read.');
        return false;
      }
      store.dispatch({ type: 'scenario/open', scenario: loaded.scenario });
      store.dispatch({ type: 'screen/set', screen: 'plan' });
      store.setStatus(`Opened "${loaded.scenario.title}".`);
      return true;
    },
    remove(id) {
      const title = store.getState().storage.saved.find((s) => s.id === id)?.title ?? id;
      const result = scenarios.remove(id);
      if (!result.ok) {
        store.setStatus(saveErrorText(result.reason));
        return false;
      }
      refresh();
      store.setStatus(`Deleted "${title}" from this browser.`);
      return true;
    },
  };
}