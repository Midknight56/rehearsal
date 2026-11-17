// The landing screen (requirement 10.1): no splash, no modal, no login. The first Tab stop is Try the community fair.
import { useRef, type ReactElement } from 'react';
import type { EditorStore } from '../state/store';
import { loadExample } from './loadExample';

export function Landing(props: { store: EditorStore; fetchImpl?: typeof fetch; baseUrl?: string; onImport?: () => void }): ReactElement {
  const { store } = props;
  const loading = useRef(false);

  const tryFair = async (): Promise<void> => {
    if (loading.current) return;
    loading.current = true;
    const fetchImpl: typeof fetch = props.fetchImpl ?? ((input, init) => fetch(input, init));
    const result = await loadExample(fetchImpl, props.baseUrl ?? import.meta.env.BASE_URL);
    loading.current = false;
    if (result.ok) store.dispatch({ type: 'workspace/load', scenarios: result.scenarios, tabKeys: result.tabKeys });
    else store.setStatus(result.message);
  };

  return (
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
      </div>
    </main>
  );
}
