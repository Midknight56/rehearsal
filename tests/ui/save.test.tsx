// @vitest-environment jsdom
// Task 19, requirements 10.3 to 10.7: Save and its failure block, saved scenarios on the landing screen, Open JSON.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SAVED_SCENARIO_LIMIT } from '../../src/comparison/summary';
import { saveErrorText } from '../../src/comparison/labels';
import { SCENARIOS_KEY, type SavedScenario } from '../../src/storage/scenarios';
import { Landing } from '../../src/ui/landing/Landing';
import { OpenJson } from '../../src/ui/import/OpenJson';
import { SaveBar } from '../../src/ui/SaveBar';
import { createSavedScenarios } from '../../src/ui/saved';
import { SaveError } from '../../src/ui/SaveError';
import type { EditorStore } from '../../src/ui/state/store';
import { harborHall } from './generators';
import { makeLandingStore, makeStore, renderWith } from './render';

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  failSet: string | null = null;
  failGet = false;
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null {
    if (this.failGet) throw new DOMException('denied', 'SecurityError');
    return this.data.get(key) ?? null;
  }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void {
    if (this.failSet !== null) throw new DOMException('failed', this.failSet);
    this.data.set(key, value);
  }
}

const TITLE = 'Harbor Hall Community Fair: baseline';

async function ready(store: EditorStore): Promise<void> {
  await waitFor(() => expect(store.getState().hashes.every((h) => h !== null)).toBe(true));
}

function mountBar(): { store: EditorStore; storage: MemoryStorage; saved: ReturnType<typeof createSavedScenarios> } {
  const store = makeStore();
  const storage = new MemoryStorage();
  const saved = createSavedScenarios(store, storage);
  renderWith(store, (s) => (
    <>
      <SaveBar store={s} saved={saved} />
      <SaveError store={s} onRetry={() => void saved.save()} />
    </>
  ));
  return { store, storage, saved };
}

describe('10.3 Save', () => {
  it('writes the bare scenario newest first, replaces the same id and announces the count', async () => {
    const { store, storage } = mountBar();
    await ready(store);
    fireEvent.click(screen.getByTestId('save-scenario'));
    await waitFor(() => expect(store.getState().status).toBe(`Saved "${TITLE}" (1 of ${SAVED_SCENARIO_LIMIT}).`));
    const raw = JSON.parse(storage.getItem(SCENARIOS_KEY) as string) as { version: number; scenarios: SavedScenario[] };
    expect(raw.version).toBe(1);
    expect(Object.keys(raw.scenarios[0] as object).sort()).toEqual(['hash', 'id', 'savedAt', 'scenario', 'title']);
    expect(raw.scenarios[0]?.scenario.schemaVersion).toBe(1);
    expect(raw.scenarios[0]?.hash).toBe(store.getState().hashes[0]);
    expect(storage.getItem(SCENARIOS_KEY)).not.toContain('"trace"');
    fireEvent.click(screen.getByTestId('save-scenario'));
    await waitFor(() => expect(store.getState().status).toBe(`Saved "${TITLE}" (1 of ${SAVED_SCENARIO_LIMIT}).`));
    expect((JSON.parse(storage.getItem(SCENARIOS_KEY) as string) as { scenarios: unknown[] }).scenarios).toHaveLength(1);
  });
});

describe('10.4 and 10.5 a failed save', () => {
  it('shows saveErrorText(quota) with the three recovery controls, leaves memory untouched and retry works', async () => {
    const { store, storage } = mountBar();
    await ready(store);
    act(() => store.dispatch({ type: 'station/set', id: 'checkin', patch: { servers: 3 } }));
    await ready(store);
    const before = structuredClone({ ...store.getState(), status: '', storage: null });
    storage.failSet = 'QuotaExceededError';
    fireEvent.click(screen.getByTestId('save-scenario'));
    await waitFor(() => expect(screen.getByTestId('save-error').textContent).toBe(saveErrorText('quota')));
    expect(saveErrorText('quota')).toBe('Could not save: storage quota exceeded.');
    expect(store.getState().status).toBe(saveErrorText('quota'));
    expect(screen.getByTestId('retry-save')).toBeTruthy();
    expect(screen.getByTestId('download-scenario-json')).toBeTruthy();
    expect(screen.queryByTestId('download-comparison-csv')).toBeNull();
    expect(structuredClone({ ...store.getState(), status: '', storage: null })).toEqual(before);
    expect(storage.getItem(SCENARIOS_KEY)).toBeNull();

    storage.failSet = null;
    fireEvent.click(screen.getByTestId('retry-save'));
    await waitFor(() => expect(screen.queryByTestId('save-error')).toBeNull());
    expect(store.getState().status).toBe(`Saved "${TITLE}" (1 of ${SAVED_SCENARIO_LIMIT}).`);
  });

  it('refuses an eleventh scenario with the limit reason and writes nothing', async () => {
    const { store, storage } = mountBar();
    await ready(store);
    const { baseline } = harborHall();
    const entries: SavedScenario[] = Array.from({ length: SAVED_SCENARIO_LIMIT }, (_, i) => ({
      id: `other-${i}`, title: `Other ${i}`, savedAt: '2026-11-16T10:00:00.000Z', hash: 'a'.repeat(64), scenario: { ...baseline, id: `other-${i}` },
    }));
    storage.setItem(SCENARIOS_KEY, JSON.stringify({ version: 1, scenarios: entries }));
    const raw = storage.getItem(SCENARIOS_KEY);
    fireEvent.click(screen.getByTestId('save-scenario'));
    await waitFor(() => expect(screen.getByTestId('save-error').textContent).toBe(saveErrorText('limit')));
    expect(saveErrorText('limit')).toBe('Could not save: 10 saved scenarios already; delete one first.');
    expect(storage.getItem(SCENARIOS_KEY)).toBe(raw);
  });

  it('maps unavailable storage to its reason', async () => {
    const store = makeStore();
    const saved = createSavedScenarios(store, null);
    renderWith(store, (s) => (<><SaveBar store={s} saved={saved} /><SaveError store={s} onRetry={() => void saved.save()} /></>));
    await ready(store);
    fireEvent.click(screen.getByTestId('save-scenario'));
    await waitFor(() => expect(screen.getByTestId('save-error').textContent).toBe(saveErrorText('unavailable')));
  });
});

