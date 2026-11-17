import { cleanup, render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import type { Scenario } from '../../src/domain/scenario';
import type { Prefs } from '../../src/storage/prefs';
import { createEditorStore, type EditorStore } from '../../src/ui/state/store';
import { TAB_KEYS, harborHall } from './generators';

// Without Vitest globals, Testing Library cannot register its own cleanup.
afterEach(() => cleanup());

/** A store over the three Harbor Hall scenarios (or the given ones); hashes are computed with the real scenarioHash. */
export function makeStore(scenarios?: Scenario[], tabKeys?: string[], prefs?: Prefs): EditorStore {
  const { baseline, plusOne, shorter } = harborHall();
  const list = scenarios ?? [baseline, plusOne, shorter];
  return createEditorStore({
    hash: scenarioHash,
    now: () => '2026-11-16T00:00:00.000Z',
    prefs,
    initial: { scenarios: list, tabKeys: tabKeys ?? (scenarios === undefined ? [...TAB_KEYS] : list.map((s) => s.id)) },
  });
}

/** A store that has loaded nothing: it starts on the landing screen. */
export function makeLandingStore(): EditorStore {
  return createEditorStore({ hash: scenarioHash, now: () => '2026-11-16T00:00:00.000Z' });
}

export function renderWith(store: EditorStore, build: (store: EditorStore) => ReactElement): RenderResult {
  return render(build(store));
}
