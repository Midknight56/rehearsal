// The landing screen (requirement 10.1): no splash, no modal, no login. The first Tab stop is Try the community fair.
import { useRef, useState, type ReactElement } from 'react';
import { OpenJson } from '../import/OpenJson';
import type { SavedScenarios } from '../saved';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';
import { loadExample } from './loadExample';
import { TopBar } from '../TopBar';

export function Landing(props: { store: EditorStore; saved?: SavedScenarios; fetchImpl?: typeof fetch; baseUrl?: string; onImport?: () => void }): ReactElement {
  const { store, saved } = props;
  const state = useEditorState(store);
  const loading = useRef(false);
  const [listOpen, setListOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const items = state.storage.saved;
  const showList = listOpen && items.length > 0;

  const tryFair = async (): Promise<void> => {
    if (loading.current) return;
    loading.current = true;
    const fetchImpl: typeof fetch = props.fetchImpl ?? ((input, init) => fetch(input, init));
    const result = await loadExample(fetchImpl, props.baseUrl ?? import.meta.env.BASE_URL);
    loading.current = false;
    if (result.ok) store.dispatch({ type: 'workspace/load', scenarios: result.scenarios, tabKeys: result.tabKeys });
    else store.setStatus(result.message);
  };

  const confirmed = items.find((item) => item.id === confirming);

  return (
    <>
    <TopBar />
    <main className="landing">
      <h1>Rehearsal</h1>
      <p>A spreadsheet, a floor plan and a game engine, stitched into an event rehearsal.</p>
      <p>Everything runs in this browser.</p>
      <div className="actions">
        <button type="button" className="primary" data-testid="try-community-fair" onClick={() => void tryFair()}>Try the community fair</button>
        <button
          type="button"
          onClick={() => {
            store.dispatch({ type: 'screen/set', screen: 'plan' });
            store.dispatch({ type: 'import/open' });
            props.onImport?.();
          }}
        >
          Import a spreadsheet or CSV
        </button>
        <OpenJson store={store} label="Open a scenario JSON" />
        {saved !== undefined && items.length > 0 ? (
          <button type="button" aria-expanded={showList} onClick={() => setListOpen((open) => !open)}>Open a saved scenario</button>
        ) : null}
      </div>
      {saved === undefined || !showList ? null : (
        <section aria-labelledby="saved-heading">
          <h2 id="saved-heading">Saved in this browser</h2>
          <ul aria-label="Saved scenarios">
            {items.map((item) => (
              <li key={item.id}>
                <span>{`${item.title} (saved ${item.savedAt.slice(0, 10)}, hash ${item.hash.slice(0, 8)})`}</span>{' '}
                <button type="button" aria-label={`Open ${item.title}`} onClick={() => saved.open(item.id)}>Open</button>{' '}
                <button type="button" aria-label={`Delete ${item.title}`} onClick={() => setConfirming(item.id)}>Delete</button>
              </li>
            ))}
          </ul>
          {confirmed === undefined ? null : (
            <div role="group" aria-label="Confirm delete">
              <p>{`Delete "${confirmed.title}" from this browser?`}</p>
              <button type="button" onClick={() => { saved.remove(confirmed.id); setConfirming(null); }}>Delete</button>{' '}
              <button type="button" onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          )}
        </section>
      )}
    </main>
    </>
  );
}