describe('10.1 and 10.6 saved scenarios on the landing screen', () => {
  const saveOne = async (): Promise<{ store: EditorStore; storage: MemoryStorage }> => {
    const first = mountBar();
    await ready(first.store);
    fireEvent.click(screen.getByTestId('save-scenario'));
    await waitFor(() => expect(first.store.getState().status).toContain('Saved'));
    document.body.innerHTML = '';
    return { store: first.store, storage: first.storage };
  };

  it('offers Open a saved scenario only when one is saved, opens it, and asks before deleting', async () => {
    const { storage } = await saveOne();
    const store = makeLandingStore();
    const saved = createSavedScenarios(store, storage);
    saved.refresh();
    renderWith(store, (s) => <Landing store={s} saved={saved} />);
    expect(screen.getByRole('button', { name: 'Open a saved scenario' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open a saved scenario' }));
    const list = screen.getByRole('list', { name: 'Saved scenarios' });
    fireEvent.click(within(list).getByRole('button', { name: `Delete ${TITLE}` }));
    expect(screen.getByText(`Delete "${TITLE}" from this browser?`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(storage.getItem(SCENARIOS_KEY)).toContain(TITLE);
    fireEvent.click(within(list).getByRole('button', { name: `Open ${TITLE}` }));
    await waitFor(() => expect(store.getState().screen).toBe('plan'));
    expect(store.getState().scenario.title).toBe(TITLE);
  });

  it('deletes only after the confirmation, and the button disappears with the last entry', async () => {
    const { storage } = await saveOne();
    const store = makeLandingStore();
    const saved = createSavedScenarios(store, storage);
    saved.refresh();
    renderWith(store, (s) => <Landing store={s} saved={saved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open a saved scenario' }));
    fireEvent.click(screen.getByRole('button', { name: `Delete ${TITLE}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open a saved scenario' })).toBeNull());
    expect((JSON.parse(storage.getItem(SCENARIOS_KEY) as string) as { scenarios: unknown[] }).scenarios).toEqual([]);
  });

  it('hides the button when nothing is saved and reads unreadable storage as empty with one message', () => {
    const store = makeLandingStore();
    const storage = new MemoryStorage();
    storage.failGet = true;
    const saved = createSavedScenarios(store, storage);
    saved.refresh();
    renderWith(store, (s) => <Landing store={s} saved={saved} />);
    expect(screen.queryByRole('button', { name: 'Open a saved scenario' })).toBeNull();
    expect(store.getState().storage.unreadable).toBe(true);
    expect(store.getState().status).toBe('Saved scenarios could not be read; starting with none.');
    act(() => store.setStatus('something else'));
    saved.refresh();
    expect(store.getState().status).toBe('something else');
  });

  it('offers Open a scenario JSON beside Import on the landing screen', () => {
    renderWith(makeLandingStore(), (s) => <Landing store={s} />);
    expect(screen.getByLabelText('Open a scenario JSON')).toBeTruthy();
    expect(screen.getByTestId('import-json').getAttribute('type')).toBe('file');
  });
});

describe('10.7 Open JSON', () => {
  const text = (value: unknown): File => new File([JSON.stringify(value)], 'scenario.json', { type: 'application/json' });
  const choose = (file: File): void => {
    const input = screen.getByTestId('import-json') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
  };

  it('previews title, hash8 and model, then Open replaces the current tab as one committed edit', async () => {
    const store = makeStore();
    await ready(store);
    renderWith(store, (s) => <OpenJson store={s} label="Open JSON" />);
    const incoming = { ...harborHall().plusOne };
    const pastBefore = store.getState().past[0]?.length ?? 0;
    choose(text(incoming));
    await screen.findByText(new RegExp(`^${incoming.title}, hash [0-9a-f]{8}, model 0\\.1\\.0$`));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(store.getState().scenario.title).toBe(incoming.title));
    expect(store.getState().past[0]?.length).toBe(pastBefore + 1);
    expect(store.getState().status).toBe(`Opened "${incoming.title}".`);
  });

  it('shows the MODEL_VERSION_MISMATCH warning verbatim and changes nothing on Cancel', async () => {
    const store = makeStore();
    await ready(store);
    renderWith(store, (s) => <OpenJson store={s} label="Open JSON" />);
    const before = store.getState().scenario;
    choose(text({ ...harborHall().baseline, modelVersion: '0.2.0' }));
    await screen.findByText('This scenario was saved with model version 0.2.0; the engine is 0.1.0. Results may differ from the saved export.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(store.getState().scenario).toBe(before);
  });

  it('shows the refusal message for {} and offers no Open button', async () => {
    const store = makeStore();
    await ready(store);
    renderWith(store, (s) => <OpenJson store={s} label="Open JSON" />);
    choose(text({}));
    await screen.findByText('This file is not a Rehearsal scenario export (expected "format": "rehearsal-scenario") or a bare scenario (expected "schemaVersion": 1).');
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
  });
});
